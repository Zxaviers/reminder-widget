# 📅 BRONE Reminder Widget

> **Compact, always-on-top desktop reminder widget for Moodle / BRONE (UB) assignment deadlines from iCalendar (.ics) feed.**

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-blue.svg)
![Build](https://img.shields.io/github/actions/workflow/status/Zxaviers/reminder-widget/ci.yml?branch=main)
![Release](https://img.shields.io/github/v/release/Zxaviers/reminder-widget)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A sleek Windows desktop widget designed to keep students on track with upcoming course deadlines. Deadlines are sorted nearest-first with a high-visibility live countdown.

---

## 📸 Preview

```
┌─────────────────────────────────────────────────────────────┐
│ 📅 BRONE Reminder Widget                     [🔄] [⚙️] [✕] │
├─────────────────────────────────────────────────────────────┤
│ 🟢 Tugas 1 - Pemrograman Web                 ⏳ 4 hari lagi │
│    Pemrograman Berbasis Web (Kelas A)                       │
├─────────────────────────────────────────────────────────────┤
│ 🟡 Kuis 2 - Basis Data Terdistribusi        ⏳ 18 jam lagi │
│    Sistem Basis Data (Kelas B)                   [✓ Selesai]│
├─────────────────────────────────────────────────────────────┤
│ 🔴 Laporan Akhir Praktikum                    ⚠️ Terlewat 2h│
│    Praktikum Jaringan Komputer                   [✓ Selesai]│
├─────────────────────────────────────────────────────────────┤
│ 📂 Selesai (1 tugas diselesaikan)                        [▼]│
└─────────────────────────────────────────────────────────────┘
```

*Deadlines are colour-coded by urgency (🟢 Upcoming • 🟡 Due within 24h • 🔴 Overdue).*

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
| **🔒 Private & Secure** | Encrypted via Windows Credential Manager, direct connection only, zero telemetry |
| **🪟 Tray Integration** | Minimize to tray, toggle visibility, auto-start, display mode switch |
| **🌓 Opacity Slider** | 35–100% transparency with live preview |
| **⌨️ Keyboard Shortcuts** | `Esc` to hide to tray, `F5` / `Ctrl+R` to force refresh |

---

## 📥 Quick Start

### 1️⃣ Download & Install

| Option | Description | Download |
|--------|-------------|----------|
| **📦 Installer (Recommended)** | Creates Start Menu & Desktop shortcuts | [📥 Setup.exe (~3.8 MB)](https://github.com/Zxaviers/reminder-widget/releases/download/v1.0.0/Reminder.Widget.1.0.0.Setup.exe) |
| **📦 Portable** | No install required, run directly | [📥 Portable.exe (~16.2 MB)](https://github.com/Zxaviers/reminder-widget/releases/download/v1.0.0/Reminder.Widget.1.0.0.exe) |

> **Requirements:** Windows 10/11 with WebView2 Runtime (pre-installed on modern Windows).

### 2️⃣ Connect Your BRONE/Moodle Calendar

1. Open your **Moodle / BRONE** website → Login
2. Open **Calendar** → **Export calendar**
3. Select: **All events** + **Recent and next 60 days**
4. Click **Get calendar URL** → Copy the URL
5. In Widget: Click **Settings (⚙️)** → Paste URL → Click **Save Settings**

> The URL looks like: `https://brone.ub.ac.id/calendar/export_execute.php?userid=...&authtoken=...`

---

## ⚙️ Settings Reference

| Setting | Default | Description |
|---------|---------|-------------|
| **Display Mode** | Floating | `Floating` (always on top) or `Desktop` (wallpaper layer) |
| **Auto-Start** | Off | Launch silently at Windows login |
| **Notifications** | ✅ Enabled | Toast notifications at configured thresholds |
| **Auto-Detect Submission** | Off | Auto-mark done when BRONE shows "Submitted for grading" |
| **Refresh Interval** | 20 min | Sync frequency (15–30 min range) |
| **Notification Thresholds** | 24, 6, 1 | Hours before deadline to trigger notifications |
| **Opacity** | 100% | Widget transparency level (35–100%) |

---

## ⌨️ Keyboard Shortcuts

| Key / Action | Result |
|--------------|--------|
| `Esc` | Hide widget to tray |
| `F5` / `Ctrl + R` | Force refresh feed |
| `Click header` | Drag to move widget position |
| `Click task title` | Open assignment directly in default browser |
| `Click ✓` | Mark task as completed (hide) |
| `Click ↺` | Restore completed task from "Selesai" section |

---

## 🗑️ Uninstall

1. Open **Windows Settings** (`Win + I`) → **Apps** → **Installed apps**
2. Find **Reminder Widget** → click `...` → select **Uninstall**
3. Or right-click the tray icon → select **Quit**, then uninstall via Windows Settings

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

# 3. Run test suite (42 tests)
npm test

# 4. Build installer + portable executable
npm run dist
```

### Project Structure

```
reminder-widget/
├── .github/workflows/       # GitHub Actions CI & Release pipelines
├── assets/                  # Application icons & tray graphics
├── dist/                    # Release output (generated by npm run dist)
├── src/                     # Frontend source (vanilla ESM, no bundler needed)
│   ├── index.html           # Main widget HTML structure
│   ├── renderer.js          # Widget UI & countdown ticker
│   ├── style.css            # Widget dark glassmorphism styling
│   ├── settings.html        # Settings window UI
│   ├── settings.js          # Settings logic & form bindings
│   ├── settings.css         # Settings page styling
│   ├── checker.html         # Background submission detection webview
│   ├── api.js               # Typed bridge over Tauri IPC
│   ├── fetchCalendar.js     # HTTP client + ETag cache + retry ladder
│   ├── parseTasks.js        # Zero-dep RFC 5545 iCal parser
│   ├── doneStore.js         # Pure mark-done & restore state machine
│   ├── submissionQueue.js   # Rate-limited auto-detect queue
│   └── notifyConfig.js      # Notification threshold helpers
├── src-tauri/               # Rust native backend
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── lib.rs           # Window setup & lifecycle
│   │   ├── commands.rs      # Tauri IPC command handlers
│   │   ├── tray.rs          # System tray icon & context menu
│   │   ├── detect.rs        # Submission detection engine
│   │   ├── settings.rs      # Settings JSON persistence
│   │   ├── secret.rs        # Keyring / Windows Credential Manager
│   │   ├── win32.rs         # Win32 z-order desktop pinning
│   │   └── brone_login.rs   # 1-click assisted login window
│   ├── Cargo.toml           # Rust dependencies & metadata
│   └── tauri.conf.json      # Tauri app & bundle configuration
├── scripts/
│   └── collect-dist.js      # Post-build artifact collector
└── test/                    # Node test suite (node:test)
    ├── parseTasks.test.js
    ├── doneStore.test.js
    ├── submissionQueue.test.js
    └── notifyConfig.test.js
```

---

## 🧪 Testing

```bash
# Run all unit tests (42 tests: parser, doneStore, queue, notify)
npm test

# Syntax check frontend files
node --check src/renderer.js
node --check src/settings.js
node --check src/api.js

# Lint Rust codebase
cd src-tauri && cargo clippy -- -D warnings
```

---

## 🔐 Security & Privacy

- **Zero telemetry** — no tracking, analytics, or third-party servers.
- **Direct connection only** — requests only communicate directly with `brone.ub.ac.id`.
- **Windows Credential Manager** — feed URL and private tokens are encrypted using Windows DPAPI.
- **Sandboxed WebView** — strict Content Security Policy (CSP).
- **Opt-in auto-detection** — background checking only runs when explicitly activated in Settings.

---

## 📄 License & Changelog

- **License**: [MIT License](LICENSE)
- **Changelog**: See [CHANGELOG.md](CHANGELOG.md) for detailed version history.