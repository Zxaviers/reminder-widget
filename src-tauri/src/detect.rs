//! Opt-in submission auto-detection.
//!
//! When enabled, the widget asks this module to peek at each future task's
//! BRONE assignment page. A hidden webview shares the default session, so if
//! the user logged in through the assisted login (and the session is alive)
//! the assign page renders authenticated; an injected script reports the
//! submission status through `document.title` (`RWCHK:<verdict>`), which we
//! poll — same title-channel trick as brone_login.
//!
//! Verdicts: "yes" (submitted), "no" (explicitly not submitted),
//! "login" (redirected to SSO — session dead), "unknown" (page shape changed
//! or timed out). Only "yes" changes anything; the rest just update the
//! last-checked timestamp on the renderer side.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const LABEL: &str = "checker";
const RESULT_PREFIX: &str = "RWCHK:";
const PAGE_TIMEOUT: Duration = Duration::from_secs(12);
const BETWEEN_PAGES: Duration = Duration::from_millis(400);

static RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub url: String,
    /// "yes" | "no" | "login" | "unknown"
    pub status: String,
}

/// Injected on every poll: reports verdict via document.title. "loading"
/// keeps the poll alive until the page is ready or the timeout hits.
const CHECK_JS: &str = r#"
(function () {
  try {
    if (!/brone\.ub\.ac\.id$/.test(location.hostname)) { document.title = 'RWCHK:unknown'; return; }
    if (/\/login\//.test(location.pathname)) { document.title = 'RWCHK:login'; return; }
    if (document.readyState !== 'complete') { document.title = 'RWCHK:loading'; return; }
    var t = (document.body && document.body.innerText) || '';
    if (/Submitted for grading|Diserahkan untuk penilaian/i.test(t)) { document.title = 'RWCHK:yes'; return; }
    if (/Draft \(not submitted\)|Draf \(tidak diserahkan\)|Nothing has been submitted|Belum ada yang diserahkan/i.test(t)) { document.title = 'RWCHK:no'; return; }
    document.title = 'RWCHK:loading';
  } catch (e) { document.title = 'RWCHK:unknown'; }
})();
"#;

/// Run one detection batch over `urls` (already filtered + rate-limited by the
/// renderer). Emits `submission-checked` per URL. No-op while a batch runs.
pub async fn run_check(app: AppHandle, urls: Vec<String>) -> Result<(), String> {
    if urls.is_empty() {
        return Ok(());
    }
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("check already running".into());
    }
    let result = run_inner(app, urls).await;
    RUNNING.store(false, Ordering::SeqCst);
    result
}

async fn run_inner(app: AppHandle, urls: Vec<String>) -> Result<(), String> {
    // Window creation must happen on the main thread (see brone_login).
    let build_app = app.clone();
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let _ = app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            if let Some(existing) = build_app.get_webview_window(LABEL) {
                let _ = existing.show();
                return Ok(());
            }
            WebviewWindowBuilder::new(
                &build_app,
                LABEL,
                WebviewUrl::App("checker.html".into()),
            )
            .title("Reminder Widget — Checker")
            .inner_size(420.0, 320.0)
            .visible(false)
            .skip_taskbar(true)
            .build()
            .map(|_| ())
            .map_err(|e| e.to_string())
        })();
        let _ = tx.send(result);
    });
    rx.recv().map_err(|_| "main thread unavailable".to_string())??;

    for url in urls {
        let Some(win) = app.get_webview_window(LABEL) else { break };
        let parsed = match tauri::Url::parse(&url) {
            Ok(u) => u,
            Err(_) => continue,
        };
        if win.navigate(parsed).is_err() {
            continue;
        }

        let deadline = Instant::now() + PAGE_TIMEOUT;
        let mut status = "unknown".to_string();
        loop {
            tokio::time::sleep(Duration::from_millis(600)).await;
            let Some(win) = app.get_webview_window(LABEL) else { return Ok(()) };
            let _ = win.eval(CHECK_JS);
            if let Ok(title) = win.title() {
                if let Some(verdict) = title.strip_prefix(RESULT_PREFIX) {
                    let verdict = verdict.trim();
                    if verdict == "loading" {
                        if Instant::now() >= deadline {
                            break;
                        }
                        continue;
                    }
                    status = verdict.to_string();
                }
            }
            if Instant::now() >= deadline {
                break;
            }
        }

        let _ = app.emit("submission-checked", CheckResult { url, status });
        tokio::time::sleep(BETWEEN_PAGES).await;
    }

    // Done: tuck the checker away. The window stays alive so the next batch
    // reuses it (and its warm WebView2 process).
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.hide();
    }
    Ok(())
}
