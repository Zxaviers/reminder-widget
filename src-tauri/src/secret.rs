//! The calendar feed URL carries Moodle's `authtoken` — it is equivalent to
//! read access to the user's calendar. It is stored in Windows Credential
//! Manager (via keyring) rather than plaintext settings.json, replacing v1's
//! DPAPI safeStorage approach.

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
