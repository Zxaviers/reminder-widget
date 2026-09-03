import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('capabilities: default.json permits window dragging for frameless desktop widget', () => {
  const capPath = path.resolve('src-tauri/capabilities/default.json')
  const content = JSON.parse(fs.readFileSync(capPath, 'utf8'))

  assert.ok(Array.isArray(content.permissions), 'permissions must be an array')
  assert.ok(
    content.permissions.includes('core:window:allow-start-dragging'),
    'core:window:allow-start-dragging must be granted in default.json so frameless widget dragging works'
  )
})
