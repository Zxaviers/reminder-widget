# Contributing to BRONE Reminder Widget

Thank you for your interest in contributing to BRONE Reminder Widget! This guide covers our development workflow, coding standards, and testing procedures.

---

## 🚀 Quick Start

```bash
# 1. Clone repository
git clone https://github.com/Zxaviers/reminder-widget.git
cd reminder-widget

# 2. Install dependencies
npm install

# 3. Run unit tests
npm test

# 4. Run in development mode (Desktop Windows)
npm run tauri dev
```

For Android development prerequisites and setup (JDK 17, Android NDK 27.3), refer to [docs/PLAN-ANDROID-PORT.md](docs/PLAN-ANDROID-PORT.md).

---

## 📋 Development Workflow

### Branch Naming
- `feat/short-description`: New features
- `fix/short-description`: Bug fixes
- `docs/short-description`: Documentation updates
- `refactor/short-description`: Code restructuring
- `chore/short-description`: Maintenance and pipeline changes

### Commit Messages (Conventional Commits)
All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
```
feat: add multi-feed support for Google Calendar
fix(desktop): restore transparent window and fix header button overlap
docs: update README with Android limitations and setup steps
chore(ci): update release workflow for arm64 Android APK
```

### Pre-commit Verification
Before committing and pushing your code, run all required checks locally:
```bash
npm test                                                      # All unit tests must pass
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings # Rust clippy linting (0 warnings)
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check     # Rust formatting
```

---

## 🏗️ Project Architecture Overview

```
reminder-widget/
├── src/                    # Frontend (Vanilla ESM, zero-bundler)
│   ├── renderer.js         # Main widget UI and autosizing logic
│   ├── settings.js         # Settings modal and input synchronization
│   ├── api.js              # Tauri IPC bridge & platform detection
│   ├── feeds.js            # Multi-feed configuration & normalization
│   ├── multiFetch.js       # Concurrent calendar feed fetcher
│   ├── parseTasks.js       # iCalendar (RFC 5545) VEVENT parser
│   ├── localEvents.js      # Offline manual event manager
│   ├── doneStore.js        # Mark-done state and undo manager
│   ├── icons.js            # Official Phosphor icon SVG paths
│   └── taskFormat.js       # Due date formatting & countdowns
├── src-tauri/              # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── main.rs         # Application entry point
│   │   ├── lib.rs          # Tauri runtime & plugin initialization
│   │   ├── commands.rs     # IPC command handlers
│   │   ├── settings.rs     # Configuration model and persistence
│   │   ├── secret.rs       # Credential storage (Keyring / private storage)
│   │   ├── tray.rs         # Windows system tray menu and toggles
│   │   ├── detect.rs       # Moodle submission detection webview
│   │   └── win32.rs        # Windows desktop z-order management
│   ├── gen/android/        # Android platform project (Gradle + Kotlin)
│   └── Cargo.toml
├── docs/                   # Documentation, specifications, and audit screenshots
│   ├── RELEASING.md        # Official release guide & CI pipeline instructions
│   └── audit/2.0/          # Baseline UI/UX audit captures
└── test/                   # Node.js built-in test runner test suite
```

---

## 🧪 Testing Guidelines

We use Node.js's native test runner (`node --test`) without third-party frameworks.

```bash
# Run the complete test suite
npm test

# Run a specific test module
node --test test/parseTasks.test.js
node --test test/feeds.test.js
node --test test/localEvents.test.js
node --test test/version.test.js
```

### Testing Rules
1. **Pure functions in isolation**: Keep parsers, state reducers, and string formatters pure and side-effect free.
2. **Never guess API signatures**: Check actual Tauri v2 and DOM APIs before writing tests.
3. **Keep tests fast**: The entire test suite must execute in under 10 seconds.

---

## 📝 Pull Request Checklist

When opening a Pull Request:
- [ ] `npm test` passes completely (all suites green).
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` returns 0 warnings.
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passes cleanly.
- [ ] No personal identifiers, student IDs, real feed URLs, or local absolute paths (`C:\Users\...`) in committed files or tests.
- [ ] If changing release processes, review and update [`docs/RELEASING.md`](docs/RELEASING.md).
- [ ] Relevant documentation and changelog entries are included.

---

## 🐛 Reporting Issues & Requesting Features

- For bug reports, use the [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.yml).
- For feature suggestions, use the [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.yml).
- For security vulnerabilities, **do not open a public issue** — follow our [Security Policy](SECURITY.md).