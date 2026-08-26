'use strict'

/**
 * submissionQueue.test.js — spec for the auto-detect check queue.
 * Run: node --test
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { selectForCheck } from '../src/submissionQueue.js'

const HOUR = 3600 * 1000
const NOW = 1_700_000_000_000

function cand (id, url, dueMs) {
  return { id, url, dueMs }
}

test('picks only candidates never checked before', () => {
  const picks = selectForCheck({
    candidates: [cand('a', 'https://x/1', NOW + DAY_LIKE()), cand('b', 'https://x/2', NOW + 2 * HOUR)],
    lastChecked: {},
    now: NOW
  })
  assert.deepEqual(picks.map((p) => p.id), ['b', 'a'], 'soonest deadline first')
})

const DAY_LIKE = () => 5 * HOUR

test('skips candidates checked inside the interval window', () => {
  const picks = selectForCheck({
    candidates: [cand('fresh', 'https://x/1', NOW + HOUR), cand('stale', 'https://x/2', NOW + 2 * HOUR)],
    lastChecked: { fresh: NOW - 1 * HOUR, stale: NOW - 7 * HOUR },
    now: NOW,
    intervalMs: 6 * HOUR
  })
  assert.deepEqual(picks.map((p) => p.id), ['stale'])
})

test('caps the batch at maxPerCycle (polite to the campus server)', () => {
  const candidates = []
  for (let i = 0; i < 20; i++) candidates.push(cand(`t${i}`, `https://x/${i}`, NOW + (i + 1) * HOUR))
  const picks = selectForCheck({ candidates, lastChecked: {}, now: NOW, maxPerCycle: 5 })
  assert.equal(picks.length, 5)
})

test('drops candidates without url or id', () => {
  const picks = selectForCheck({
    candidates: [cand('', 'https://x/1', NOW + HOUR), { id: 'nourl', dueMs: NOW + HOUR }, cand('ok', 'https://x/3', NOW + 3 * HOUR)],
    lastChecked: {},
    now: NOW
  })
  assert.deepEqual(picks.map((p) => p.id), ['ok'])
})

test('already-done ids are ignored even if listed', () => {
  const picks = selectForCheck({
    candidates: [cand('done-one', 'https://x/1', NOW + HOUR)],
    lastChecked: {},
    now: NOW
  })
  assert.equal(picks.length, 1)
})

test('sorts by dueMs ascending regardless of input order', () => {
  const picks = selectForCheck({
    candidates: [cand('late', 'https://x/1', NOW + 9 * HOUR), cand('soon', 'https://x/2', NOW + 1 * HOUR)],
    lastChecked: {},
    now: NOW
  })
  assert.deepEqual(picks.map((p) => p.id), ['soon', 'late'])
})
