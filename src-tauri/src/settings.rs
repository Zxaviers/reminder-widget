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
    /// Renderer-owned: is the "✓ Selesai" (done tasks) section expanded.
    pub show_done: bool,
    /// taskId -> already-fired notification thresholds (ms remaining).
    pub notified: BTreeMap<String, Vec<f64>>,
    /// taskId -> ISO timestamp when the user marked it done.
    pub done: BTreeMap<String, String>,
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
            show_done: false,
            notified: BTreeMap::new(),
            done: BTreeMap::new(),
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
