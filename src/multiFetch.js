'use strict'

/**
 * multiFetch.js
 * ---------------------------------------------------------------------------
 * Merge parsed tasks from several calendar feeds into one list.
 * Each task is tagged with its origin (`feedId`, `feedKind`) for grouping
 * and diagnosis. Same id in two feeds keeps the first occurrence only.
 *
 * Pure module: no DOM, no storage, no network. Safe to unit test.
 */

/**
 * @param {Array<{feed: {id: string, kind?: string}, tasks?: Array}>} feedResults
 * @returns {Array} merged tasks, nearest deadline first
 */
export function mergeFeedTasks (feedResults) {
  const seen = new Set()
  const merged = []
  for (const result of Array.isArray(feedResults) ? feedResults : []) {
    const feed = result && result.feed
    const tasks = result && result.tasks
    if (!feed || typeof feed.id !== 'string' || !Array.isArray(tasks)) continue
    for (const task of tasks) {
      if (!task || typeof task.id !== 'string' || seen.has(task.id)) continue
      seen.add(task.id)
      // Exact duplicates (same feed, title, deadline — e.g. a repeated
      // export row) collapse to the first occurrence (audit E1). Distinct
      // UIDs with different times are kept.
      const dupeKey = `${feed.id}::${String(task.title).trim().toLowerCase()}::${Number(task.dueMs) || 0}`
      if (seen.has(dupeKey)) continue
      seen.add(dupeKey)
      merged.push({ ...task, feedId: feed.id, feedKind: feed.kind || 'ics' })
    }
  }
  return merged.sort(
    (a, b) => a.dueMs - b.dueMs || String(a.title).localeCompare(String(b.title))
  )
}
