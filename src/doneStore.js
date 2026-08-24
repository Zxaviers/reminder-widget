'use strict'

/**
 * doneStore.js
 * ---------------------------------------------------------------------------
 * Pure state for the mark-done feature.
 *
 * The Moodle .ics feed never removes an event when the student submits the
 * assignment, so "done" is a purely local concept: a map of taskId -> ISO
 * timestamp persisted inside settings.json. A task id is `${uid}::${dueMs}`,
 * which is stable across refreshes because it comes from the feed's own UID.
 *
 * Pure module: no DOM, no storage, no network. Safe to unit test and to run
 * in both the renderer and Node's test runner.
 */

/**
 * @param {Record<string, string>} initial taskId -> ISO timestamp
 */
export function createDoneStore (initial = {}) {
  /** @type {Map<string, string>} */
  const done = new Map(Object.entries(initial))
  /** @type {{ id: string, type: 'mark' | 'unmark' } | null} */
  let last = null

  function isDone (taskId) {
    return done.has(taskId)
  }

  function mark (taskId, isoTimestamp) {
    if (!done.has(taskId)) {
      done.set(taskId, isoTimestamp ?? new Date().toISOString())
      last = { id: taskId, type: 'mark' }
    }
  }

  function unmark (taskId) {
    if (done.delete(taskId)) {
      last = { id: taskId, type: 'unmark' }
    }
  }

  /**
   * Tasks that are not marked done, original order preserved.
   */
  function visible (tasks) {
    return tasks.filter((task) => !done.has(task.id))
  }

  /**
   * Forget entries that can never match anything again:
   * - the task is back in the live feed (the entry is redundant state), or
   * - its deadline fell out of the keep-overdue window while absent from the
   *   feed, meaning Moodle retired the event for good.
   */
  function prune (feedTasks, keepOverdueMs, nowMs = Date.now()) {
    const liveIds = new Set(feedTasks.map((task) => task.id))
    const minDueMs = nowMs - keepOverdueMs
    for (const [id] of done) {
      const dueMs = Number(id.split('::')[1])
      const isLive = liveIds.has(id)
      const isRetired = Number.isFinite(dueMs) && dueMs < minDueMs
      if (isLive || isRetired || !Number.isFinite(dueMs)) {
        // An unparseable id can never match again either; drop it too.
        done.delete(id)
      }
    }
    return new Map(done)
  }

  function lastAction () {
    return last ? { ...last } : null
  }

  /** Flip the most recent mark/unmark back. */
  function undo () {
    if (!last) return
    if (last.type === 'mark') done.delete(last.id)
    else done.set(last.id, new Date().toISOString())
    last = null
  }

  function toJSON () {
    return Object.fromEntries(done)
  }

  return { isDone, mark, unmark, visible, prune, lastAction, undo, toJSON }
}
