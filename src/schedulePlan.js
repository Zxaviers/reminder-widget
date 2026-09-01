'use strict'

/**
 * schedulePlan.js
 * ---------------------------------------------------------------------------
 * Pure logic for planning instant and scheduled notifications.
 * Extracted so scheduling rules are 100% testable without requiring
 * an active Android device or OS AlarmManager.
 */

/**
 * Produces a stable positive 32-bit integer for a given task and threshold.
 * Required because mobile notification plugins expect integer IDs.
 */
export function makeNotificationId (taskId, thresholdHours) {
  let hash = 0
  const str = `${taskId}:${thresholdHours}`
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * Plans instant and scheduled notifications for upcoming tasks.
 *
 * @param {Array<{id: string, title: string, course?: string, dueMs: number}>} tasks
 * @param {number[]} thresholdsHours - e.g. [24, 6, 1]
 * @param {number} nowMs - current timestamp in epoch ms
 * @param {Record<string, number[]>} notifiedMap - taskId -> array of fired thresholds
 * @returns {Array<{
 *   id: number,
 *   taskId: string,
 *   thresholdHours: number,
 *   title: string,
 *   body: string,
 *   atMs: number,
 *   kind: 'instant' | 'scheduled'
 * }>}
 */
export function planSchedules (tasks, thresholdsHours, nowMs, notifiedMap = {}) {
  if (!Array.isArray(tasks) || !Array.isArray(thresholdsHours)) return []

  const sortedThresholds = [...thresholdsHours]
    .filter(t => typeof t === 'number' && Number.isFinite(t) && t > 0)
    .sort((a, b) => b - a)

  const plans = []

  for (const task of tasks) {
    if (!task || !task.id || typeof task.dueMs !== 'number') continue

    const remainingMs = task.dueMs - nowMs
    if (remainingMs <= 0) {
      // Overdue tasks don't get new threshold alarms
      continue
    }

    const firedList = Array.isArray(notifiedMap[task.id]) ? notifiedMap[task.id] : []

    for (const threshold of sortedThresholds) {
      if (firedList.includes(threshold)) {
        continue
      }

      const thresholdMs = threshold * 60 * 60 * 1000
      const targetAtMs = task.dueMs - thresholdMs

      const timeLabel = threshold >= 24
        ? `${Math.round(threshold / 24)} hari`
        : `${Math.round(threshold)} jam`

      const title = `Deadline Mendekat: ${task.title}`
      const body = `${task.course ? `[${task.course}] ` : ''}Tenggat waktu tersisa ${timeLabel}!`

      const notifId = makeNotificationId(task.id, threshold)

      if (remainingMs <= thresholdMs) {
        // Due right now
        plans.push({
          id: notifId,
          taskId: task.id,
          thresholdHours: threshold,
          title,
          body,
          atMs: nowMs,
          kind: 'instant'
        })
      } else if (targetAtMs > nowMs) {
        // Due in future -> schedule with AlarmManager
        plans.push({
          id: notifId,
          taskId: task.id,
          thresholdHours: threshold,
          title,
          body,
          atMs: targetAtMs,
          kind: 'scheduled'
        })
      }
    }
  }

  return plans
}
