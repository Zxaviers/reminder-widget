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
  assert.deepEqual(store.visible([t]), [], 'done tasks disappear from the visible list')
})

test('unmark restores a previously done task', () => {
  const store = createDoneStore({ 'uid-1::1': '2026-08-24T00:00:00.000Z' })
  const t = task('uid-1::1', NOW)
  assert.equal(store.isDone(t.id), true)

  store.unmark(t.id)

  assert.equal(store.isDone(t.id), false)
  assert.deepEqual(store.visible([t]), [t])
})

test('visible keeps undone tasks in their original order', () => {
  const store = createDoneStore({ 'b::2': '2026-08-24T00:00:00.000Z' })
  const list = [task('a::1', NOW + DAY), task('b::2', NOW + 2 * DAY), task('c::3', NOW + 3 * DAY)]

  const visible = store.visible(list)

  assert.deepEqual(visible.map((t) => t.id), ['a::1', 'c::3'])
})

test('prune keeps live tasks hidden and drops only retired absences', () => {
  const freshId = `gone-fresh::${NOW - DAY}` // absent, still inside keep window
  const staleId = `gone-stale::${NOW - 30 * DAY}` // absent, far outside it
  const liveOld = `live-old::${NOW - 4 * DAY}` // live AND overdue: must stay hidden
  const store = createDoneStore({
    [freshId]: '2026-08-25T00:00:00.000Z',
    [staleId]: '2026-08-01T00:00:00.000Z',
    [liveOld]: '2026-08-20T00:00:00.000Z',
    'garbage-id': '2026-08-20T00:00:00.000Z'
  })
  const feed = [task(liveOld, NOW - 4 * DAY), task('live-fresh::7', NOW + DAY)]
  const keepOverdueMs = 3 * DAY

  const pruned = store.prune(feed, keepOverdueMs, NOW)

  assert.equal(pruned.has(freshId), true, 'absent but recent: may still reappear')
  assert.equal(pruned.has(staleId), false, 'absent past the window: never coming back')
  assert.equal(pruned.has(liveOld), true, 'a live task stays done/hidden across refreshes')
  assert.equal(pruned.has('garbage-id'), false, 'malformed ids can never match again')
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

test('doneList returns marked tasks from the feed, feed order preserved', () => {
  const store = createDoneStore({
    'b::2': '2026-08-24T00:00:00.000Z',
    'c::3': '2026-08-24T00:00:00.000Z'
  })
  const feed = [
    task('a::1', NOW + DAY),
    task('b::2', NOW + 2 * DAY),
    task('c::3', NOW + 3 * DAY)
  ]

  const list = store.doneList(feed)

  // Only done ones, in the feed's ascending-deadline order.
  assert.deepEqual(list.map((t) => t.id), ['b::2', 'c::3'])
})

test('doneList is empty when nothing is marked or feed is empty', () => {
  assert.deepEqual(createDoneStore({}).doneList([task('a::1', NOW)]), [])
  assert.deepEqual(createDoneStore({ 'x::9': '2026-08-24T00:00:00.000Z' }).doneList([]), [])
})

test('unmark restores the task into visible() (accidental mark-done recovery)', () => {
  const store = createDoneStore({})
  const t = task('accident::7', NOW + DAY)
  store.mark(t.id, '2026-08-25T09:00:00.000Z')
  assert.deepEqual(store.visible([t]), [])

  store.unmark(t.id)

  assert.deepEqual(store.visible([t]), [t])
  assert.deepEqual(store.doneList([t]), [], 'restored task leaves the done list')
})
