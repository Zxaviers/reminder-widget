# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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