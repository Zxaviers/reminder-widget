# Contributing to BRONE Reminder Widget

Thank you for your interest in contributing! This guide will help you get started.

## 🚀 Quick Start

```bash
# 1. Fork & clone
git clone https://github.com/Zxaviers/reminder-widget.git
cd reminder-widget

# 2. Install dependencies
npm install

# 3. Run tests
npm test

# 4. Run in development
npm run tauri dev
```

## 📋 Development Workflow

### Branch Naming
```
feat/short-description    # New feature
fix/short-description     # Bug fix
docs/short-description    # Documentation only
refactor/short-description # Code restructuring
test/short-description    # Adding tests
chore/short-description   # Maintenance
```

### Commit Messages (Conventional Commits)
```
feat: add auto-detect submission feature
fix: fix notification threshold parsing
docs: update README with auto-detect guide
refactor: extract parser to separate module
test: add tests for submission queue
```

### Pre-commit Checks (run before commit)
```bash
npm test                    # All unit tests pass
cd src-tauri && cargo clippy -- -D warnings  # Rust linting
node --check src/**/*.js    # Syntax check
```

---

## 🏗️ Project Structure Overview

```
reminder-widget/
├── src/                    # Frontend (vanilla ESM)
│   ├── renderer.js         # Main widget logic
│   ├── settings.js         # Settings page
│   ├── api.js              # Tauri IPC bridge
│   ├── parseTasks.js       # iCal parser (pure, TDD)
│   ├── fetchCalendar.js    # Feed fetcher + cache
│   ├── doneStore.js        # Mark-done state (TDD)
│   ├── submissionQueue.js  # Auto-detect queue
│   └── notifyConfig.js     # Threshold normalization
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── lib.rs          # App setup
│   │   ├── commands.rs     # IPC commands
│   │   ├── tray.rs         # System tray
│   │   ├── detect.rs       # Auto-detect checker
│   │   └── win32.rs        # Win32 z-order
│   └── Cargo.toml
└── test/                    # Unit tests
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test file
node --test test/parseTasks.test.js
node --test test/doneStore.test.js
node --test test/submissionQueue.test.js
node --test test/notifyConfig.test.js

# Rust tests (if any)
cd src-tauri && cargo test
```

### Writing Tests
- **Pure functions** → test in isolation (e.g., `parseTasks.js`, `doneStore.js`)
- **Test naming**: `describe('feature', () => { test('does X when Y', () => { ... }) })`
- **TDD**: Write failing test first → make it pass → refactor

---

## 🎨 Code Style

### JavaScript/TypeScript
- ES Modules (`type: "module"` in package.json)
- `'use strict'` at top of every file
- JSDoc for exported functions
- 2 spaces, no semicolons (project convention)
- JSDoc `@param` / `@returns` for public APIs

### Rust
```bash
cargo fmt          # Format
cargo clippy -- -D warnings  # Lint (must pass)
```

### Rust Conventions
- `snake_case` for functions/variables
- `PascalCase` for types
- `UPPER_SNAKE_CASE` for constants
- `Result<T, E>` for fallible operations
- `Option<T>` for nullable values

---

## 🏗️ Architecture Overview

```
┌─────────────┐    .ics feed      ┌──────────────┐     parsed tasks      ┌─────────────┐
│   BRONE     │ ────────────────▶ │ Calendar     │ ─────────────────▶ │  Renderer   │
│   Moodle    │  (HTTPS, ETag)    │ Fetcher      │  (parseTasks.js)   │  (vanilla)  │
└─────────────┘                    └──────────────┘                    └──────┬──────┘
                                                                             │
                                    ┌───────────────────────────────────────┘
                                    ▼
                          ┌─────────────────────┐
                          │   Done Store        │  (mark done, restore, prune)
                          │  (doneStore.js)     │
                          └──────────┬──────────┘
                                     │
                     ┌───────────────┼───────────────┐
                     ▼               ▼               ▼
              ┌─────────┐    ┌───────────┐    ┌───────────┐
              │ Notifs  │  │ Tray      │  │ Selesai   │
              │ (Toast) │  │ (Vis)     │  │ (Restore) │
              └─────────┘  └───────────┘  └───────────┘
```

### Key Modules

| Module | Responsibility | Test Coverage |
|--------|---------------|---------------|
| `fetchCalendar.js` | HTTP client, ETag cache, retry ladder | Manual |
| `parseTasks.js` | iCal parser, TZID, phases | ✅ 20 tests |
| `doneStore.js` | Mark done, restore, prune, undo | ✅ 6 tests |
| `submissionQueue.js` | Auto-detect queue | ✅ 6 tests |
| `notifyConfig.js` | Threshold normalization | ✅ 6 tests |
| `detect.rs` | Hidden WebView checker | Manual |
| `win32.rs` | Win32 z-order (HWND_BOTTOM) | Manual |

---

## 🔧 Adding Features

### Adding a New Setting
1. **Rust**: Add field to `Settings` struct in `src-tauri/src/settings.rs`
2. **Rust**: Add to `Default` impl and `serde` attributes
3. **Commands**: Add getter/setter in `commands.rs`
4. **Frontend**: Add UI in `settings.html` + handler in `settings.js`
5. **Renderer**: Read from `settingsDoc` in `renderer.js`

### Adding a Notification Threshold
1. Update `NOTIFY_THRESHOLDS_MS` default in `renderer.js`
2. Add input in `settings.html` + handler in `settings.js`
3. Normalize in `notifyConfig.js` (already handles dynamic arrays)
4. `evaluateNotifications()` reads from `notifyThresholdsMs`

### Adding a Tauri Command
1. **Rust**: Add `#[tauri::command]` function in `commands.rs`
2. **Rust**: Register in `invoke_handler!` in `lib.rs`
3. **Frontend**: Add to `api.js` with `cmd('command_name', args)`
4. **Types**: Add JSDoc `@returns` for IDE support

---

## 🧪 Testing Guidelines

### Running Tests
```bash
# All tests
npm test

# Single file
node --test test/parseTasks.test.js

# Watch mode (if configured)
npm run test:watch
```

### Writing a Test
```javascript
// test/myFeature.test.js
'use strict'

import test from 'node:test'
import assert from 'node:assert/strict'
import { myFunction } from '../src/myModule.js'

test('myFunction returns doubled value', () => {
  assert.equal(myFunction(2), 4)
})

test('myFunction throws on negative', () => {
  assert.throws(() => myFunction(-1), /positive/)
})
```

---

## 📝 Pull Request Checklist

- [ ] Tests pass: `npm test`
- [ ] Rust lints: `cd src-tauri && cargo clippy -- -D warnings`
- [ ] Syntax check: `node --check src/**/*.js`
- [ ] Commit messages follow Conventional Commits
- [ ] No `console.log` left in production code
- [ ] JSDoc for new public functions
- [ ] Update relevant documentation (README, CHANGELOG if needed)

---

## 🐛 Reporting Bugs

Use the [GitHub Issue Template](.github/ISSUE_TEMPLATE/bug_report.md) with:
- Steps to reproduce
- Expected vs actual behavior
- Screenshots/logs
- OS version, widget version

---

## 📜 Code of Conduct

Be respectful, inclusive, and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) (to be added).

---

## 📞 Getting Help

- **Discord**: [Link] (to be added)
- **GitHub Discussions**: For questions & ideas
- **Issues**: For bugs & feature requests

---

*Thank you for contributing! 🎉*