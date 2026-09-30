'use strict'

/**
 * taskFormat.js
 * ---------------------------------------------------------------------------
 * Single urgency + countdown formatter shared by the app (renderer.js) and
 * mirrored by the Android widget (WidgetTaskService.kt keeps the same
 * buckets/labels — see the parity test below).
 *
 * Buckets: overdue | soon (<24h) | later. Labels always carry words and
 * numbers, never color alone; overdue never returns a bare label.
 *
 * Pure module: no DOM, no storage, no network. Unit tested.
 */

export const MINUTE_MS = 60 * 1000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS
export const SOON_MS = DAY_MS

const timeFmt = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})
const weekdayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long' })

function startOfDay (ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function dotTime (dueMs) {
  return timeFmt.format(new Date(dueMs)).replace(':', '.')
}

/** Opt5 urgency bucket. Neutral items stay uncolored by the caller. */
export function urgencyOf (dueMs, nowMs = Date.now()) {
  const delta = dueMs - nowMs
  if (delta < 0) return 'overdue'
  if (delta <= SOON_MS) return 'soon'
  return 'later'
}

/** True when synced data is older than one refresh interval. */
export function isDataStale (lastFetchedAtIso, nowMs = Date.now(), refreshMinutes = 20) {
  const at = Date.parse(lastFetchedAtIso)
  if (!Number.isFinite(at)) return true
  const intervalMs = (Number(refreshMinutes) || 20) * MINUTE_MS
  return nowMs - at > intervalMs
}

/** Timeline/hero/widget countdown text with words + numbers. */
export function rowTime (dueMs, nowMs = Date.now()) {
  const delta = dueMs - nowMs
  const abs = Math.abs(delta)
  const minutes = Math.floor(abs / MINUTE_MS)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (delta < 0) {
    if (minutes < 60) return `Terlewat ${Math.max(minutes, 1)}mnt`
    if (hours < 24) return `Terlewat ${hours}j`
    // Days use "hari" dieja penuh (audit N4).
    return `Terlewat ${days} hari`
  }
  if (minutes < 60) return `${Math.max(minutes, 1)} mnt lagi`
  if (hours < 24) return `${hours} jam lagi`
  const due = new Date(dueMs)
  const dayDelta = Math.round((startOfDay(dueMs) - startOfDay(nowMs)) / DAY_MS)
  if (dayDelta === 1) return `Besok ${dotTime(dueMs)}`
  if (dayDelta < 7) return `${weekdayFmt.format(due)} ${dotTime(dueMs)}`
  return `${days} hari lagi`
}
