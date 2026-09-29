//! IPC surface mirroring v1's preload.js bridge. The renderer owns feed
//! fetching/parsing; these commands cover everything needing native access:
//! persistence, secrets, window geometry/lifecycle, tray, notifications,
//! external links and the BRONE login flow.

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg(desktop)]
use crate::brone_login;
use crate::settings;

pub const WINDOW_WIDTH: f64 = 360.0;
pub const WINDOW_MIN_HEIGHT: f64 = 132.0;
pub const WINDOW_MAX_HEIGHT: f64 = 720.0;
pub const SCREEN_MARGIN: f64 = 16.0;
pub const DEFAULT_HEIGHT: f64 = 420.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginOutcome {
    pub ok: bool,
    pub url: Option<String>,
    pub canceled: bool,
    pub message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedUrlInfo {
    url: Option<String>,
    /// "keyring-full" | "env-var" | "none" ("full" = unmasked payload present)
    source: &'static str,
}

/// Non-secret feed row for the renderer. The URL itself never leaves Rust
/// except via `feed_url_get_full` (form prefill) or masked display.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedInfo {
    id: String,
    kind: String,
    label: String,
    enabled: bool,
    has_secret: bool,
    /// "secret" | "env-var" | "none"
    source: &'static str,
}

fn env_feed_url() -> Option<String> {
    std::env::var("CALENDAR_FEED_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            std::env::var("BRONE_ICS_URL").ok().filter(|v| !v.trim().is_empty())
        })
}

/// True when neither the credential store nor the environment supplies a feed.
pub fn env_feed_url_for_setup() -> bool {
    std::env::var_os("CALENDAR_FEED_URL").is_none()
        && std::env::var_os("BRONE_ICS_URL").is_none()
}

// ------------------------------------------------------------------- window

/// Default spot: top-right corner of the primary work area (matches v1).
pub fn default_bounds(app: &AppHandle) -> (i32, i32) {
    let (mut x, mut y, mut width) = (0i32, 0i32, 1280i32);
    if let Ok(monitors) = app.available_monitors() {
        if let Some(primary) = monitors.first() {
            let pos = primary.position();
            let size = primary.size();
            x = pos.x;
            y = pos.y;
            width = size.width as i32;
        }
    }
    (
        x + width - WINDOW_WIDTH as i32 - SCREEN_MARGIN as i32,
        y + SCREEN_MARGIN as i32,
    )
}

/// Keep the widget on a display that still exists (monitor unplugged, …).
pub fn clamp_bounds(app: &AppHandle, b: settings::Bounds) -> settings::Bounds {
    let mut best: Option<(i32, i32, u32, u32)> = None;
    if let Ok(monitors) = app.available_monitors() {
        let cx = b.x + (b.width / 2.0) as i32;
        let cy = b.y + (b.height / 2.0) as i32;
        let center = (cx, cy);
        let hit = monitors
            .iter()
            .find(|m| {
                let p = m.position();
                let s = m.size();
                center.0 >= p.x && center.0 < p.x + s.width as i32 && center.1 >= p.y && center.1 < p.y + s.height as i32
            })
            .or_else(|| monitors.first());
        if let Some(m) = hit {
            let p = m.position();
            let s = m.size();
            best = Some((p.x, p.y, s.width, s.height));
        }
    }
    let Some((mx, my, mw, mh)) = best else { return b };
    let width = WINDOW_WIDTH;
    let height = b.height.clamp(WINDOW_MIN_HEIGHT, WINDOW_MAX_HEIGHT);
    settings::Bounds {
        x: (b.x).clamp(mx, mx + mw as i32 - width as i32),
        y: (b.y).clamp(my, my + mh as i32 - height as i32),
        width,
        height,
    }
}

#[tauri::command]
pub fn widget_autosize(app: AppHandle, height: f64) {
    let Some(win) = app.get_webview_window("widget") else { return };
    let Ok(scale) = win.scale_factor() else { return };
    let target = (height * scale).round().clamp(WINDOW_MIN_HEIGHT * scale, WINDOW_MAX_HEIGHT * scale);
    let current = match win.outer_size() {
        Ok(size) => size.height as f64,
        Err(_) => return,
    };
    if (current - target).abs() < 2.0 {
        return;
    }
    let _ = win.set_size(tauri::PhysicalSize::new(WINDOW_WIDTH * scale, target));
}

#[tauri::command]
pub fn widget_hide(app: AppHandle) {
    super::hide_widget(&app);
}

#[tauri::command]
pub fn widget_show(app: AppHandle) {
    super::show_widget(&app);
}

#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}

// -------------------------------------------------------------------- links

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> bool {
    use tauri_plugin_opener::OpenerExt;
    match tauri::Url::parse(&url) {
        Ok(parsed) if parsed.scheme() == "https" || parsed.scheme() == "http" => {
            app.opener().open_url(parsed.as_str(), None::<&str>).is_ok()
        }
        _ => false,
    }
}

#[tauri::command]
pub fn open_config_folder(app: AppHandle) {
    use tauri_plugin_opener::OpenerExt;
    if let Ok(dir) = app.path().app_config_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = app.opener().open_path(dir.to_string_lossy(), None::<&str>);
    }
}

// -------------------------------------------------------------- persistence

#[tauri::command]
pub fn settings_read(app: AppHandle) -> Value {
    let raw = settings::load(&app);
    serde_json::to_value(&raw).unwrap_or(Value::Null)
}

/// Top-level merge patch: keys present in `patch` replace their counterparts.
/// Unknown keys are preserved so future fields survive round-trips.
#[tauri::command]
pub fn settings_write(app: AppHandle, patch: Value) -> Value {
    let mut merged = match serde_json::to_value(settings::load(&app)) {
        Ok(Value::Object(map)) => map,
        _ => Default::default(),
    };
    if let Value::Object(incoming) = patch {
        for (key, value) in incoming {
            merged.insert(key, value);
        }
    }
    let value = Value::Object(merged);
    if let Ok(parsed) = serde_json::from_value::<settings::Settings>(value.clone()) {
        let _ = settings::save(&app, &parsed);
    }
    value
}

#[tauri::command]
pub fn settings_changed(app: AppHandle) {
    #[cfg(desktop)]
    super::tray::update_menu(&app);
    crate::apply_display_mode(&app);
    let _ = app.emit("settings-changed", ());
}

#[tauri::command]
pub fn reset_position(app: AppHandle) {
    let mut s = settings::load(&app);
    s.bounds = None;
    let _ = settings::save(&app, &s);
    if let Some(win) = app.get_webview_window("widget") {
        let (x, y) = default_bounds(&app);
        let height = win.outer_size().map(|sz| sz.height).unwrap_or(DEFAULT_HEIGHT as u32);
        let _ = win.set_position(PhysicalPosition::new(x, y));
        if let Ok(scale) = win.scale_factor() {
            let width = (WINDOW_WIDTH * scale).round() as u32;
            let _ = win.set_size(PhysicalSize::new(width, height));
        }
        super::show_widget(&app);
    }
}

// ------------------------------------------------------------------ secrets

#[tauri::command]
pub fn feed_url_get() -> Result<FeedUrlInfo, String> {
    if let Some(url) = crate::secret::get()? {
        return Ok(FeedUrlInfo { url: Some(mask(&url)), source: "keyring-full" });
    }
    Ok(match env_feed_url() {
        Some(url) => FeedUrlInfo { url: Some(mask(&url)), source: "env-var" },
        None => FeedUrlInfo { url: None, source: "none" },
    })
}

/// Android only: match the status-bar icon style to the effective web theme
/// at runtime (audit A1). `light_icons = true` draws light (white) icons
/// for dark canvas. API 30+ uses WindowInsetsController; older releases
/// fall back to SYSTEM_UI_FLAG_LIGHT_STATUS_BAR. Desktop: no-op.
#[tauri::command]
pub fn set_status_bar_style(light_icons: bool) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        use jni::objects::JValue;

        const APPEARANCE_LIGHT_STATUS_BARS: i32 = 8;
        const SYSTEM_UI_FLAG_LIGHT_STATUS_BAR: i32 = 0x2000;

        let ctx = ndk_context::android_context();
        // SAFETY: ndk-context only hands out the VM/activity while the app
        // is attached, which always holds inside a Tauri command.
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())?;
        let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
        let activity = unsafe { jni::objects::JObject::from_raw(ctx.context().cast()) };

        let sdk: i32 = env
            .get_static_field("android/os/Build$VERSION", "SDK_INT", "I")
            .map_err(|e| e.to_string())?
            .i()
            .map_err(|e| e.to_string())?;
        let window: jni::objects::JObject = env
            .call_method(&activity, "getWindow", "()Landroid/view/Window;", &[])
            .map_err(|e| e.to_string())?
            .l()
            .map_err(|e| e.to_string())?;
        let decor: jni::objects::JObject = env
            .call_method(&window, "getDecorView", "()Landroid/view/View;", &[])
            .map_err(|e| e.to_string())?
            .l()
            .map_err(|e| e.to_string())?;

        if sdk >= 30 {
            let controller: jni::objects::JObject = env
                .call_method(
                    &decor,
                    "getWindowInsetsController",
                    "()Landroid/view/WindowInsetsController;",
                    &[],
                )
                .map_err(|e| e.to_string())?
                .l()
                .map_err(|e| e.to_string())?;
            let appearance = if light_icons { 0 } else { APPEARANCE_LIGHT_STATUS_BARS };
            env.call_method(
                &controller,
                "setAppearanceLightStatusBars",
                "(I)V",
                &[JValue::Int(appearance)],
            )
            .map_err(|e| e.to_string())?;
        } else {
            let current: i32 = env
                .call_method(&decor, "getSystemUiVisibility", "()I", &[])
                .map_err(|e| e.to_string())?
                .i()
                .map_err(|e| e.to_string())?;
            let next = if light_icons {
                current & !SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            } else {
                current | SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            };
            env.call_method(&decor, "setSystemUiVisibility", "(I)V", &[JValue::Int(next)])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = light_icons;
        Ok(())
    }
}

/// Full URL only ever travels back once, right after the user logs in or
/// pastes it; normal reads get the masked form so it cannot leak into UI.
#[tauri::command]
pub fn feed_url_get_full() -> Result<Option<String>, String> {
    Ok(crate::secret::get()?.or_else(env_feed_url))
}

fn validate_feed_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let parsed = tauri::Url::parse(trimmed).map_err(|_| "URL_INVALID")?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("URL_PROTOCOL".into());
    }
    Ok(trimmed.to_string())
}

fn validate_feed_kind(raw: &str) -> Result<String, String> {
    match raw.trim() {
        "brone" => Ok("brone".into()),
        "google" => Ok("google".into()),
        "ics" => Ok("ics".into()),
        _ => Err("FEED_KIND_INVALID".into()),
    }
}

fn upsert_feed_meta(app: &AppHandle, id: &str, kind: &str, label: &str, enabled: bool) {
    let mut s = settings::load(app);
    if let Some(existing) = s.feeds.iter_mut().find(|f| f.id == id) {
        existing.kind = kind.to_string();
        if !label.is_empty() {
            existing.label = label.to_string();
        }
        existing.enabled = enabled;
    } else {
        s.feeds.push(settings::FeedMeta {
            id: id.to_string(),
            kind: kind.to_string(),
            label: if label.is_empty() { id.to_string() } else { label.to_string() },
            enabled,
        });
    }
    let _ = settings::save(app, &s);
}

fn drop_feed_meta(app: &AppHandle, id: &str) {
    let mut s = settings::load(app);
    s.feeds.retain(|f| f.id != id);
    let _ = settings::save(app, &s);
}

/// Legacy single-feed setter, kept as the `feed/brone` alias so the existing
/// settings form keeps working while multi-feed lands.
#[tauri::command]
pub fn feed_url_set(app: AppHandle, url: Option<String>) -> Result<(), String> {
    let result = match url {
        Some(raw) => {
            let trimmed = validate_feed_url(&raw)?;
            crate::secret::set(&trimmed)?;
            upsert_feed_meta(&app, "brone", "brone", "BRONE", true);
            Ok(())
        }
        None => {
            crate::secret::clear()?;
            drop_feed_meta(&app, "brone");
            Ok(())
        }
    };
    if result.is_ok() {
        let _ = app.emit("feed-changed", ());
    }
    result
}

/// Multi-feed list: metadata from settings.json + presence from the secret
/// store. Env-var fallback only applies to the BRONE feed.
#[tauri::command]
pub fn feeds_list(app: AppHandle) -> Result<Vec<FeedInfo>, String> {
    let s = settings::load(&app);
    let mut out = Vec::with_capacity(s.feeds.len());
    for meta in &s.feeds {
        let has = crate::secret::get_feed(&meta.id)?.is_some()
            || (meta.id == "brone" && env_feed_url().is_some());
        let source = if crate::secret::get_feed(&meta.id)?.is_some() {
            "secret"
        } else if meta.id == "brone" && env_feed_url().is_some() {
            "env-var"
        } else {
            "none"
        };
        out.push(FeedInfo {
            id: meta.id.clone(),
            kind: meta.kind.clone(),
            label: meta.label.clone(),
            enabled: meta.enabled,
            has_secret: has,
            source,
        });
    }
    Ok(out)
}

/// Store a feed URL in the secret store and upsert its metadata row.
#[tauri::command]
pub fn feed_set(
    app: AppHandle,
    id: String,
    kind: String,
    url: String,
    label: Option<String>,
    enabled: Option<bool>,
) -> Result<FeedInfo, String> {
    let id = crate::secret::validate_feed_id(&id)?;
    let kind = validate_feed_kind(&kind)?;
    let trimmed = validate_feed_url(&url)?;
    let label = label.unwrap_or_default().trim().to_string();
    let enabled = enabled.unwrap_or(true);
    crate::secret::set_feed(&id, &trimmed)?;
    upsert_feed_meta(&app, &id, &kind, &label, enabled);
    let _ = app.emit("feed-changed", ());
    Ok(FeedInfo {
        id: id.clone(),
        kind,
        label: if label.is_empty() { id } else { label },
        enabled,
        has_secret: true,
        source: "secret",
    })
}

#[tauri::command]
pub fn feed_remove(app: AppHandle, id: String) -> Result<(), String> {
    let id = crate::secret::validate_feed_id(&id)?;
    crate::secret::remove_feed(&id)?;
    drop_feed_meta(&app, &id);
    let _ = app.emit("feed-changed", ());
    Ok(())
}

/// Full URLs for every enabled feed, so the renderer can fetch each source.
/// Same exposure rule as `feed_url_get_full`: the widget process already holds
/// the secret to fetch; metadata-only readers use `feeds_list`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedWithUrl {
    id: String,
    kind: String,
    label: String,
    enabled: bool,
    url: String,
}

#[tauri::command]
pub fn feeds_get_full(app: AppHandle) -> Result<Vec<FeedWithUrl>, String> {
    let s = settings::load(&app);
    let mut out = Vec::new();
    for meta in &s.feeds {
        if !meta.enabled {
            continue;
        }
        if crate::secret::validate_feed_id(&meta.id).is_err() {
            continue;
        }
        let url = crate::secret::get_feed(&meta.id)?.or_else(|| {
            if meta.id == "brone" {
                env_feed_url()
            } else {
                None
            }
        });
        if let Some(url) = url {
            out.push(FeedWithUrl {
                id: meta.id.clone(),
                kind: meta.kind.clone(),
                label: meta.label.clone(),
                enabled: true,
                url,
            });
        }
    }
    // Legacy fallback: a BRONE secret with no metadata row yet.
    if out.is_empty() {
        match crate::secret::get()? {
            Some(url) => out.push(FeedWithUrl {
                id: "brone".into(),
                kind: "brone".into(),
                label: "BRONE".into(),
                enabled: true,
                url,
            }),
            None => {
                if let Some(url) = env_feed_url() {
                    out.push(FeedWithUrl {
                        id: "brone".into(),
                        kind: "brone".into(),
                        label: "BRONE".into(),
                        enabled: true,
                        url,
                    });
                }
            }
        }
    }
    Ok(out)
}

/// Token params must never appear in logs or screenshots.
fn mask(raw: &str) -> String {
    const SENSITIVE: [&str; 6] = ["token", "auth", "secret", "key", "password", "passwd"];
    const BULLETS: &str = "\u{2022}\u{2022}\u{2022}\u{2022}\u{2022}\u{2022}\u{2022}\u{2022}";
    match tauri::Url::parse(raw) {
        Ok(mut parsed) => {
            let pairs: Vec<(String, String)> = parsed
                .query_pairs()
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();
            {
                let mut query = parsed.query_pairs_mut();
                for (key, value) in pairs {
                    if SENSITIVE.iter().any(|part| key.to_lowercase().contains(part)) {
                        query.append_pair(&key, BULLETS);
                    } else {
                        query.append_pair(&key, &value);
                    }
                }
            }
            parsed.to_string()
        }
        Err(_) => BULLETS.to_string(),
    }
}

// ------------------------------------------------------------------ display

#[tauri::command]
pub fn set_display_mode(app: AppHandle, mode: String) -> String {
    let chosen = if mode == "desktop" { "desktop" } else { "alwaysOnTop" }.to_string();
    let mut s = settings::load(&app);
    s.display_mode = chosen.clone();
    let _ = settings::save(&app, &s);
    crate::apply_display_mode(&app);
    #[cfg(desktop)]
    super::tray::update_menu(&app);
    chosen
}

// ------------------------------------------------------------ notifications

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

#[tauri::command]
pub fn tray_tooltip(app: AppHandle, text: String) {
    #[cfg(desktop)]
    if let Some(tray) = app.tray_by_id(super::tray::TRAY_ID) {
        let _ = tray.set_tooltip(Some(text));
    }
    #[cfg(not(desktop))]
    let _ = (app, text);
}

// ----------------------------------------------------------------- settings ui

#[tauri::command]
pub fn open_settings(app: AppHandle) {
    #[cfg(desktop)]
    {
        match app.get_webview_window("settings") {
            Some(win) => {
                let _ = win.show();
                let _ = win.set_focus();
            }
            None => {
                let _ = WebviewWindowBuilder::new(
                    &app,
                    "settings",
                    WebviewUrl::App("settings.html".into()),
                )
                .title("Reminder Widget Settings")
                .inner_size(480.0, 556.0)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .resizable(false)
                .maximizable(false)
                .minimizable(false)
                .skip_taskbar(false)
                .always_on_top(true)
                .center()
                .build();
            }
        }
    }
    #[cfg(mobile)]
    {
        let _ = app.emit_to("widget", "navigate", "settings.html");
    }
}

#[tauri::command]
pub fn settings_close(app: AppHandle) {
    #[cfg(desktop)]
    {
        if let Some(win) = app.get_webview_window("settings") {
            let _ = win.close();
        }
    }
    #[cfg(mobile)]
    {
        let _ = app.emit_to("widget", "navigate", "index.html");
    }
}

// --------------------------------------------------------------- brone login

/// Runs the interactive login flow; resolves once a URL was captured, the
/// window closed, or the flow timed out (~3 min).
#[tauri::command]
pub async fn auth_brone_login(app: AppHandle) -> LoginOutcome {
    #[cfg(desktop)]
    {
        brone_login::start(app).await
    }
    #[cfg(mobile)]
    {
        let _ = app;
        LoginOutcome {
            ok: false,
            url: None,
            canceled: false,
            message: Some("Login terbantu hanya tersedia di desktop. Di HP: buka widget di PC -> Settings -> copy feed URL, lalu paste di sini.".into()),
        }
    }
}

// ------------------------------------------------- submission auto-detection

/// Opt-in batch check: the hidden checker webview visits each URL with the
/// user's session and emits `submission-checked` events per result.
#[tauri::command]
pub async fn submission_check(app: AppHandle, urls: Vec<String>) -> Result<(), String> {
    #[cfg(desktop)]
    {
        crate::detect::run_check(app, urls).await
    }
    #[cfg(mobile)]
    {
        let _ = (app, urls);
        Ok(())
    }
}

// ---------------------------------------------------------------- autostart

#[tauri::command]
pub fn autostart_get(app: AppHandle) -> bool {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch().is_enabled().unwrap_or(false)
    }
    #[cfg(mobile)]
    {
        let _ = app;
        false
    }
}

#[tauri::command]
pub fn autostart_set(app: AppHandle, enabled: bool) -> bool {
    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;
        let launcher = app.autolaunch();
        let result = if enabled { launcher.enable() } else { launcher.disable() };
        result.is_ok()
    }
    #[cfg(mobile)]
    {
        let _ = (app, enabled);
        false
    }
}

// ------------------------------------------------------------------ helpers

#[tauri::command]
pub fn platform() -> &'static str {
    #[cfg(mobile)]
    {
        "mobile"
    }
    #[cfg(desktop)]
    {
        "desktop"
    }
}

/// Used by lib.rs when applying collapsed/opacity etc. is renderer-owned; here
/// we only expose the sizing constants for the shim.
#[tauri::command]
pub fn window_metrics() -> Value {
    serde_json::json!({
        "width": WINDOW_WIDTH,
        "minHeight": WINDOW_MIN_HEIGHT,
        "maxHeight": WINDOW_MAX_HEIGHT
    })
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetTaskItem {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub course: String,
    pub due_ms: i64,
}

/// Syncs top upcoming deadlines to Android home screen widget storage.
#[tauri::command]
pub fn sync_widget_data(app: AppHandle, tasks: Vec<WidgetTaskItem>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Ok(dir) = app.path().app_config_dir() {
            let path = dir.join("widget_tasks.json");
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(json) = serde_json::to_string(&tasks) {
                let tmp = path.with_extension("json.tmp");
                if std::fs::write(&tmp, json).is_ok() {
                    let _ = std::fs::remove_file(&path);
                    let _ = std::fs::rename(&tmp, &path);
                }
            }
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, tasks);
    }
    Ok(())
}

