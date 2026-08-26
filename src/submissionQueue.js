'use strict'

/**
 * submissionQueue.js
 * ---------------------------------------------------------------------------
 * Pure selection logic for the opt-in auto-detect feature.
 *
 * When auto-detect is enabled, the widget peeks at each future task's BRONE
 * assignment page (via the logged-in session) to see whether it has already
 * been submitted; a positive check marks the task done automatically. To stay
 * polite to the campus server, each task is checked at most once per interval
 * and only maxPerCycle tasks are checked per cycle, soonest deadline first.
 *
 * Pure module: no DOM, no storage, no network.
 */

/**
 * @param {object} options
 * @param {Array<{id: string, url: string, dueMs?: number}>} options.candidates
 * @param {Record<string, number>} [options.lastChecked] taskId -> epoch ms
 * @param {number}   [options.now]
 * @param {number}   [options.intervalMs]  min gap between checks of one task
 * @param {number}   [options.maxPerCycle] batch cap per run
 */
export function selectForCheck ({
  candidates,
  lastChecked = {},
  now = Date.now(),
  intervalMs = 6 * 3600 * 1000,
  maxPerCycle = 8
} = {}) {
  if (!Array.isArray(candidates)) return []

  return candidates
    .filter((task) => {
      if (!task || typeof task.id !== 'string' || task.id === '') return false
      if (typeof task.url !== 'string' || task.url === '') return false
      const checkedAt = lastChecked[task.id]
      if (Number.isFinite(checkedAt) && now - checkedAt < intervalMs) return false
      return true
    })
    .sort((a, b) => (a.dueMs ?? Infinity) - (b.dueMs ?? Infinity))
    .slice(0, Math.max(0, maxPerCycle))
}
