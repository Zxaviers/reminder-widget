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
 * Pruning rule: an entry earns its keep exactly while it can still hide
 * something. A task that is live in the feed keeps its entry (that is what
 * keeps it hidden across refreshes); an entry is dropped only once its task
 * has LEFT the feed and its deadline fell out of the keep-overdue window,
 * because Moodle retired that event for good and it can never reappear.
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
   * Forget entries that can never hide anything again: the task left the feed
   * AND its deadline fell out of the keep-overdue window. Entries for live
   * tasks are always retained — they are doing their job right now. Malformed
   * ids can never match a task, so they go too.
   */
  function prune (feedTasks, keepOverdueMs, nowMs = Date.now()) {
    const liveIds = new Set(feedTasks.map((task) => task.id))
    const minDueMs = nowMs - keepOverdueMs
    for (const [id] of done) {
      if (liveIds.has(id)) continue
      const dueMs = Number(id.split('::')[1])
      if (!Number.isFinite(dueMs) || dueMs < minDueMs) {
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
