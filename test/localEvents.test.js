'use strict'

import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLocalEvent, localTaskFrom, withLocalTasks } from '../src/localEvents.js'
import { DAY_MS } from '../src/parseTasks.js'

const NOW = new Date('2026-09-19T12:00:00').getTime()

function futureDate (days) {
  return new Date(NOW + days * DAY_MS).toISOString().slice(0, 10)
}

test('normalizeLocalEvent rejects empty title', () => {
  const res = normalizeLocalEvent({ title: '  ', date: futureDate(1) }, NOW)
  assert.equal(res.ok, false)
})

test('normalizeLocalEvent rejects missing or malformed date', () => {
  assert.equal(normalizeLocalEvent({ title: 'Rapat', date: '' }, NOW).ok, false)
  assert.equal(normalizeLocalEvent({ title: 'Rapat', date: '19/09/2026' }, NOW).ok, false)
})

test('normalizeLocalEvent rejects malformed time', () => {
  const res = normalizeLocalEvent({ title: 'Rapat', date: futureDate(1), time: '25:99' }, NOW)
  assert.equal(res.ok, false)
})

test('normalizeLocalEvent defaults missing time to 23:59 local and flags allDay', () => {
  const res = normalizeLocalEvent({ title: 'Rapat', date: futureDate(1) }, NOW)
  assert.equal(res.ok, true)
  assert.equal(res.event.allDay, true)
  const expected = new Date(`${futureDate(1)}T23:59:00`).getTime()
  assert.equal(res.event.dueMs, expected)
})

test('normalizeLocalEvent honours an explicit time', () => {
  const res = normalizeLocalEvent({ title: 'Rapat', date: futureDate(1), time: '09:00' }, NOW)
  assert.equal(res.ok, true)
  assert.equal(res.event.allDay, false)
  assert.equal(res.event.dueMs, new Date(`${futureDate(1)}T09:00:00`).getTime())
})

test('normalizeLocalEvent rejects dates outside the reminder window', () => {
  assert.equal(normalizeLocalEvent({ title: 'Lama', date: futureDate(200) }, NOW).ok, false)
  assert.equal(normalizeLocalEvent({ title: 'Basi', date: futureDate(-10) }, NOW).ok, false)
})

test('localTaskFrom produces a task-shaped record tagged local', () => {
  const task = localTaskFrom({ id: 'local-x', title: 'Rapat', dueMs: NOW + DAY_MS, allDay: false })
  assert.equal(task.source, 'local')
  assert.equal(task.id, 'local-x')
  assert.equal(task.url, null)
  assert.equal(task.dueMs, NOW + DAY_MS)
})

test('withLocalTasks merges and sorts nearest first', () => {
  const feed = [{ id: 'f1', title: 'Tugas', dueMs: NOW + 2 * DAY_MS }]
  const events = [{ id: 'local-x', title: 'Rapat', dueMs: NOW + DAY_MS, allDay: false }]
  const merged = withLocalTasks(feed, events, NOW)
  assert.deepEqual(merged.map((t) => t.id), ['local-x', 'f1'])
  assert.equal(merged[0].source, 'local')
})

test('withLocalTasks drops events older than the keep-overdue window', () => {
  const events = [{ id: 'local-old', title: 'Basi', dueMs: NOW - 4 * DAY_MS, allDay: false }]
  const merged = withLocalTasks([], events, NOW)
  assert.equal(merged.length, 0)
})

test('withLocalTasks never duplicates a feed id and does not mutate inputs', () => {
  const feed = [{ id: 'same', title: 'Tugas', dueMs: NOW + DAY_MS }]
  const events = [{ id: 'same', title: 'Rapat', dueMs: NOW + DAY_MS, allDay: false }]
  const merged = withLocalTasks(feed, events, NOW)
  assert.equal(merged.length, 1)
  assert.equal(feed.length, 1)
  assert.equal(feed[0].source, undefined)
})

test('withLocalTasks tolerates missing or malformed inputs', () => {
  assert.deepEqual(withLocalTasks(null, null, NOW), [])
  const merged = withLocalTasks([], [{ id: 'x' }, null, { id: 'y', dueMs: 'soon' }], NOW)
  assert.equal(merged.length, 0)
})
