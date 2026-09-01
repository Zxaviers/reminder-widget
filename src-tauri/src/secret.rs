//! The calendar feed URL carries Moodle's `authtoken` — it is equivalent to
//! read access to the user's calendar. On Windows it is stored in Windows
//! Credential Manager (via keyring). On Android and non-Windows targets, it is
//! stored in the app's sandboxed private configuration directory.

#[cfg(windows)]
mod imp {
    use keyring::Entry;

    const SERVICE: &str = "Reminder Widget";
    const ACCOUNT: &str = "calendar-feed-url";

    fn entry() -> Result<Entry, String> {
        Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
    }

    pub fn get() -> Result<Option<String>, String> {
        match entry()?.get_password() {
            Ok(url) => Ok(Some(url)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn set(url: &str) -> Result<(), String> {
        entry()?.set_password(url).map_err(|e| e.to_string())
    }

    /// Clearing a missing entry is success: the end state is what matters.
    pub fn clear() -> Result<(), String> {
        match entry()?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use std::path::PathBuf;
    use std::sync::Mutex;
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, Default)]
    struct SecretStore {
        url: Option<String>,
    }

    static CACHED_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

    pub fn set_config_dir(dir: PathBuf) {
        if let Ok(mut lock) = CACHED_DIR.lock() {
            *lock = Some(dir);
        }
    }

    fn secret_file_path() -> PathBuf {
        if let Ok(lock) = CACHED_DIR.lock() {
            if let Some(ref d) = *lock {
                return d.join("secret.json");
            }
        }
        PathBuf::from("secret.json")
    }

    pub fn get() -> Result<Option<String>, String> {
        let path = secret_file_path();
        if !path.exists() {
            return Ok(None);
        }
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let store: SecretStore = serde_json::from_str(&raw).unwrap_or_default();
        Ok(store.url)
    }

    pub fn set(url: &str) -> Result<(), String> {
        let path = secret_file_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let store = SecretStore { url: Some(url.to_string()) };
        let data = serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
        drop(std::fs::remove_file(&path));
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
    }

    pub fn clear() -> Result<(), String> {
        let path = secret_file_path();
        if path.exists() {
            let _ = std::fs::remove_file(&path);
        }
        Ok(())
    }
}

pub fn get() -> Result<Option<String>, String> {
    imp::get()
}

pub fn set(url: &str) -> Result<(), String> {
    imp::set(url)
}

pub fn clear() -> Result<(), String> {
    imp::clear()
}

#[cfg(not(windows))]
pub fn init_config_dir(dir: std::path::PathBuf) {
    imp::set_config_dir(dir);
}
