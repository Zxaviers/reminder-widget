'use strict'

/**
 * notifyConfig.test.js — spec for user-configurable notification thresholds.
 * Run: node --test
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeThresholdsHours, thresholdsToMs } from '../src/notifyConfig.js'

test('valid hours pass through, sorted descending, deduplicated', () => {
  assert.deepEqual(normalizeThresholdsHours([1, 24, 6, 24]), [24, 6, 1])
})

test('invalid entries are dropped', () => {
  assert.deepEqual(normalizeThresholdsHours([24, 0, -3, NaN, 'x', 999]), [24])
})

test('non-array input falls back to the default 24/6/1', () => {
  assert.deepEqual(normalizeThresholdsHours(undefined), [24, 6, 1])
  assert.deepEqual(normalizeThresholdsHours('nope'), [24, 6, 1])
})

test('empty array falls back to defaults (never notify-less by accident)', () => {
  assert.deepEqual(normalizeThresholdsHours([]), [24, 6, 1])
})

test('custom fallback is honoured', () => {
  assert.deepEqual(normalizeThresholdsHours([], [12, 2]), [12, 2])
})

test('thresholdsToMs converts to milliseconds, order preserved', () => {
  assert.deepEqual(thresholdsToMs([24, 6, 1]), [24 * 3600e3, 6 * 3600e3, 3600e3])
})
