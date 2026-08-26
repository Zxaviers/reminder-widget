# 📅 BRONE Reminder Widget

> **Compact, always-on-top desktop reminder widget for Moodle / BRONE (UB) assignment deadlines from iCalendar (.ics) feed.**

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Build](https://img.shields.io/github/actions/workflow/status/Zxaviers/reminder-widget/ci.yml?branch=main)
![Release](https://img.shields.io/github/v/release/Zxaviers/reminder-widget)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A sleek Windows desktop widget designed to keep students on track with upcoming course deadlines. Deadlines are sorted nearest-first with a high-visibility live countdown.

---

## 🎬 Demo

| Light Theme | Dark Theme |
|-------------|------------|
| ![Widget Light](assets/widget-light.png) | ![Widget Dark](assets/widget-dark.png) |

*The widget in floating mode (left) and desktop mode (right). Add your own screenshots to `assets/widget-light.png` and `assets/widget-dark.png`.*

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **🚀 Live Countdown** | Real-time ticker with dynamic color urgency: <br>🟢 Normal • 🟡 Amber (≤24h) • 🔴 Red (Overdue) |
| **🖥️ Dual Display Modes** | **Floating** (always on top) or **Desktop** (pinned to wallpaper layer) |
| **🔔 Toast Notifications** | Native Windows toast at 24h, 6h, and 1h before deadline |
| **✅ Mark Done & ↺ Restore** | Click ✓ to hide task; restore from "Selesai" section with one click |
| **🤖 Auto-Detect Submission** | Opt-in: checks BRONE assignment pages for "Submitted" status |
| **🔄 Polite Sync** | Conditional GET (ETag/If-Modified-Since), 15-min minimum refresh |
| **🔒 Private & Secure** | Encrypted via Windows DPAPI, direct connection only, zero telemetry |
| **🪟 Tray Integration** | Minimize to tray, toggle visibility, auto-start, display mode switch |
| **🌓 Opacity Slider** | 35–100% transparency, live preview |
| **⌨️ Keyboard Shortcuts** | `Esc` to hide, `F5`/`Ctrl+R` to refresh, `Esc` to hide |

---

## 📥 Quick Start

### 1️⃣ Download & Install

| Option | Description | Download |
|--------|-------------|----------|
| **📦 Installer (Recommended)** | Creates Start Menu & Desktop shortcuts | [📥 Setup.exe](https://github.com/Zxaviers/reminder-widget/releases/download/v1.0.0/Reminder.Widget.Setup.1.0.0.exe) |
| **📦 Portable** | No install, run directly | [📥 Portable.exe](https://github.com/Zxaviers/reminder-widget/releases/download/v1.0.0/Reminder.Widget.1.0.0.exe) |

> **Requirements:** Windows 10/11 with WebView2 Runtime (pre-installed on modern Windows)

### 2️⃣ Connect Your BRONE/Moodle Calendar

1. Open your **Moodle/BRONE** site → Login
2. Open **Calendar** → **Export calendar**
3. Select: **All events** + **Recent & next 60 days**
4. Click **Get calendar URL** → Copy the URL
4. In Widget: **Settings (⚙️)** → Paste URL → **Save**

> The URL looks like: `https://brone.ub.ac.id/calendar/export_execute.php?userid=...&authtoken=...`

---

## ⚙️ Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| **Display Mode** | Floating | `Floating` (always on top) or `Desktop` (wallpaper layer) |
| **Auto-Start** | Off | Launch silently at Windows login |
| **Notifications** | ✅ Enabled | Toast at 24h, 6h, 1h before deadline |
| **Auto-Detect Submission** | Off | Auto-mark done when BRONE shows "Submitted" |
| **Refresh Interval** | 20 min | 15–30 min (min 15 min per spec) |
| **Notification Thresholds** | 24h, 6h, 1h | Customizable hours before deadline |
| **Opacity** | 100% | 35–100% (live preview) |
| **Auto-Detect Submission** | Off | Auto-mark done when BRONE shows "Submitted" |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Hide widget to tray |
| `F5` / `Ctrl+R` | Force refresh |
| `Click header` | Drag to move widget |
| `Click task title` | Open in browser |
| `Click ✓` | Mark done (hide) |
| `Click ↺` | Restore from Selesai |

---

## 🗑️ Uninstall

1. Open **Windows Settings** (`Win + I`) → **Apps** → **Installed apps**
2. Find **Reminder Widget** → `...` → **Uninstall**
3. Or right-click tray icon → **Quit**, then uninstall via Settings

---

## 🏗️ For Developers

### Prerequisites
- **Windows 10/11**
- **Node.js 18+** & **npm**
- **Rust stable (MSVC toolchain)** + VS Build Tools (C++ workload)
- WebView2 Runtime (pre-installed on Windows 10/11)

### Quick Start

```bash
# 1. Clone & install
git clone https://github.com/Zxaviers/reminder-widget.git
cd reminder-widget
npm install

# 2. Development (with hot reload)
npm run tauri dev

# 3. Run tests
npm test

# 4. Build installer + portable
npm run dist
```

### Project Structure

```
reminder-widget/
├── .github/workflows/       # CI/CD pipelines
├── assets/                  # Icons (ico, png)
├── dist/                    # Build output (generated)
├── node_modules/
├── src/                     # Frontend source (vanilla ESM)
│   ├── api.js               # Tauri IPC bridge
│   ├── renderer.js          # Main widget renderer
│   ├── settings.js          # Settings page logic
│   ├── api.js               # Tauri invoke wrappers
│   ├── fetchCalendar.js     # Feed fetcher + cache + retry
│   ├── parseTasks.js        # iCal parser (zero-dep)
│   ├── doneStore.js         # Mark-done state (TDD)
│   ├── submissionQueue.js   # Auto-detect queue (TDD)
│   ├── notifyConfig.js      # Notification config (TDD)
│   └── renderer/
│       ├── index.html       # Widget UI
│       ├── settings.html    # Settings page
│       ├── renderer.js      # Widget renderer
│       ├── settings.js      # Settings logic
│       ├── style.css        # Widget styles
│       └── settings.css     # Settings styles
├── src-tauri/               # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── lib.rs           # App setup, windows, tray
│   │   ├── commands.rs      # IPC commands
│   │   ├── tray.rs          # System tray
      |   ├── detect.rs      # Auto-detect checker
      |   ├── settings.rs    # Settings persistence
      |   ├── secret.rs      # Keyring (DPAPI)
      |   ├── win32.rs       # Win32 z-order (desktop pin)
      |   └── brone_login.rs # Assisted login
│   ├── Cargo.toml
│   └── tauri.conf.json
├── scripts/                 # Build helpers
├── test/                    # Unit tests (node:test)
└── scripts/collect-dist.js  # Post-build artifact collector
```

---

## 🧪 Testing

```bash
# Run all unit tests (parser, doneStore, queue, notify)
npm test

# Type-check frontend
node --check src/renderer.js
node --check src/settings.js
node --check src/api.js
# ... etc

# Lint Rust
cd src-tauri && cargo clippy -- -D warnings
```

### Test Coverage
- **Parser** (`parseTasks.test.js`): 20 tests - iCal parsing, TZID, phases, HTML stripping
- **Done Store** (`doneStore.test.js`): 6 tests - mark/unmark/visible/prune/undo
- **Submission Queue** (`submissionQueue.test.js`): 6 tests - rate limiting, ordering
- **Notify Config** (`notifyConfig.test.js`): 6 tests - threshold normalization

---

## 🏗️ Architecture

### High-Level Data Flow

```
┌─────────────┐     .ics feed      ┌──────────────┐     parsed tasks     ┌─────────────┐
│  BRONE      │ ─────────────────▶ │ Calendar     │ ─────────────────▶ │  Renderer   │
│  Moodle     │  (HTTPS, ETag)     │ Fetcher      │  (parseTasks.js)   │  (React-like)│
└─────────────┘                    └──────────────┘                    └──────┬──────┘
                                                                              │
                        ┌───────────────────────────────────────────────────┘
                        ▼
              ┌─────────────────────┐
              │   Done Store        │  (mark done, restore, prune)
              │  (doneStore.js)     │
              └──────────┬──────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
      ┌─────────┐  ┌───────────┐  ┌───────────┐
      │ Notifs  │  │ Tray      │  │ Tray      │
      │ (Toast) │  │ (Visibility)│ │ (Selesai) │
      └─────────┘  └───────────┘  └───────────┘
```

### Key Modules

| Module | Responsibility |
|--------|---------------|
| `fetchCalendar.js` | HTTP client, ETag cache, retry ladder, 15-min floor |
| `parseTasks.js` | iCal parser (RFC 5545), TZID via Intl, HTML strip, phase detection |
| `doneStore.js` | Mark done, restore, prune, undo — pure, TDD |
| `submissionQueue.js` | Auto-detect queue, rate limit (6h/task, 8/batch) |
| `notifyConfig.js` | Threshold normalization (hours → ms) |
| `detect.rs` | Hidden WebView, title-channel verdict (RWCHK:) |
| `win32.rs` | Win32 z-order (HWND_BOTTOM, WS_EX_TOOLWINDOW) |

---

## 🔧 Configuration Files

| File | Purpose |
|------|---------|
| `tauri.conf.json` | Tauri config (window, bundle, permissions) |
| `tauri.conf.json` > `build.frontendDist` | Points to `../src` |
| `Cargo.toml` | Rust dependencies & metadata |
| `package.json` | npm scripts, deps, metadata |
| `tauri.conf.json` > `bundle` | NSIS installer, portable, icons |

---

## 🔐 Security & Privacy

- **Zero telemetry** — no analytics, no crash reporting
- **Direct connection only** — widget ↔ BRONE only
- **Windows Credential Manager** — feed URL encrypted via DPAPI
- **Sandboxed renderer** — `contextIsolation: true`, `nodeIntegration: false`, strict CSP
- **Auto-detect opt-in** — only runs when explicitly enabled

---

## 📦 Building & Distribution

```bash
# Development
npm run tauri dev

# Production build
npm run dist
# Output: dist/Reminder Widget 1.0.0.exe (portable)
#         dist/Reminder Widget 1.0.0 Setup.exe (NSIS installer)
```

### CI/CD Pipeline

| Trigger | Workflow | Artifacts |
|---------|----------|-----------|
| Push/PR to `main` | **CI** (`.github/workflows/ci.yml`) | Runs tests, clippy, syntax check |
| Push tag `v*` | **Release** (`.github/workflows/release.yml`) | Builds NSIS + portable, creates GitHub Release |

---

## 🤝 Contributing

1. Fork the repo
2. Create feature branch: `git checkout -b feat/amazing-feature`
3. Run tests: `npm test && cd src-tauri && cargo clippy -- -D warnings`
4. Commit: `git commit -m 'feat: add amazing feature'`
5. Push & open PR

### Code Style
- **Rust**: `cargo fmt` + `cargo clippy -D warnings`
- **JS**: ES modules, `'use strict'`, JSDoc comments for exports
- **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Tauri** — for the amazing Rust+WebView framework
- **BRONE/UB** — for providing the iCal export feature
- **Students & developers** — for feedback & contributions

---

<div align="center">

**Made with ❤️ for students everywhere**

[⬆ Back to Top](#-brone-reminder-widget)

</div>

---

## 📄 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.