//! IPC surface mirroring v1's preload.js bridge. The renderer owns feed
//! fetching/parsing; these commands cover everything needing native access:
//! persistence, secrets, window geometry/lifecycle, tray, notifications,
//! external links and the BRONE login flow.

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

use crate::{brone_login, settings};

pub const WINDOW_WIDTH: f64 = 360.0;
pub const WINDOW_MIN_HEIGHT: f64 = 132.0;
pub const WINDOW_MAX_HEIGHT: f64 = 720.0;
pub const SCREEN_MARGIN: f64 = 16.0;
pub const DEFAULT_HEIGHT: f64 = 420.0;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedUrlInfo {
    url: Option<String>,
    /// "keyring-full" | "env-var" | "none" ("full" = unmasked payload present)
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
    // Only the top-left anchor is needed: the widget sits at the work area's
    // top-right corner and its own size comes from saved/default bounds.
    let (mut x, mut y, mut width) = (0i32, 0i32, 1280i32);
    if let Ok(monitors) = app.available_monitors() {
        // Monitor names are unreliable across drivers; the first entry is the
        // primary on every Windows setup we target.
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
    // Rebuild tray checkboxes + reapply layering after any renderer-side save.
    super::tray::update_menu(&app);
    crate::apply_display_mode(&app);
}

#[tauri::command]
pub fn reset_position(app: AppHandle) {
    let mut s = settings::load(&app);
    s.bounds = None;
    let _ = settings::save(&app, &s);
    if let Some(win) = app.get_webview_window("widget") {
        let (x, y) = default_bounds(&app);
        // Keep the user's current height; only the spot resets (v1 parity).
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

/// Full URL only ever travels back once, right after the user logs in or
/// pastes it; normal reads get the masked form so it cannot leak into UI.
#[tauri::command]
pub fn feed_url_get_full() -> Result<Option<String>, String> {
    Ok(crate::secret::get()?.or_else(env_feed_url))
}

#[tauri::command]
pub fn feed_url_set(url: Option<String>) -> Result<(), String> {
    match url {
        Some(raw) => {
            let trimmed = raw.trim();
            let parsed = tauri::Url::parse(trimmed).map_err(|_| "URL_INVALID")?;
            if parsed.scheme() != "https" && parsed.scheme() != "http" {
                return Err("URL_PROTOCOL".into());
            }
            crate::secret::set(trimmed)
        }
        None => crate::secret::clear(),
    }
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
    if let Some(tray) = app.tray_by_id(super::tray::TRAY_ID) {
        let _ = tray.set_tooltip(Some(text));
    }
}

// ----------------------------------------------------------------- settings ui

#[tauri::command]
pub fn open_settings(app: AppHandle) {
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

#[tauri::command]
pub fn settings_close(app: AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.close();
    }
}

// --------------------------------------------------------------- brone login

/// Runs the interactive login flow; resolves once a URL was captured, the
/// window closed, or the flow timed out (~3 min).
#[tauri::command]
pub async fn auth_brone_login(app: AppHandle) -> brone_login::LoginOutcome {
    brone_login::start(app).await
}

// ---------------------------------------------------------------- autostart

#[tauri::command]
pub fn autostart_get(app: AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn autostart_set(app: AppHandle, enabled: bool) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    let launcher = app.autolaunch();
    let result = if enabled { launcher.enable() } else { launcher.disable() };
    result.is_ok()
}

// ------------------------------------------------------------------ helpers

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
