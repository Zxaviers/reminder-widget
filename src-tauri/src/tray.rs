//! Tray icon, context menu and tooltip. The menu is rebuilt whenever a
//! checkbox source of truth changes (visibility, display mode, autostart,
//! notifications) — same approach as v1's updateTrayMenu.

use tauri::menu::{CheckMenuItem, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

pub const TRAY_ID: &str = "rw-tray";

fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let s = crate::settings::load(app);
    let floating = !s.is_desktop_mode();
    let autostart_on = {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch().is_enabled().unwrap_or(false)
    };
    let visible = app
        .get_webview_window("widget")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);

    let toggle_label = if visible { "Sembunyikan Widget (Hide)" } else { "Tampilkan Widget (Show)" };
    let toggle = MenuItem::with_id(app, "toggle", toggle_label, true, None::<&str>)?;
    let bring_front = MenuItem::with_id(app, "front", "Bawa ke Depan (Bring to Front)", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let settings_item = MenuItem::with_id(app, "settings", "Pengaturan…", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh Sekarang", true, None::<&str>)?;
    let always_top = CheckMenuItem::with_id(app, "always-top", "Always on top (Floating)", true, floating, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, "autostart", "Open at Windows startup", true, autostart_on, None::<&str>)?;
    let notif = CheckMenuItem::with_id(app, "notifications", "Deadline notifications", true, s.notifications, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let config = MenuItem::with_id(app, "config", "Open config folder", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "Reset position", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    tauri::menu::Menu::with_items(
        app,
        &[&toggle, &bring_front, &sep1, &settings_item, &refresh, &always_top, &autostart, &notif, &sep2, &config, &reset, &sep3, &quit],
    )
}

/// Rebuild the context menu in place.
pub fn update_menu(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(menu) = build_menu(app) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

/// Default tooltip until the renderer reports the next deadline.
const DEFAULT_TOOLTIP: &str = "Reminder Widget";

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(tauri::include_image!("icons/icon.png"))
        .tooltip(DEFAULT_TOOLTIP)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id().as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            // Left click toggles visibility; right click opens the menu.
            // Handle both Up and Down states for better compatibility with
            // overflow area clicks which may send different event sequences.
            if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, .. }) {
                super::toggle_widget(tray.app_handle());
            }
        });

    #[cfg(windows)]
    {
        builder = builder.icon_as_template(false);
    }

    builder.build(app)?;
    Ok(())
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        "toggle" => super::toggle_widget(app),
        "front" => super::show_widget(app),
        "settings" => {
            super::commands::open_settings(app.clone());
        }
        "refresh" => {
            let _ = app.emit("tray-command", "refresh");
        }
        "always-top" => {
            let mode = if crate::settings::load(app).is_desktop_mode() { "alwaysOnTop" } else { "desktop" };
            let _ = super::commands::set_display_mode(app.clone(), mode.to_string());
            push_settings_changed(app);
        }
        "autostart" => {
            use tauri_plugin_autostart::ManagerExt;
            let launcher = app.autolaunch();
            let enable = !launcher.is_enabled().unwrap_or(false);
            let result = if enable { launcher.enable() } else { launcher.disable() };
            if result.is_ok() {
                let mut s = crate::settings::load(app);
                s.open_at_login = enable;
                let _ = crate::settings::save(app, &s);
            }
            update_menu(app);
            push_settings_changed(app);
        }
        "notifications" => {
            let mut s = crate::settings::load(app);
            s.notifications = !s.notifications;
            let _ = crate::settings::save(app, &s);
            update_menu(app);
            push_settings_changed(app);
        }
        "config" => super::commands::open_config_folder(app.clone()),
        "reset" => super::commands::reset_position(app.clone()),
        "quit" => app.exit(0),
        _ => {}
    }
}

fn push_settings_changed(app: &AppHandle) {
    let _ = app.emit("settings-changed", ());
}
