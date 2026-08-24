'use strict'

/**
 * parseTasks.js
 * ---------------------------------------------------------------------------
 * Turns raw iCalendar (.ics) text into a sorted, structured task list.
 *
 * Pure module: no DOM, no storage, no network. Runs in the Tauri webview and
 * in Node's test runner unchanged.
 *
 * v1 used node-ical (which drags in moment + rrule, ~7 MB of dependencies).
 * The Moodle export shape is small and stable, so v2 ships a minimal parser
 * instead: VEVENT blocks, TZID / UTC / floating / DATE-only starts, text
 * escaping. RRULE recurrence is deliberately not expanded — v1 already fell
 * back to a single occurrence whenever expansion failed or produced nothing,
 * and Moodle deadline feeds essentially never use RRULE.
 */

export const DAY_MS = 24 * 60 * 60 * 1000

/** How far into the past an already-passed deadline stays visible. */
export const DEFAULT_KEEP_OVERDUE_MS = 3 * DAY_MS

/** How far into the future to look. Keeps the widget from listing a whole semester. */
export const DEFAULT_HORIZON_MS = 120 * DAY_MS

const DESCRIPTION_MAX_LEN = 240

/**
 * Moodle encodes the meaning of an event in a suffix on SUMMARY, e.g.
 * "Tugas 1 is due". Longest patterns first so "is due for grading" wins
 * over "is due".
 */
const SUMMARY_SUFFIXES = [
  { re: /\s+is\s+due\s+for\s+grading$/i, phase: 'grading' },
  { re: /\s+should\s+be\s+submitted$/i, phase: 'due' },
  { re: /\s+harus\s+diserahkan$/i, phase: 'due' },
  { re: /\s+is\s+due$/i, phase: 'due' },
  { re: /\s+tenggat$/i, phase: 'due' },
  { re: /\s+closes$/i, phase: 'closes' },
  { re: /\s+ditutup$/i, phase: 'closes' },
  { re: /\s+opens$/i, phase: 'opens' },
  { re: /\s+dibuka$/i, phase: 'opens' }
]

const HTML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&hellip;': '\u2026',
  '&ndash;': '\u2013',
  '&mdash;': '\u2014'
}

/** Strip HTML tags/entities that Moodle puts in DESCRIPTION and normalise space. */
export function toPlainText (value) {
  if (typeof value !== 'string' || value === '') return ''
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code)
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : ''
    })
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => HTML_ENTITIES[m.toLowerCase()] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate (value, max = DESCRIPTION_MAX_LEN) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}\u2026`
}

/** Split "Tugas 1 is due" into { title: "Tugas 1", phase: "due" }. */
export function splitSummary (rawSummary) {
  const summary = toPlainText(rawSummary)
  for (const { re, phase } of SUMMARY_SUFFIXES) {
    if (re.test(summary)) {
      const title = summary.replace(re, '').trim()
      // Never return an empty title just because the suffix ate everything.
      if (title) return { title, phase }
      return { title: summary, phase }
    }
  }
  return { title: summary, phase: 'event' }
}

// ------------------------------------------------------------------ ics parse

/**
 * Unfold per RFC 5545: a CRLF followed by a space or tab is a continuation.
 */
function unfoldLines (text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
}

/**
 * Split one content line into { name, params, value }. The value separator is
 * the first ':' that is not inside a double-quoted parameter.
 */
function parseContentLine (line) {
  let inQuotes = false
  let colonAt = -1
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ':' && !inQuotes) { colonAt = i; break }
  }
  if (colonAt === -1) return null
  const head = line.slice(0, colonAt)
  const value = line.slice(colonAt + 1)

  const parts = head.split(';')
  const name = parts[0].toUpperCase()
  const params = {}
  for (const raw of parts.slice(1)) {
    const eq = raw.indexOf('=')
    if (eq === -1) continue
    params[raw.slice(0, eq).toUpperCase()] = raw.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}

/** Decode TEXT escapes per RFC 5545 §3.3.11. */
function unescapeText (value) {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '\\' && i + 1 < value.length) {
      const next = value[++i]
      out += next === 'n' || next === 'N' ? '\n' : next
    } else {
      out += ch
    }
  }
  return out
}

/**
 * Offset of `timeZone` at `utcMs`, via Intl. Two-pass handles DST edges well
 * enough for deadline feeds (which are wall-clock times anyway).
 */
function timeZoneOffsetMs (utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
  const parts = {}
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  )
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/**
 * Parse an iCalendar date/date-time VALUE into a JS Date.
 * - YYYYMMDDTHHMMSSZ -> UTC
 * - YYYYMMDDTHHMMSS with TZID   -> wall clock in that zone
 * - floating (no Z, no TZID)    -> local time
 * - YYYYMMDD (VALUE=DATE)       -> local midnight, flagged dateOnly
 * Returns { date, dateOnly } or null when unparseable.
 */
function parseIcsDate (value, params) {
  const raw = value.trim()
  const dateOnly = params?.VALUE === 'DATE' || /^\d{8}$/.test(raw)

  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/)
  if (!m) return null

  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m
  const year = Number(y); const month = Number(mo) - 1; const day = Number(d)
  const hour = Number(h); const minute = Number(mi); const second = Number(s)

  if (dateOnly || !(h || mi || s)) {
    return { date: new Date(year, month, day), dateOnly: true }
  }

  let ms
  if (z) {
    ms = Date.UTC(year, month, day, hour, minute, second)
  } else if (params?.TZID) {
    try {
      const naiveUtc = Date.UTC(year, month, day, hour, minute, second)
      const offset = timeZoneOffsetMs(naiveUtc, params.TZID)
      ms = naiveUtc - offset
      const refined = timeZoneOffsetMs(ms, params.TZID)
      if (refined !== offset) ms = naiveUtc - refined
    } catch {
      return null
    }
  } else {
    ms = new Date(year, month, day, hour, minute, second).getTime()
  }
  return Number.isFinite(ms) ? { date: new Date(ms), dateOnly: false } : null
}

/** Extract VEVENT property bags from raw .ics text. */
function extractEvents (icsText) {
  const events = []
  let current = null
  for (const line of unfoldLines(icsText)) {
    if (/^BEGIN:VEVENT/i.test(line)) { current = {}; continue }
    if (/^END:VEVENT/i.test(line)) {
      if (current) events.push(current)
      current = null
      continue
    }
    if (!current) continue
    const parsed = parseContentLine(line)
    if (!parsed) continue
    const { name, params, value } = parsed
    const entry = { params, value }
    // Multiple properties of one name (e.g. EXDATE) accumulate.
    if (current[name]) current[name].push(entry)
    else current[name] = [entry]
  }
  return events
}

function firstProp (event, name) {
  return event[name]?.[0] ?? null
}

// -------------------------------------------------------------- task building

/** Course name. Moodle puts it in CATEGORIES; odd feeds mention it as "Course: X". */
export function extractCourse (eventProps) {
  const categories = eventProps.CATEGORIES ?? []
  for (const entry of categories) {
    let text = toPlainText(unescapeText(entry.value))
    if (text.includes('|')) text = text.split('|')[0]
    text = text.replace(/_\d{4}$/, '').trim()
    if (text) return text
  }

  const description = firstProp(eventProps, 'DESCRIPTION')
  const text = toPlainText(description ? unescapeText(description.value) : '')
  const match = text.match(/(?:course|mata\s*kuliah|kelas)\s*[:\-]\s*([^.;|]{2,80})/i)
  if (match) return match[1].trim()

  return null
}

/** Only accept official BRONE activity URLs, never arbitrary description links. */
export function extractUrl (eventProps) {
  const url = firstProp(eventProps, 'URL')
  if (url && typeof url.value === 'string' && url.value.startsWith('https://brone.ub.ac.id/')) {
    return url.value
  }
  return null
}

/**
 * For an all-day event the deadline is the *end* of that day, not 00:00.
 * `date` is already local midnight of the target day.
 */
function endOfLocalDay (date) {
  const out = new Date(date.getTime())
  out.setHours(23, 59, 59, 999)
  return out
}

function validDate (maybe) {
  return maybe instanceof Date && Number.isFinite(maybe.getTime()) ? maybe : null
}

/** True when the event is an all-day (VALUE=DATE) event. */
function isDateOnly (eventProps, startInfo) {
  return startInfo.dateOnly === true
}

/**
 * @param {string} icsText raw .ics payload
 * @param {object} [options]
 * @param {Date}   [options.now]
 * @param {number} [options.keepOverdueMs] how long passed deadlines stay listed
 * @param {number} [options.horizonMs] how far ahead to look
 * @param {number} [options.limit] max tasks returned
 * @returns {Array<object>} tasks sorted by nearest deadline first
 */
export function parseTasks (icsText, options = {}) {
  if (typeof icsText !== 'string' || icsText.trim() === '') return []
  if (!icsText.includes('BEGIN:VCALENDAR')) return []

  const now = options.now instanceof Date ? options.now : new Date()
  const keepOverdueMs = Number.isFinite(options.keepOverdueMs)
    ? options.keepOverdueMs
    : DEFAULT_KEEP_OVERDUE_MS
  const horizonMs = Number.isFinite(options.horizonMs) ? options.horizonMs : DEFAULT_HORIZON_MS
  const limit = Number.isFinite(options.limit) ? options.limit : Infinity

  const minMs = now.getTime() - keepOverdueMs
  const maxMs = now.getTime() + horizonMs

  let events
  try {
    events = extractEvents(icsText)
  } catch (error) {
    const wrapped = new Error(`Failed to parse calendar feed: ${error.message}`)
    wrapped.code = 'ICS_PARSE_FAILED'
    wrapped.cause = error
    throw wrapped
  }

  const byId = new Map()

  for (const eventProps of events) {
    const startProp = firstProp(eventProps, 'DTSTART')
    if (!startProp) continue

    const startInfo = parseIcsDate(startProp.value, startProp.params)
    if (!startInfo) continue
    const start = validDate(startInfo.date)
    if (!start) continue

    const allDay = isDateOnly(eventProps, startInfo)

    const summaryProp = firstProp(eventProps, 'SUMMARY')
    const { title, phase } = splitSummary(summaryProp ? unescapeText(summaryProp.value) : '')
    if (!title) continue

    const course = extractCourse(eventProps)
    const url = extractUrl(eventProps)

    const descriptionProp = firstProp(eventProps, 'DESCRIPTION')
    const description = truncate(
      descriptionProp ? toPlainText(unescapeText(descriptionProp.value)) : ''
    )

    const uidProp = firstProp(eventProps, 'UID')
    const uid = uidProp && uidProp.value.trim() !== ''
      ? uidProp.value.trim()
      : `${title}|${phase}`

    // RRULE is not expanded: one occurrence per VEVENT (see module comment).
    const due = allDay ? endOfLocalDay(start) : start
    const dueMs = due.getTime()
    if (dueMs < minMs || dueMs > maxMs) continue

    const id = `${uid}::${dueMs}`
    if (byId.has(id)) continue

    byId.set(id, {
      id,
      uid,
      title,
      course,
      phase,
      due: due.toISOString(),
      dueMs,
      allDay,
      description,
      url
    })
  }

  const tasks = [...byId.values()].sort(
    (a, b) => a.dueMs - b.dueMs || a.title.localeCompare(b.title)
  )

  return Number.isFinite(limit) ? tasks.slice(0, limit) : tasks
}

/** True when `task` falls inside the next `windowMs` and has not passed yet. */
export function isDueWithin (task, windowMs, now = Date.now()) {
  const reference = now instanceof Date ? now.getTime() : now
  const delta = task.dueMs - reference
  return delta >= 0 && delta <= windowMs
}

export function isOverdue (task, now = Date.now()) {
  const reference = now instanceof Date ? now.getTime() : now
  return task.dueMs < reference
}
