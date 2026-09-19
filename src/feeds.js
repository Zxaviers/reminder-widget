'use strict'

/**
 * feeds.js
 * ---------------------------------------------------------------------------
 * Pure helpers for multi-feed metadata. The URL itself never passes through
 * here for storage: it goes straight to the Rust secret store via api.feedSet.
 * This module only validates ids/kinds/urls and shapes the non-secret row
 * that lives in settings.json (`feeds: [{id, kind, label, enabled}]`).
 *
 * Pure module: no DOM, no storage, no network. Safe to unit test.
 */

export const FEED_KINDS = ['brone', 'google', 'ics']

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export function isValidFeedId (id) {
  return typeof id === 'string' && ID_RE.test(id.trim())
}

export function normalizeFeedKind (kind) {
  const clean = String(kind ?? '').trim()
  return FEED_KINDS.includes(clean) ? clean : null
}

function normalizeUrl (raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return trimmed
  } catch {
    return null
  }
}

/**
 * @returns {{ok: true, feed: object} | {ok: false, error: string}}
 */
export function normalizeFeed ({ id, kind, label, url, enabled } = {}) {
  const cleanId = String(id ?? '').trim()
  if (!isValidFeedId(cleanId)) return { ok: false, error: 'ID feed tidak valid.' }

  const cleanKind = normalizeFeedKind(kind)
  if (!cleanKind) return { ok: false, error: 'Jenis feed tidak dikenal.' }

  const cleanUrl = normalizeUrl(url)
  if (!cleanUrl) return { ok: false, error: 'URL feed tidak valid.' }

  const cleanLabel = String(label ?? '').trim() || cleanId
  return {
    ok: true,
    feed: {
      id: cleanId,
      kind: cleanKind,
      label: cleanLabel,
      url: cleanUrl,
      enabled: enabled !== false
    }
  }
}

/** Strip the secret URL, leaving the row safe for settings.json. */
export function feedMetaFrom (feed) {
  return {
    id: feed.id,
    kind: feed.kind,
    label: feed.label,
    enabled: feed.enabled !== false
  }
}

/** Upsert a metadata row by id. Inputs are not mutated. */
export function upsertFeedMeta (metas, meta) {
  const list = Array.isArray(metas) ? [...metas] : []
  const at = list.findIndex((m) => m && m.id === meta.id)
  if (at >= 0) list[at] = { ...list[at], ...meta }
  else list.push({ ...meta })
  return list
}
