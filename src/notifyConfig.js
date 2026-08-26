'use strict'

/**
 * notifyConfig.js
 * ---------------------------------------------------------------------------
 * Normalisation for user-configurable notification thresholds. Users type
 * hours into three boxes; whatever comes out of that goes through here so
 * the notification engine always receives clean, sorted, deduplicated values.
 *
 * Pure module.
 */

/** Hard sanity ceiling: two weeks. */
const MAX_HOURS = 336

const DEFAULTS = () => [24, 6, 1]

/**
 * @param {unknown} value expected: array of hour numbers
 * @param {number[]} [fallback]
 * @returns {number[]} hours sorted descending, deduplicated
 */
export function normalizeThresholdsHours (value, fallback = DEFAULTS()) {
  const base = Array.isArray(fallback) && fallback.length ? fallback : DEFAULTS()
  if (!Array.isArray(value)) return [...base]

  const cleaned = [...new Set(
    value
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0 && n <= MAX_HOURS)
  )].sort((a, b) => b - a)

  return cleaned.length ? cleaned : [...base]
}

/** @returns {number[]} the same thresholds in milliseconds */
export function thresholdsToMs (hours) {
  return normalizeThresholdsHours(hours).map((h) => h * 3600 * 1000)
}
