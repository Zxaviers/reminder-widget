# 📅 BRONE Reminder Widget

> **Compact always-on-top desktop widget for Moodle / BRONE (UB) assignment
> deadlines — built on Tauri v2.**

Same widget, at a fraction of the size:

| | Old (Electron) | **Current (Tauri)** |
|---|---|---|
| Installer | 79 MB | **~4 MB** |
| Standalone exe | ~180 MB installed | **~16 MB** |
| Idle RAM | 150–250 MB typical | **~46 MB** |
| Runtime deps | electron, koffi, node-ical (+moment) | **none** (zero npm runtime deps) |

---

## ✨ Features

Everything you need, plus the **mark-done** feature:

- **✅ Mark done (NEW)** — submitted an assignment on BRONE but the deadline still
  shows? Click the ✓ button on the task row: it disappears instantly, with a
  6-second **Urungkan (Undo)** toast. Marks persist across restarts and are
  skipped by notifications, the collapsed digest, and the tray's *next*
  tooltip. Entries for tasks that leave the feed are auto-pruned once their
  deadline falls out of the 3-day overdue window.
- **↺ Restore + "Selesai" section** — accidentally marked a task done? Open the
  **Selesai** section at the bottom of the list and click ↺ to bring the
  reminder back.
- **🤖 Auto-detect submission (opt-in)** — with "Tandai otomatis saat tugas
  sudah dikumpul" enabled, a hidden checker window visits each task's BRONE
  page through your logged-in session and auto-marks it done when it detects
  "Submitted for grading". Rate-limited (each task at most once per 6 hours,
  max 8 per batch) to stay polite to the campus server. Requires an active
  BRONE login; off by default.
- 🚀 **Live countdown** — nearest-first list, amber inside 24h, red when overdue.
- 🖥️ **Dual display modes** — floating always-on-top, or pinned behind all
  windows on the wallpaper layer (Win32 `HWND_BOTTOM` + `WS_EX_TOOLWINDOW`).
- 🔔 **Configurable toasts** — notification thresholds (default 24h/6h/1h) are
  editable in Settings; fired once per task per threshold.
- 🔄 **Polite sync** — conditional GET (ETag / If-Modified-Since), 15-minute
  minimum refresh floor (interval configurable 15–30 min), offline retry
  ladder, instant render from cache.
- 🌓 **Widget opacity slider** — 35–100%, applied live from Settings.
- 🔐 **Private & secure** — the feed URL (which carries your personal Moodle
  token) lives in **Windows Credential Manager**, never plaintext.
- 🪟 **Tray integration** — toggle, settings, refresh, display-mode,
  autostart, notification toggles, reset position.
- ⚡ **Single instance** — launching twice focuses the existing widget.
- 🔗 **Assisted BRONE login** — an in-app window walks through UB SSO and lifts
  your calendar export URL automatically (manual paste always available).

---

## 📥 Install

Build it yourself (see below) or grab `Reminder Widget_1.0.0_x64-setup.exe`
from the build output (`src-tauri/target/release/bundle/nsis/`). The bare
`reminder-widget.exe` in `target/release/` runs standalone without install.

## ⚙️ Connect your calendar

1. Open BRONE → **Calendar → Export calendar**.
2. Choose *all events* + *recent & next 60 days* → **Get calendar URL**, copy it.
3. In the widget: Settings ⚙️ → paste → **Simpan URL**
   (or use the assisted login button).

The widget refreshes automatically every 20 minutes (never faster than 15).

---

## 💻 Development

Prerequisites: **Windows 10/11**, **Node 18+**, **Rust (MSVC toolchain)** +
[VS Build Tools C++ workload](https://visualstudio.microsoft.com/downloads/),
WebView2 Runtime (preinstalled on updated Windows).

```bash
npm install
npm run tauri dev      # run with hot reload
npm test               # node --test (42 tests: parser + doneStore + queue + notify)
npm run tauri build    # release exe + NSIS installer
```

### Architecture

```
src-tauri/                 Rust shell (native surfaces only)
├── src/lib.rs             setup, widget window, display modes, guard thread
├── src/tray.rs            tray icon + context menu
├── src/commands.rs        IPC surface (autosize, settings, secrets, notify…)
├── src/win32.rs           z-order / desktop-pin via windows crate (ex-koffi)
├── src/settings.rs        settings.json (camelCase, v1-compatible fields)
├── src/secret.rs          keyring → Windows Credential Manager
└── src/brone_login.rs     assisted login window (title-channel extraction)

src/                       Frontend (vanilla ESM, no bundler)
├── index.html / style.css / renderer.js     the widget page
├── settings.html / settings.css / settings.js
├── api.js                 typed bridge over Tauri IPC (ex-preload.js)
├── fetchCalendar.js       fetch + ETag cache + retry ladder (transport-injectable)
├── parseTasks.js          zero-dependency RFC 5545 parser (TZID, all-day, escapes)
└── doneStore.js           pure mark-done state machine

test/                      node:test suite — parseTasks + doneStore
```

**Design notes**

- The **renderer owns data**: fetching, parsing, notification thresholds and
  the done-map all live in the webview; Rust owns windows, tray, toasts,
  secrets and persistence commands.
- `parseTasks.js` replaces node-ical/moment with a minimal parser covering
  exactly what Moodle emits (TZID wall-clock conversion via `Intl`, UTC,
  floating times, `VALUE=DATE`, text escaping, line unfolding). RRULE events
  count as a single occurrence — v1 already treated expansion failure that way,
  and Moodle deadline feeds don't emit RRULE.
- Done-marks live in `settings.json` as `{ taskId: ISO-date }`; ids are
  `${uid}::${dueMs}` straight from the feed, so they survive refreshes.

### Differences vs v1

- Feed URL secret moved from DPAPI blob in settings.json → Windows Credential
  Manager (keyring). A v1 settings.json upgrades cleanly; re-enter the URL once
  if you used the old encrypted field.
- Manual tray "Refresh Sekarang" intentionally bypasses the 15-min floor
  (same as v1); scheduled refreshes never do.
- Clipboard paste in Settings uses the WebView2 clipboard API; if Windows
  blocks it, paste into the manual URL box with Ctrl+V.

## 🔒 Privasi

Zero telemetry. Requests go only to `brone.ub.ac.id` calendar endpoints (the
http capability is scoped to them). No credentials are ever stored or read —
the login window only harvests the export URL you could copy yourself.

## 📜 License

MIT — same as v1.
