import test from 'node:test'
import assert from 'node:assert/strict'
import { urgencyOf, rowTime, SOON_MS, isDataStale } from '../src/taskFormat.js'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-09-28T10:00:00').getTime()

test('urgency buckets: overdue, soon, later', () => {
  assert.equal(urgencyOf(NOW - 1, NOW), 'overdue')
  assert.equal(urgencyOf(NOW + SOON_MS, NOW), 'soon')
  assert.equal(urgencyOf(NOW + SOON_MS + 1, NOW), 'later')
})

test('overdue always carries a duration, never a bare label', () => {
  assert.equal(rowTime(NOW - 7 * 60 * 1000, NOW), 'Terlewat 7mnt')
  assert.equal(rowTime(NOW - 5 * HOUR, NOW), 'Terlewat 5j')
  assert.equal(rowTime(NOW - 3 * 24 * HOUR, NOW), 'Terlewat 3hr')
  for (const label of [
    rowTime(NOW - 1000, NOW),
    rowTime(NOW - 30 * 60 * 1000, NOW),
    rowTime(NOW - 23 * HOUR, NOW)
  ]) {
    assert.match(label, /^Terlewat \S+/, 'overdue label has duration')
  }
})

test('future labels: minutes, hours, tomorrow, weekday, days', () => {
  assert.equal(rowTime(NOW + 5 * 60 * 1000, NOW), '5 mnt lagi')
  assert.equal(rowTime(NOW + 6 * HOUR, NOW), '6 jam lagi')
  const tomorrow = rowTime(NOW + 26 * HOUR, NOW)
  assert.match(tomorrow, /^Besok \d{2}\.\d{2}$/)
  assert.equal(rowTime(NOW + 10 * 24 * HOUR, NOW), '10 hari lagi')
})

test('days-overdue uses hr, never bare h (audit N1)', () => {
  assert.equal(rowTime(NOW - 26 * 60 * 60 * 1000, NOW), 'Terlewat 1hr')
  assert.equal(rowTime(NOW - 3 * 24 * 60 * 60 * 1000, NOW), 'Terlewat 3hr')
  assert.equal(rowTime(NOW - 90 * 60 * 1000, NOW), 'Terlewat 1j')
  assert.equal(rowTime(NOW - 7 * 60 * 1000, NOW), 'Terlewat 7mnt')
})

test('isDataStale fires past one refresh interval', () => {
  const fresh = new Date(NOW - 5 * 60 * 1000).toISOString()
  const old = new Date(NOW - 25 * 60 * 1000).toISOString()
  assert.equal(isDataStale(fresh, NOW, 20), false)
  assert.equal(isDataStale(old, NOW, 20), true)
  assert.equal(isDataStale(null, NOW, 20), true)
  assert.equal(isDataStale('bogus', NOW, 20), true)
})

test('rowTime output never wraps the compact column', () => {
  const samples = [
    NOW - 1000, NOW - 59 * 60 * 1000, NOW - 23 * HOUR, NOW - 9 * 24 * HOUR,
    NOW + 1000, NOW + 59 * 60 * 1000, NOW + 23 * HOUR, NOW + 30 * 24 * HOUR
  ]
  for (const dueMs of samples) {
    assert.ok(
      rowTime(dueMs, NOW).length <= 16,
      `${rowTime(dueMs, NOW)} fits the time column`
    )
  }
})
