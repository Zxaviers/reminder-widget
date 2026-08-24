'use strict'

/**
 * Unit tests for the pure modules (parser + fetcher helpers).
 * Run: node --test test/
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseTasks, isDueWithin, isOverdue, toPlainText, splitSummary } from '../src/parseTasks.js'
import { validateUrl, clampInterval, MIN_REFRESH_MS, MAX_REFRESH_MS } from '../src/fetchCalendar.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = fs.readFileSync(path.join(here, 'fixtures', 'moodle-sample.ics'), 'utf8')
// Fixture deadlines all sit in late Aug 2026.
const NOW = new Date('2026-08-20T00:00:00Z')

test('parses every VEVENT in the feed', () => {
  const tasks = parseTasks(FIXTURE, { now: NOW })
  assert.equal(tasks.length, 3)
})

test('sorts by nearest deadline first', () => {
  const tasks = parseTasks(FIXTURE, { now: NOW })
  assert.deepEqual(
    tasks.map((t) => t.title),
    ['Praktikum Basis Data', 'Tugas 1 - Analisis Algoritma', 'Kuis Jaringan Komputer']
  )
  for (let i = 1; i < tasks.length; i += 1) {
    assert.ok(tasks[i].dueMs >= tasks[i - 1].dueMs, 'deadlines must be ascending')
  }
})

test('strips Moodle summary suffixes and records the phase', () => {
  const tasks = parseTasks(FIXTURE, { now: NOW })
  const byTitle = new Map(tasks.map((t) => [t.title, t]))

  assert.equal(byTitle.get('Tugas 1 - Analisis Algoritma').phase, 'due')
  assert.equal(byTitle.get('Praktikum Basis Data').phase, 'due', 'Indonesian "harus diserahkan"')
  assert.equal(byTitle.get('Kuis Jaringan Komputer').phase, 'closes')
})

test('reads the course name from CATEGORIES', () => {
  const tasks = parseTasks(FIXTURE, { now: NOW })
  assert.deepEqual(
    tasks.map((t) => t.course),
    ['Basis Data', 'Desain dan Analisis Algoritma', 'Jaringan Komputer']
  )
})

test('respects TZID when computing the deadline', () => {
  const tasks = parseTasks(FIXTURE, { now: NOW })
  const task = tasks.find((t) => t.title === 'Praktikum Basis Data')
  // DTSTART;TZID=Asia/Jakarta:20260821T235900 == 16:59Z
  assert.equal(task.due, '2026-08-21T16:59:00.000Z')
  assert.equal(task.allDay, false)
})

test('an all-day event is due at the end of that local day', () => {
  const tasks = parseTasks(FIXTURE, { now: NOW })
  const task = tasks.find((t) => t.title === 'Kuis Jaringan Komputer')
  assert.equal(task.allDay, true)

  // Asserted in local parts so the test is timezone independent.
  const due = new Date(task.dueMs)
  assert.equal(due.getFullYear(), 2026)
  assert.equal(due.getMonth(), 7) // August
  assert.equal(due.getDate(), 25)
  assert.equal(due.getHours(), 23)
  assert.equal(due.getMinutes(), 59)
})

test('strips HTML out of descriptions', () => {
  const tasks = parseTasks(FIXTURE, { now: NOW })
  const task = tasks.find((t) => t.title === 'Kuis Jaringan Komputer')
  assert.equal(task.description, 'Kuis online bab 4')
  assert.ok(!task.description.includes('<'))
})

test('drops deadlines outside the retention window', () => {
  const late = parseTasks(FIXTURE, { now: new Date('2028-01-01T00:00:00Z') })
  assert.equal(late.length, 0)

  const early = parseTasks(FIXTURE, { now: new Date('2024-01-01T00:00:00Z') })
  assert.equal(early.length, 0)
})

test('keeps recently overdue work visible', () => {
  const tasks = parseTasks(FIXTURE, { now: new Date('2026-08-22T12:00:00Z') })
  const titles = tasks.map((t) => t.title)
  assert.ok(titles.includes('Praktikum Basis Data'), 'recent overdue task stays')
  assert.ok(isOverdue(tasks[0], new Date('2026-08-22T12:00:00Z')))
})

test('honours the limit option', () => {
  assert.equal(parseTasks(FIXTURE, { now: NOW, limit: 2 }).length, 2)
})

test('task ids are stable across parses', () => {
  const a = parseTasks(FIXTURE, { now: NOW }).map((t) => t.id)
  const b = parseTasks(FIXTURE, { now: NOW }).map((t) => t.id)
  assert.deepEqual(a, b)
  assert.equal(new Set(a).size, a.length, 'ids must be unique')
})

test('tolerates empty, blank, and non-calendar input', () => {
  assert.deepEqual(parseTasks(''), [])
  assert.deepEqual(parseTasks('   '), [])
  assert.deepEqual(parseTasks(null), [])
  assert.deepEqual(parseTasks('not a calendar at all'), [])
})

test('skips events with no usable start date', () => {
  const broken = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:no-date@example.edu',
    'SUMMARY:Broken event is due',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n')
  assert.deepEqual(parseTasks(broken, { now: NOW }), [])
})

test('does not strip a suffix that is the entire summary', () => {
  assert.deepEqual(splitSummary('is due'), { title: 'is due', phase: 'event' })
  assert.deepEqual(splitSummary('Lab 3 is due'), { title: 'Lab 3', phase: 'due' })
})

test('isDueWithin only matches future deadlines inside the window', () => {
  const task = { dueMs: Date.now() + 3 * 60 * 60 * 1000 }
  assert.equal(isDueWithin(task, 24 * 60 * 60 * 1000), true)
  assert.equal(isDueWithin(task, 60 * 60 * 1000), false)
  assert.equal(isDueWithin({ dueMs: Date.now() - 1000 }, 24 * 60 * 60 * 1000), false)
})

test('toPlainText decodes entities and collapses whitespace', () => {
  assert.equal(toPlainText('<p>a &amp; b</p>\n\n  c'), 'a & b c')
  assert.equal(toPlainText('&#65;&#66;'), 'AB')
  assert.equal(toPlainText(undefined), '')
})

test('unfolded continuation lines are parsed as one property', () => {
  const folded = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:fold@brone.ub.ac.id',
    'SUMMARY:Tugas Lipat is',
    '  due',
    'DTSTART:20260830T090000Z',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')
  const tasks = parseTasks(folded, { now: NOW })
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].title, 'Tugas Lipat')
})

test('validateUrl accepts http(s) and rejects everything else', () => {
  assert.equal(validateUrl('https://example.edu/a.ics'), 'https://example.edu/a.ics')
  assert.throws(() => validateUrl(''), /not configured/)
  assert.throws(() => validateUrl('   '), /not configured/)
  assert.throws(() => validateUrl('nonsense'), /not a valid URL/)
  assert.throws(() => validateUrl('file:///C:/secrets.ics'), /http or https/)
  assert.throws(() => validateUrl('javascript:alert(1)'), /http or https/)
})

test('refresh interval is clamped to the polite range', () => {
  assert.equal(clampInterval(60 * 1000), MIN_REFRESH_MS, 'too fast is raised to 15 min')
  assert.equal(clampInterval(60 * 60 * 1000), MAX_REFRESH_MS, 'too slow is capped at 30 min')
  assert.equal(clampInterval(20 * 60 * 1000), 20 * 60 * 1000)
  assert.equal(clampInterval(NaN), 20 * 60 * 1000, 'garbage falls back to the default')
})

test('validates BRONE calendar export execute URLs correctly', () => {
  const broneUrl =
    'https://brone.ub.ac.id/calendar/export_execute.php?userid=12345&authtoken=abcde123456&preset_what=all&preset_time=recentupcoming'
  assert.equal(validateUrl(broneUrl), broneUrl)

  const pattern = /https:\/\/brone\.ub\.ac\.id\/calendar\/export_execute\.php[^\s"']+/
  const match = `<a href="${broneUrl}">Export</a>`.match(pattern)
  assert.ok(match)
  assert.equal(match[0], broneUrl)
})

test('cleans UB internal course codes and ignores arbitrary reference links', () => {
  const sample = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:999@brone.ub.ac.id',
    'SUMMARY:Tugas Penelitian is due',
    'CATEGORIES:COM60051_2024|172.02.17|2026.1',
    'DESCRIPTION:Upload ke https://drive.google.com/test-link',
    'DTSTART:20260825T120000Z',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\n')

  const parsed = parseTasks(sample, { now: NOW })
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].course, 'COM60051')
  assert.equal(parsed[0].url, null, 'Arbitrary drive link in description must not be extracted')
})
