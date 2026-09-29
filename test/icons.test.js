import test from 'node:test'
import assert from 'node:assert/strict'
import { ICONS, PH_VIEWBOX, icon } from '../src/icons.js'

test('every icon has non-empty official path data', () => {
  const names = Object.keys(ICONS)
  assert.ok(names.length >= 10, 'expected a full icon set')
  for (const name of names) {
    assert.ok(Array.isArray(ICONS[name]) && ICONS[name].length > 0, `${name} has paths`)
    for (const d of ICONS[name]) {
      assert.match(d, /^M[\s\S]*Z?$/, `${name} path looks like SVG data`)
    }
  }
  assert.equal(PH_VIEWBOX, '0 0 256 256')
})

test('icon() builds a fill-based svg with data-ph', () => {
  const calls = []
  const fakeEl = () => ({
    setAttribute: (k, v) => calls.push([k, v]),
    appendChild: () => {}
  })
  globalThis.document = { createElementNS: () => fakeEl() }
  try {
    icon('gear')
    const attrs = Object.fromEntries(calls)
    assert.equal(attrs.viewBox, '0 0 256 256')
    assert.equal(attrs.fill, 'currentColor')
    assert.ok('data-ph' in attrs)
  } finally {
    delete globalThis.document
  }
})

test('unknown icon names fall back to an empty svg', () => {
  globalThis.document = {
    createElementNS: () => ({ setAttribute: () => {}, appendChild: () => {} })
  }
  try {
    assert.doesNotThrow(() => icon('nope'))
  } finally {
    delete globalThis.document
  }
})
