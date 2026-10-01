# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-10-01

### Added
- **Multi-feed support** (`src/feeds.js`, `src/multiFetch.js`): connect multiple calendar feeds simultaneously (BRONE academic calendar + external feeds).
- **Google Calendar support**: import deadlines directly via Google Calendar secret iCal address (`https://calendar.google.com/calendar/ical/.../basic.ics`), with automatic URL normalization.
- **Local custom events** (`src/localEvents.js`): add and manage offline deadline events manually with validation and seamless merging into the urgency task list.
- **Theme switching**: Gelap (Dark), Terang (Light), and Otomatis (follows OS/system preference) available across Windows desktop and Android (`src/settings.js`, `src-tauri/src/settings.rs`).
- **Version consistency test** (`test/version.test.js`): automated test verifying version alignment across `package.json`, `Cargo.toml`, and `tauri.conf.json`.

### Changed
- **Rust release profile**: unified `[profile.release]` with `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, and `strip = true` for both desktop Windows and Android builds.
- **Release packaging**: Android APK distributed as arm64-only (`~9.8 MB`, down from ~62 MB universal build).
- **Standardized artifact naming**: release binaries standardized to versionless permanent download targets (`Reminder-Widget-Setup-x64.exe`, `Reminder-Widget-Portable-x64.exe`, `BRONE-Reminder-arm64.apk`, and `SHA256SUMS.txt`).
- **Single source of truth for versioning**: `tauri.conf.json` version linked to `package.json`.

### Fixed & Security
- **Mutex hardening**: replaced `lock().unwrap()` with poison-safe `.unwrap_or_else(|e| e.into_inner())` across background login webview threads (`src-tauri/src/brone_login.rs`).
- **Repository hygiene**: removed stray local logs and Windows local file paths; sanitized mockups to prevent personal identifier exposure; updated license copyright to 2026.
- **Audit asset consolidation**: consolidated official v8 audit screenshots in `docs/audit/2.0/` and archived previous iterations.
- All 81 unit tests pass (`npm test`).

## [1.1.0] - 2026-10-01 (Android Build v8 — Audit 2.0 Patch)

### Added
- **Android home-screen widget**: scrollable `ListView` backed by `WidgetTaskService`, shows hero (tasks[0]) + unlimited scrollable rows; widget height auto-fills available space.
- **Status bar style sync** (`setStatusBarStyle`): light icons on dark theme, dark icons on light theme — wired to `FileObserver` on `settings.json` in `MainActivity.kt`.
- **`BootReceiver`**: rebuilds widget data on device reboot so widget stays current after a cold boot.
- **Manual event bottom sheet**: add local (non-feed) events with title, date, time, and optional note directly from the home screen.
- **Segmented controls**: theme selector (Gelap / Terang / Otomatis), refresh interval (15 / 20 / 30 min), and notification threshold chips (1j / 6j / 12j / 24j).
- **`taskFormat.js`**: shared duration-formatting module used by both renderer and widget service; ensures consistent overdue labels (e.g. "Terlewat 2 hari" not "Terlewat 2hr").

### Changed
- **Android widget hero label**: overdue days format changed from `"Terlewat Xhr"` → `"Terlewat X hari"` (consistent with list rows and WCAG audit N4).
- **Widget layout**: removed static "Ketuk untuk buka aplikasi" footer (audit A7); time column widened to 114dp so "Terlewat 29 hari" never clips (audit D1/D2).
- **Settings layout**: header "Pengaturan" centered (C1); all cards use uniform 20dp gutter (C5); desktop-only cards (`desktop-card`, `.mode-options`) hidden on Android (N3); sheet body uses `flex: 1` + `overflow-y: auto` so it always fills the viewport (B2).
- **Bottom sheet title**: removed " · v8" debug marker (N2).
- **Home screen gutter**: `stage` padding-left clamped to `max(20px, env(safe-area-inset-left))` so content never touches screen edge on phones with zero safe-area (C2/C3).
- **Completed task panel** (`.drow`): title font-weight reset to 400 (was 600), column aligned at x=352 matching active rows (B3); restore button flush to right gutter (B5).
- **Status text**: sync age spelled out in full ("baru saja", "5 mnt", "2 jam", "1 hari") for both app header and widget header (C8).

### Fixed
- **`SyntaxError` in `settings.js`**: duplicate `const isMob` declaration (line 464) silently killed the entire settings module — chips, segmented controls, and slider never rendered. Removed duplicate.
- **`api.setStatusBarStyle` missing**: method was called but not implemented; added `cmd('set_status_bar_style', …).catch(() => {})` with optional chaining guard to prevent crash on desktop.
- **Widget not updating after settings change**: `ReminderAppWidgetProvider.updateAllWidgets()` now called from `MainActivity` on every settings write.
- **Done-task row contrast (A1)**: completed items on light theme had white icons on `#F5F4F1` (1.10:1 ratio); fixed by binding icon color to `--ink-600` token.
- All 80 unit tests pass.

## [1.0.0] - 2026-08-26

### Added
- **Tauri v2 rewrite** (replaces Electron v1): installer 4 MB (was 79 MB), idle RAM ~46 MB (was 150+ MB), zero npm runtime deps.
- **Mark done & Restore** — per-task ✓ to hide, "Selesai" section with ↺ restore button; persists across restarts; excluded from notifications/digest/tray.
- **Auto-detect submission (opt-in)** — hidden checker webview reuses login session, visits each task's BRONE assign page, marks done on "Submitted for grading" detection. Rate-limited: 1×/6h per task, max 8 per batch. Requires active BRONE login. Off by default.
- **Configurable settings**: refresh interval (15–30 min, default 20), notification thresholds (hours before deadline, default 24/6/1), widget opacity (35–100%), display mode (always-on-top / desktop-pin).
- **GitHub Actions CI/CD**: CI runs tests + clippy on every push/PR; Release workflow builds NSIS installer + portable exe on tag `v*` and creates GitHub Release with artifacts.
- **Architecture**: pure Rust shell (window, tray, secrets, persistence, webview management) + vanilla ESM frontend (fetch, parse, notifications, done-map, auto-detect queue). Parser rewritten (no node-ical/moment); Tauri plugins for notification, autostart, http, clipboard, single-instance.

### Changed
- Version reset to **1.0.0** (same product line as Electron v1, Tauri rewrite).
- Renamed crate/binary from `reminder-widget-v2` → `reminder-widget` (product name "Reminder Widget", binary `Reminder Widget.exe`).
- Version bumped to **1.0.0** (same product line, Tauri rebuild).
- Installer size: 4 MB (was 79 MB), portable exe 16 MB.
- Idle RAM ~46 MB (was 150–250 MB).
- No npm runtime dependencies (zero).
- Removed double `feed-changed` emit (JS→Rust duplicate).
- Refactored parser: dropped `node-ical` + `moment` (≈7 MB), hand-rolled iCal parser for Moodle export shape (TZID via Intl, DATE/UTC/floating, escapes, unfolding, no RRULE expansion).

### Fixed
- **Critical**: `toggle_widget` debounce was always-zero (`Instant::now().elapsed()`), blocking tray/menu hide — fixed with epoch millis.
- **Critical**: `renderDigest` syntax break from prior done-section commit (duplicate calls, orphaned braces, missing function header).
- **Critical**: `toggle_widget` debounce never fired → tray/menu hide never worked.
- **Auto-detect** fixes: checker window stays hidden on reuse; Chrome UA to avoid SSO/Cloudflare blocks; break loop on final verdict (no 12s timeout burn); main-thread channel hang-safe; autoDetect enable triggers immediate check.
- **Mark-done restore**: `doneStore.doneList` added (TDD) to power "Selesai" section; auto-prune stale entries when task leaves feed past keep-overdue window.
- **Auto-detect toggle** now triggers immediate check (no waiting for refresh cycle).
- **lastChecked** updated only on definitive verdicts (yes/no/login); "unknown" retries next cycle.
- **Placeholder** shows "Selesai" section when all tasks done (not "Nothing due").
- **Rust `set_opacity`** absent in Tauri 2.11 → opacity applied via CSS `document.body.style.opacity` in renderer.
- `apply_display_mode` / `startFeed` serialized to prevent orphan fetchers (startSeq token).
- `feed_url_set` now broadcasts `feed-changed` from Rust; JS `emitFeedChanged` removed.
- `feed-changed` capability scoped to `https://brone.ub.ac.id/*` only.
- Clippy clean (`-D warnings`), all 42 tests pass.

## [0.1.0] - 2026-08-25 (Internal Tauri v2 prototype, unpublished)

- Initial Tauri v2 port from Electron v1.

[1.2.0]: https://github.com/Zxaviers/reminder-widget/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Zxaviers/reminder-widget/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Zxaviers/reminder-widget/releases/tag/v1.0.0