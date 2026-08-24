'use strict'

/**
 * doneStore.test.js — red/green spec for the mark-done feature.
 * Run: node --test test/
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createDoneStore } from '../src/doneStore.js'

const NOW = new Date('2026-08-25T10:00:00Z').getTime()
const DAY = 24 * 60 * 60 * 1000

function task (id, dueMs) {
  return { id, uid: id.split('::')[0], dueMs }
}

test('marking a task records an ISO timestamp and hides it', () => {
  const store = createDoneStore({})
  const t = task('uid-1::1700000000000', NOW + DAY)

  store.mark(t.id, '2026-08-25T09:00:00.000Z')

  assert.equal(store.isDone(t.id), true)
  assert.deepEqual(store.visible([t], NOW), [], 'done tasks disappear from the visible list')
})

test('unmark restores a previously done task', () => {
  const store = createDoneStore({ 'uid-1::1': '2026-08-24T00:00:00.000Z' })
  const t = task('uid-1::1', NOW)
  assert.equal(store.isDone(t.id), true)

  store.unmark(t.id)

  assert.equal(store.isDone(t.id), false)
  assert.deepEqual(store.visible([t], NOW), [t])
})

test('visible keeps undone tasks in their original order', () => {
  const store = createDoneStore({ 'b::2': '2026-08-24T00:00:00.000Z' })
  const list = [task('a::1', NOW + DAY), task('b::2', NOW + 2 * DAY), task('c::3', NOW + 3 * DAY)]

  const visible = store.visible(list, NOW)

  assert.deepEqual(visible.map((t) => t.id), ['a::1', 'c::3'])
})

test('prune drops entries whose task left the feed past the keep window', () => {
  const freshId = `gone-fresh::${NOW - DAY}` // inside the keep window
  const staleId = `gone-stale::${NOW - 30 * DAY}` // far outside it
  const store = createDoneStore({
    [freshId]: '2026-08-25T00:00:00.000Z',
    [staleId]: '2026-08-01T00:00:00.000Z'
  })
  // A live task's entry is redundant: if the task is visible again the map
  // does no work.
  const feed = [task('live::7', NOW - 4 * DAY)]
  const keepOverdueMs = 3 * DAY

  const pruned = store.prune(feed, keepOverdueMs, NOW)

  assert.equal(pruned.has(freshId), true)
  assert.equal(pruned.has(staleId), false)
  assert.equal(pruned.has('live::7'), false, 'entries for live tasks are unnecessary state')
})

test('toJSON round-trips through plain objects', () => {
  const initial = { 'x::1': '2026-08-20T00:00:00.000Z' }
  const store = createDoneStore(initial)

  store.mark('y::2', '2026-08-25T08:30:00.000Z')

  const restored = createDoneStore(JSON.parse(JSON.stringify(store.toJSON())))
  assert.equal(restored.isDone('x::1'), true)
  assert.equal(restored.isDone('y::2'), true)
})

test('lastAction supports undo of the most recent mark or unmark', () => {
  const store = createDoneStore({})
  const t = task('z::5', NOW + DAY)

  assert.equal(store.lastAction(), null)

  store.mark(t.id, '2026-08-25T09:00:00.000Z')
  assert.deepEqual(store.lastAction(), { id: t.id, type: 'mark' })

  store.unmark(t.id)
  assert.deepEqual(store.lastAction(), { id: t.id, type: 'unmark' })

  // Undo flips it back to done.
  store.undo()
  assert.equal(store.isDone(t.id), true)
})
