//! Direct Win32 integration for window z-order and desktop layers.
//!
//! Port of v1's desktopLayer.js (koffi FFI) to the `windows` crate:
//! - `make_tool_window`: WS_EX_TOOLWINDOW so Win+D ignores the widget.
//! - `bring_to_top` / `send_to_bottom`: z-order band moves.
//! - Desktop-pin mode re-asserts HWND_BOTTOM on a guard interval; a no-op
//!   write (already at bottom) is skipped because SetWindowPos is what reads
//!   as a blink on a transparent frameless window.

#![cfg(windows)]

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindow, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GW_HWNDLAST,
    HWND_BOTTOM, HWND_TOPMOST, SET_WINDOW_POS_FLAGS, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOOWNERZORDER, SWP_NOSIZE, WINDOW_EX_STYLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

// The windows crate's BitOr for flag types is not const, so the combined
// flags are built at call time.
fn flags_zorder() -> SET_WINDOW_POS_FLAGS {
    SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_NOOWNERZORDER
}

fn hwnd_of(win: &tauri::WebviewWindow) -> Option<HWND> {
    // Tauri re-exports the same `windows` crate version we depend on, but go
    // through the raw handle so minor version drift cannot break the build.
    let raw = win.hwnd().ok()?;
    Some(HWND(raw.0))
}

pub fn make_tool_window(win: &tauri::WebviewWindow) -> bool {
    let Some(hwnd) = hwnd_of(win) else {
        return false;
    };
    unsafe {
        let Some(current) = get_ex_style(hwnd) else {
            return false;
        };
        let updated = (current | WS_EX_TOOLWINDOW) & !WS_EX_APPWINDOW;
        if current == updated {
            return true;
        }
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, updated.0 as isize);
        // FRAMECHANGED forces DWM to rebuild the frame buffer — only ever run
        // when the style genuinely changed (guarded above).
        let flags = flags_zorder() | SWP_FRAMECHANGED;
        SetWindowPos(hwnd, Some(HWND_BOTTOM), 0, 0, 0, 0, flags).is_ok()
    }
}

pub fn bring_to_top(win: &tauri::WebviewWindow) -> bool {
    let Some(hwnd) = hwnd_of(win) else {
        return false;
    };
    unsafe { SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, flags_zorder()).is_ok() }
}

/// True when `hwnd` already sits at the bottom of its z-order chain.
fn is_at_bottom(hwnd: HWND) -> bool {
    unsafe { matches!(GetWindow(hwnd, GW_HWNDLAST), Ok(last) if last == hwnd) }
}

pub fn send_to_bottom(win: &tauri::WebviewWindow) -> bool {
    let Some(hwnd) = hwnd_of(win) else {
        return false;
    };
    if is_at_bottom(hwnd) {
        return true;
    }
    unsafe { SetWindowPos(hwnd, Some(HWND_BOTTOM), 0, 0, 0, 0, flags_zorder()).is_ok() }
}

unsafe fn get_ex_style(hwnd: HWND) -> Option<WINDOW_EX_STYLE> {
    let raw = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    Some(WINDOW_EX_STYLE(raw as u32))
}
