//! App shell: plugin registration, the frameless widget window, display
//! modes (floating vs pinned-to-wallpaper), and window-event plumbing.
//!
//! The renderer owns feed fetching/parsing/notification thresholds; this side
//! owns everything native.

#[cfg(desktop)]
mod brone_login;
mod commands;
#[cfg(desktop)]
mod detect;
mod secret;
mod settings;
#[cfg(desktop)]
mod tray;
#[cfg(windows)]
mod win32;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
#[cfg(desktop)]
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const WIDGET_LABEL: &str = "widget";

/// Desktop-pin mode active? Read by the guard thread and event handlers.
static PIN_TO_DESKTOP: AtomicBool = AtomicBool::new(false);
/// Set by hide_widget so toggle/show logic mirrors v1's `isExplicitlyHidden`.
static EXPLICITLY_HIDDEN: AtomicBool = AtomicBool::new(false);
/// Debounce clock for tray double-clicks, in millis since boot.
static LAST_TOGGLE_MS: AtomicU64 = AtomicU64::new(0);

// ------------------------------------------------------------- display modes

pub fn apply_display_mode(app: &AppHandle) {
    #[cfg(desktop)]
    {
        let Some(win) = app.get_webview_window(WIDGET_LABEL) else { return };
        if settings::load(app).is_desktop_mode() {
            PIN_TO_DESKTOP.store(true, Ordering::SeqCst);
            let _ = win.set_always_on_top(false);
            #[cfg(windows)]
            win32::send_to_bottom(&win);
        } else {
            PIN_TO_DESKTOP.store(false, Ordering::SeqCst);
            #[cfg(windows)]
            win32::make_tool_window(&win);
            let _ = win.set_always_on_top(true);
        }
    }
    #[cfg(not(desktop))]
    let _ = app;
}

// ------------------------------------------------------------ show/hide/toggle

pub fn show_widget(app: &AppHandle) {
    EXPLICITLY_HIDDEN.store(false, Ordering::SeqCst);
    let Some(win) = app.get_webview_window(WIDGET_LABEL) else {
        let _ = create_widget(app);
        return;
    };
    // Win+D can minimize despite WS_EX_TOOLWINDOW; a minimized window still
    // reports is_visible()==true on Windows, so both flags are checked (v1 note).
    let needs_restore = !win.is_visible().unwrap_or(true) || win.is_minimized().unwrap_or(false);
    if needs_restore {
        let _ = win.show();
    }
    // Exactly one z-order call per mode: raising then sinking a desktop-pin
    // widget is the "jump flicker" v1 documented.
    if settings::load(app).is_desktop_mode() {
        #[cfg(windows)]
        win32::send_to_bottom(&win);
    } else {
        #[cfg(windows)]
        win32::bring_to_top(&win);
    }
    // Safety net: if a feed save's broadcast was ever missed (e.g. saved while
    // the widget page was reloading), the widget re-checks on every show.
    let _ = app.emit("widget-shown", ());
    #[cfg(desktop)]
    tray::update_menu(app);
}

pub fn hide_widget(app: &AppHandle) {
    EXPLICITLY_HIDDEN.store(true, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window(WIDGET_LABEL) {
        let result = win.hide();
        #[cfg(debug_assertions)]
        eprintln!("[hide] hide() result: {:?}", result.as_ref().map(|_| "ok").map_err(|e| e.to_string()));
        let _ = result;
    }
    #[cfg(desktop)]
    tray::update_menu(app);
}

pub fn toggle_widget(app: &AppHandle) {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_TOGGLE_MS.load(Ordering::SeqCst);
    if now_ms.wrapping_sub(last) < 250 {
        return;
    }
    LAST_TOGGLE_MS.store(now_ms, Ordering::SeqCst);

    let hidden = EXPLICITLY_HIDDEN.load(Ordering::SeqCst)
        || app
            .get_webview_window(WIDGET_LABEL)
            .map(|w| !w.is_visible().unwrap_or(true) || w.is_minimized().unwrap_or(false))
            .unwrap_or(true);

    if hidden {
        show_widget(app);
    } else {
        hide_widget(app);
    }
}

// -------------------------------------------------------------- window setup

fn create_widget(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let builder = WebviewWindowBuilder::new(
        app,
        WIDGET_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("Reminder Widget");

    #[cfg(desktop)]
    let (builder, is_desktop) = {
        let s = settings::load(app);
        let bounds = match s.bounds {
            Some(saved) => commands::clamp_bounds(app, saved),
            None => {
                let (x, y) = commands::default_bounds(app);
                settings::Bounds { x, y, width: commands::WINDOW_WIDTH, height: commands::DEFAULT_HEIGHT }
            }
        };
        (
            builder
                .inner_size(bounds.width, bounds.height)
                .position(bounds.x as f64, bounds.y as f64)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .resizable(false)
                .maximizable(false)
                .minimizable(false)
                .skip_taskbar(true)
                .always_on_top(!s.is_desktop_mode())
                .focused(false)
                .visible(false),
            s.is_desktop_mode(),
        )
    };

    let win = builder.build()?;
    let _ = win.show();
    #[cfg(desktop)]
    if is_desktop {
        apply_display_mode(app);
    }
    Ok(win)
}

fn persist_bounds(app: &AppHandle) {
    let Some(win) = app.get_webview_window(WIDGET_LABEL) else { return };
    if !win.is_visible().unwrap_or(false) {
        return;
    }
    let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) else { return };
    if let Ok(scale) = win.scale_factor() {
        let mut s = settings::load(app);
        s.bounds = Some(settings::Bounds {
            x: pos.x,
            y: pos.y,
            width: size.width as f64 / scale,
            height: size.height as f64 / scale,
        });
        let _ = settings::save(app, &s);
    }
}

// ------------------------------------------------------------------- startup

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_widget(app);
        }));

    builder
        .invoke_handler(tauri::generate_handler![
            commands::widget_autosize,
            commands::widget_hide,
            commands::widget_show,
            commands::app_quit,
            commands::open_external,
            commands::open_config_folder,
            commands::settings_read,
            commands::settings_write,
            commands::settings_changed,
            commands::reset_position,
            commands::feed_url_get,
            commands::feed_url_get_full,
            commands::feed_url_set,
            commands::feeds_list,
            commands::feed_set,
            commands::feed_remove,
            commands::feeds_get_full,
            commands::set_status_bar_style,
            commands::set_display_mode,
            commands::notify,
            commands::tray_tooltip,
            commands::open_settings,
            commands::settings_close,
            commands::auth_brone_login,
            commands::submission_check,
            commands::autostart_get,
            commands::autostart_set,
            commands::platform,
            commands::window_metrics,
            commands::sync_widget_data,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            #[cfg(not(windows))]
            if let Ok(dir) = handle.path().app_config_dir() {
                secret::init_config_dir(dir);
            }

            create_widget(&handle)?;
            #[cfg(desktop)]
            tray::create(&handle)?;
            apply_display_mode(&handle);

            // Guard thread: re-assert the wallpaper layer on desktop
            #[cfg(desktop)]
            {
                let handle = handle.clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(Duration::from_secs(4));
                    if !PIN_TO_DESKTOP.load(Ordering::Relaxed) {
                        continue;
                    }
                    if let Some(win) = handle.get_webview_window(WIDGET_LABEL) {
                        if win.is_visible().unwrap_or(false) {
                            #[cfg(windows)]
                            win32::send_to_bottom(&win);
                        }
                    }
                });
            }

            // First run: no feed configured yet -> open Settings directly
            if crate::secret::get()?.is_none() && commands::env_feed_url_for_setup() {
                commands::open_settings(handle.clone());
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            let is_widget = window.label() == WIDGET_LABEL;
            match event {
                WindowEvent::CloseRequested { api, .. } if is_widget => {
                    api.prevent_close();
                    hide_widget(window.app_handle());
                }
                WindowEvent::Moved(_) | WindowEvent::Resized(_) if is_widget => {
                    let app = window.app_handle();
                    persist_bounds(app);
                    if PIN_TO_DESKTOP.load(Ordering::Relaxed) {
                        #[cfg(windows)]
                        if let Some(w) = app.get_webview_window(WIDGET_LABEL) {
                            win32::send_to_bottom(&w);
                        }
                    }
                }
                WindowEvent::Focused(false) if is_widget
                    && PIN_TO_DESKTOP.load(Ordering::Relaxed) => {
                        #[cfg(windows)]
                        if let Some(w) = window.app_handle().get_webview_window(WIDGET_LABEL) {
                            win32::send_to_bottom(&w);
                        }
                    }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
