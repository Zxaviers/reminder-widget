import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Audit structural fix: every hex color in UI sources must come from
// docs/TOKENS.md. Anything else fails the suite so off-token colors can
// never ship silently again.
const ALLOWED = new Set([
  // Surface + brand + ink + urgency, both themes (docs/TOKENS.md).
  '14151A', '1C1D24', '22232B', '2A2B33',
  'F5F4F1', 'FFFFFF', 'ECEAE5', 'E4E2DD',
  '1F6F63', '5BB5A6',
  'F2F1EE', 'B8B6B0', '8E8D88',
  '1A1A1A', '4A4A48', '6F6D68',
  '5CAE7E', 'E8B85E', 'E06A3B', 'D66161',
  '37785A', '8A6217', 'B34A29', '8B2E2E'
])

const FILES = [
  'src/style.css',
  'src/settings.css',
  'src/index.html',
  'src/settings.html',
  'src-tauri/gen/android/app/src/main/res/layout/widget_reminder_layout.xml',
  'src-tauri/gen/android/app/src/main/res/layout/widget_task_row.xml',
  'src-tauri/gen/android/app/src/main/res/layout/activity_main.xml',
  'src-tauri/gen/android/app/src/main/res/values/colors.xml',
  'src-tauri/gen/android/app/src/main/res/values-night/themes.xml',
  'src-tauri/gen/android/app/src/main/res/values/themes.xml',
  'src-tauri/gen/android/app/src/main/res/drawable/widget_background.xml',
  'src-tauri/gen/android/app/src/main/java/dev/riski/reminderwidget/ReminderAppWidgetProvider.kt',
  'src-tauri/gen/android/app/src/main/java/dev/riski/reminderwidget/WidgetTaskService.kt'
]

function hexesIn (raw) {
  const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
  const out = []
  for (const m of noComments.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    let hex = m[1].toUpperCase()
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join('')
    out.push(hex)
  }
  return out
}

test('all UI hex colors come from TOKENS.md', () => {
  const offenders = []
  for (const rel of FILES) {
    const abs = path.resolve(rel)
    if (!fs.existsSync(abs)) continue
    for (const hex of hexesIn(fs.readFileSync(abs, 'utf8'))) {
      if (!ALLOWED.has(hex)) offenders.push(`${rel}: #${hex}`)
    }
  }
  assert.deepEqual(offenders, [], `off-token colors:\n${offenders.join('\n')}`)
})
