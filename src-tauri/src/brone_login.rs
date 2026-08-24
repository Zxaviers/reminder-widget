//! Interactive in-app BRONE (Universitas Brawijaya Moodle) login window.
//!
//! Port of v1's broneAuth.js. No credentials are ever captured — the window
//! just carries the user through UB's SSO, then drives the calendar-export
//! page until it can lift the personal `export_execute.php?…authtoken=…`
//! URL out of it.
//!
//! v1 used `executeJavaScript` and read the return value; Tauri's `eval`
//! cannot return values, so the injected script reports its finding through
//! `document.title` (`RW_RESULT:<url>`), which this module polls.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const LOGIN_URL: &str = "https://brone.ub.ac.id/login/index.php";
const EXPORT_URL: &str = "https://brone.ub.ac.id/calendar/export.php";
const HOST: &str = "brone.ub.ac.id";
const RESULT_PREFIX: &str = "RW_RESULT:";
const LABEL: &str = "brone-login";

/// Desktop Chrome UA so Cloudflare/SSO does not bounce the embedded webview.
const CHROME_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Mirrors v1's extraction script: find an existing export link, otherwise
/// fill+submit the form so the link appears, then report via document.title.
const EXTRACT_JS: &str = r#"
(function () {
  try {
    var links = Array.prototype.slice.call(
      document.querySelectorAll('a[href*="export_execute.php"], input[value*="export_execute.php"], textarea')
    );
    for (var i = 0; i < links.length; i++) {
      var el = links[i];
      var val = el.href || el.value || el.textContent || '';
      if (val.indexOf('export_execute.php') !== -1 && val.indexOf('authtoken=') !== -1) {
        var m = val.match(/https:\/\/brone\.ub\.ac\.id\/calendar\/export_execute\.php[^\s"']+/);
        if (m) { document.title = 'RW_RESULT:' + m[0]; return; }
      }
    }
    var form = document.querySelector('form[action*="export.php"]');
    if (form) {
      var all = form.querySelector('input[name*="exportevents"][value="all"]');
      if (all) all.checked = true;
      var period = form.querySelector('input[name*="timeperiod"][value="recentupcoming"]')
                || form.querySelector('input[name*="timeperiod"][value="month"]');
      if (period) period.checked = true;
      var btn = form.querySelector('button[name="generateurl"], input[name="generateurl"]');
      if (btn) btn.click();
    }
    var text = (document.body && document.body.innerText) || '';
    var t = text.match(/https:\/\/brone\.ub\.ac\.id\/calendar\/export_execute\.php[^\s"']+/);
    if (t && t[0].indexOf('authtoken=') !== -1) document.title = 'RW_RESULT:' + t[0];
  } catch (e) { /* page not ready; next poll retries */ }
})();
"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginOutcome {
    pub ok: bool,
    pub url: Option<String>,
    pub canceled: bool,
    pub message: Option<String>,
}

impl LoginOutcome {
    fn success(url: String) -> Self {
        Self { ok: true, url: Some(url), canceled: false, message: None }
    }
    fn canceled() -> Self {
        Self { ok: false, url: None, canceled: true, message: Some("Proses login ditutup oleh pengguna.".into()) }
    }
    fn failed(message: &str) -> Self {
        Self { ok: false, url: None, canceled: false, message: Some(message.into()) }
    }
}

fn validate_export_url(raw: &str) -> Option<String> {
    let parsed = tauri::Url::parse(raw.trim()).ok()?;
    if parsed.host_str() != Some(HOST) || !parsed.path().contains("export_execute.php") {
        return None;
    }
    let (_, token) = parsed.query_pairs().find(|(k, _)| k == "authtoken")?;
    if token.trim().is_empty() {
        return None;
    }
    Some(parsed.to_string())
}

struct Shared(Mutex<Option<String>>);

static TRIGGERED: AtomicBool = AtomicBool::new(false);

/// Opens the login window and resolves once a URL was captured, the user
/// closed the window, or the flow timed out (~3 min).
pub async fn start(app: AppHandle) -> LoginOutcome {
    // A previous run's window must not linger.
    if let Some(old) = app.get_webview_window(LABEL) {
        let _ = old.close();
    }
    // manage() never replaces existing state, so the capture slot is shared
    // through an Arc owned by this call instead.
    let shared = Arc::new(Shared(Mutex::new(None)));
    TRIGGERED.store(false, Ordering::SeqCst);

    let nav_shared = shared.clone();
    let nav_app = app.clone();
    let build_result = WebviewWindowBuilder::new(
        &app,
        LABEL,
        WebviewUrl::External(LOGIN_URL.parse().unwrap()),
    )
    .title("Memuat Login BRONE - Universitas Brawijaya...")
    .inner_size(700.0, 760.0)
    .min_inner_size(520.0, 600.0)
    .always_on_top(true)
    .user_agent(CHROME_USER_AGENT)
    .on_navigation(move |url| {
        // Only the first navigation past /login/ kicks off extraction.
        let past_login = url.host_str() == Some(HOST) && !url.path().contains("/login/");
        if !past_login || TRIGGERED.swap(true, Ordering::SeqCst) {
            return true;
        }
        let app = nav_app.clone();
        let shared = nav_shared.clone();
        let on_export = url.as_str().contains("/calendar/export.php");
        tauri::async_runtime::spawn(async move { run_extraction(app, shared, on_export).await });
        true
    })
    .build();

    if build_result.is_err() {
        return LoginOutcome::failed("Gagal membuka jendela login.");
    }

    // Wait for capture / manual close / timeout. Order matters: extraction
    // stores the URL *before* closing the window, so a vanished window while
    // the slot is still empty means the user dismissed it.
    let deadline = Instant::now() + Duration::from_secs(180);
    loop {
        tokio::time::sleep(Duration::from_millis(400)).await;
        if let Some(url) = shared.0.lock().unwrap().clone() {
            return LoginOutcome::success(url);
        }
        if app.get_webview_window(LABEL).is_none() {
            return LoginOutcome::canceled();
        }
        if Instant::now() >= deadline {
            if let Some(win) = app.get_webview_window(LABEL) {
                let _ = win.close();
            }
            return LoginOutcome::failed(
                "Waktu login habis. Coba lagi atau tempel URL kalender secara manual.",
            );
        }
    }
}

async fn run_extraction(app: AppHandle, shared: Arc<Shared>, already_on_export: bool) {
    const POLL: Duration = Duration::from_millis(800);
    const OVERALL: Duration = Duration::from_secs(60);

    let started = Instant::now();
    tokio::time::sleep(Duration::from_millis(600)).await;

    // Session cookie now exists: head for the export page.
    if !already_on_export {
        if let Some(win) = app.get_webview_window(LABEL) {
            let _ = win.eval(format!("location.href='{EXPORT_URL}';"));
        }
        tokio::time::sleep(Duration::from_millis(900)).await;
    }

    while started.elapsed() < OVERALL {
        let Some(win) = app.get_webview_window(LABEL) else { return };
        let _ = win.eval(EXTRACT_JS);
        tokio::time::sleep(POLL).await;

        // Re-fetch the handle so the title read lands on the same window the
        // eval above wrote to.
        if let Some(win) = app.get_webview_window(LABEL) {
            if let Ok(title) = win.title() {
                if let Some(raw) = title.strip_prefix(RESULT_PREFIX) {
                    if let Some(url) = validate_export_url(raw) {
                        *shared.0.lock().unwrap() = Some(url.clone());
                        let _ = win.set_title("Login Berhasil!");
                        let _ = win.close();
                        return;
                    }
                }
            }
        }
    }
}
