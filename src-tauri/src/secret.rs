//! Multi-feed secret store. Feed URLs carry Moodle `authtoken`s or Google
//! calendar addresses — equivalent to read access — so they never live in
//! settings.json. Metadata (id/kind/label/enabled) lives in settings.json;
//! only the URL itself lives here.
//!
//! Windows: one Credential Manager entry per feed (`feed/<id>`).
//! Android / non-Windows: app-private `secret.json` (`{feeds: {id: url}}`).
//! The single-feed legacy (`calendar-feed-url` / `{url}`) migrates to
//! `feed/brone` on first read.

const BRONE_ID: &str = "brone";

/// Feed ids are used as keyring account suffixes and JSON map keys.
pub fn validate_feed_id(raw: &str) -> Result<String, String> {
    let id = raw.trim().to_string();
    if id.is_empty() || id.len() > 64 {
        return Err("FEED_ID_INVALID".into());
    }
    let ok = id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if !ok {
        return Err("FEED_ID_INVALID".into());
    }
    Ok(id)
}

#[cfg(windows)]
mod imp {
    use keyring::Entry;

    use super::BRONE_ID;

    const SERVICE: &str = "Reminder Widget";
    /// Legacy single-feed account, kept for one-time migration.
    const LEGACY_ACCOUNT: &str = "calendar-feed-url";

    fn account_for(id: &str) -> String {
        format!("feed/{id}")
    }

    fn entry_for(id: &str) -> Result<Entry, String> {
        Entry::new(SERVICE, &account_for(id)).map_err(|e| e.to_string())
    }

    fn legacy_entry() -> Result<Entry, String> {
        Entry::new(SERVICE, LEGACY_ACCOUNT).map_err(|e| e.to_string())
    }

    fn read_entry(entry: &Entry) -> Result<Option<String>, String> {
        match entry.get_password() {
            Ok(url) => Ok(Some(url)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn get_feed(id: &str) -> Result<Option<String>, String> {
        if let Some(url) = read_entry(&entry_for(id)?)? {
            return Ok(Some(url));
        }
        // One-time legacy migration for the BRONE feed.
        if id == BRONE_ID {
            if let Some(url) = read_entry(&legacy_entry()?)? {
                let _ = entry_for(id)?.set_password(&url);
                let _ = legacy_entry()?.delete_credential();
                return Ok(Some(url));
            }
        }
        Ok(None)
    }

    pub fn set_feed(id: &str, url: &str) -> Result<(), String> {
        entry_for(id)?.set_password(url).map_err(|e| e.to_string())
    }

    pub fn remove_feed(id: &str) -> Result<(), String> {
        match entry_for(id)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn get() -> Result<Option<String>, String> {
        get_feed(BRONE_ID)
    }

    pub fn set(url: &str) -> Result<(), String> {
        set_feed(BRONE_ID, url)
    }

    /// Clearing a missing entry is success: the end state is what matters.
    pub fn clear() -> Result<(), String> {
        remove_feed(BRONE_ID)?;
        match legacy_entry()?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use serde::{Deserialize, Serialize};
    use std::collections::BTreeMap;
    use std::path::PathBuf;
    use std::sync::Mutex;

    use super::BRONE_ID;

    #[derive(Serialize, Deserialize, Default)]
    struct SecretStore {
        /// Legacy single-feed field; migrated to `feeds.brone` on read.
        #[serde(default)]
        url: Option<String>,
        #[serde(default)]
        feeds: BTreeMap<String, String>,
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

    fn load_store() -> SecretStore {
        let path = secret_file_path();
        if !path.exists() {
            return SecretStore::default();
        }
        let raw = std::fs::read_to_string(&path).unwrap_or_default();
        let mut store: SecretStore = serde_json::from_str(&raw).unwrap_or_default();
        // One-time legacy migration: {url} -> {feeds: {brone: url}}.
        if store.feeds.get(BRONE_ID).is_none() {
            if let Some(url) = store.url.clone() {
                store.feeds.insert(BRONE_ID.to_string(), url);
                store.url = None;
                let _ = save_store(&store);
            }
        }
        store
    }

    fn save_store(store: &SecretStore) -> Result<(), String> {
        let path = secret_file_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let data = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, &data).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
        }
        drop(std::fs::remove_file(&path));
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
    }

    pub fn get_feed(id: &str) -> Result<Option<String>, String> {
        Ok(load_store().feeds.get(id).cloned())
    }

    pub fn set_feed(id: &str, url: &str) -> Result<(), String> {
        let mut store = load_store();
        if id == BRONE_ID {
            store.url = None;
        }
        store.feeds.insert(id.to_string(), url.to_string());
        save_store(&store)
    }

    pub fn remove_feed(id: &str) -> Result<(), String> {
        let mut store = load_store();
        store.feeds.remove(id);
        if id == BRONE_ID {
            store.url = None;
        }
        save_store(&store)
    }

    pub fn get() -> Result<Option<String>, String> {
        get_feed(BRONE_ID)
    }

    pub fn set(url: &str) -> Result<(), String> {
        set_feed(BRONE_ID, url)
    }

    pub fn clear() -> Result<(), String> {
        remove_feed(BRONE_ID)
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

pub fn get_feed(id: &str) -> Result<Option<String>, String> {
    let id = validate_feed_id(id)?;
    imp::get_feed(&id)
}

pub fn set_feed(id: &str, url: &str) -> Result<(), String> {
    let id = validate_feed_id(id)?;
    imp::set_feed(&id, url)
}

pub fn remove_feed(id: &str) -> Result<(), String> {
    let id = validate_feed_id(id)?;
    imp::remove_feed(&id)
}

#[cfg(not(windows))]
pub fn init_config_dir(dir: std::path::PathBuf) {
    imp::set_config_dir(dir);
}
