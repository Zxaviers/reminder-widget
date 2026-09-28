use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Saved widget geometry. Coordinates are physical pixels as reported by the
/// OS, matching what Electron's getBounds stored.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(default)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
}

impl Default for Bounds {
    fn default() -> Self {
        Self { x: 0, y: 0, width: 360.0, height: 420.0 }
    }
}

/// Feed metadata (non-secret). The URL/token/address itself lives only in
/// the secret store (see secret.rs); settings.json keeps id/kind/label/enabled
/// so a leaked settings file reveals no credentials.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FeedMeta {
    pub id: String,
    /// "brone" | "google" | "ics"
    pub kind: String,
    pub label: String,
    pub enabled: bool,
}

impl Default for FeedMeta {
    fn default() -> Self {
        Self { id: String::new(), kind: "ics".into(), label: String::new(), enabled: true }
    }
}

/// Manual event persisted in settings.json. Titles are user-typed plain text,
/// not credentials, so plain storage here is intended.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LocalEvent {
    pub id: String,
    pub title: String,
    pub due_ms: i64,
    pub all_day: bool,
}

/// Mirror of the v1 settings.json so a user upgrading keeps their
/// configuration. `feed` is no longer written (the URL lives in Windows
/// Credential Manager); the field stays tolerated for forward compatibility.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub open_at_login: bool,
    pub notifications: bool,
    pub collapsed: bool,
    pub opacity: f64,
    pub bounds: Option<Bounds>,
    /// "alwaysOnTop" | "desktop"
    pub display_mode: String,
    /// "dark" | "light" | "auto" (auto follows the OS color scheme)
    pub theme: String,
    /// Renderer-owned: is the "✓ Selesai" (done tasks) section expanded.
    pub show_done: bool,
    /// Opt-in: peek at BRONE assign pages (logged-in session) to auto-mark
    /// submitted tasks as done. Off by default — it accesses /mod/assign URLs.
    pub auto_detect: bool,
    /// taskId -> epoch ms of the last auto-detect check (rate limiting).
    pub last_checked: BTreeMap<String, i64>,
    /// Feed refresh interval in minutes (renderer clamps to 15..=30).
    pub refresh_minutes: i64,
    /// Notification thresholds in hours before deadline, e.g. [24, 6, 1].
    pub notify_thresholds_hours: Vec<f64>,
    /// taskId -> already-fired notification thresholds (ms remaining).
    pub notified: BTreeMap<String, Vec<f64>>,
    /// taskId -> ISO timestamp when the user marked it done.
    pub done: BTreeMap<String, String>,
    /// Multi-feed metadata (URLs stay in the secret store).
    pub feeds: Vec<FeedMeta>,
    /// Manual events (Slice 1). Plain text, persisted across restarts.
    pub local_events: Vec<LocalEvent>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            open_at_login: false,
            notifications: true,
            collapsed: false,
            opacity: 1.0,
            bounds: None,
            display_mode: "alwaysOnTop".into(),
            theme: "auto".into(),
            show_done: false,
            auto_detect: false,
            last_checked: BTreeMap::new(),
            refresh_minutes: 20,
            notify_thresholds_hours: vec![24.0, 6.0, 1.0],
            notified: BTreeMap::new(),
            done: BTreeMap::new(),
            feeds: Vec::new(),
            local_events: Vec::new(),
        }
    }
}

impl Settings {
    pub fn is_desktop_mode(&self) -> bool {
        self.display_mode == "desktop"
    }
}

pub fn settings_path(app: &AppHandle) -> PathBuf {
    app.path().app_config_dir().unwrap_or_else(|_| PathBuf::from(".")).join("settings.json")
}

/// Missing or corrupt file falls back to defaults; unknown fields from newer
/// or older versions are ignored by serde.
pub fn load(app: &AppHandle) -> Settings {
    let path = settings_path(app);
    match std::fs::read_to_string(&path) {
        Ok(raw) => {
            serde_json::from_str(raw.trim_start_matches('\u{feff}')).unwrap_or_default()
        }
        Err(_) => Settings::default(),
    }
}

/// Atomic write (tmp + rename) so a crash never tears the file — same scheme
/// as v1's saveSettings().
pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let payload = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, payload).map_err(|e| e.to_string())?;
    // Windows rename-over-existing needs the target gone first; the window
    // where both are absent is one syscall wide and acceptable.
    drop(std::fs::remove_file(&path));
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
