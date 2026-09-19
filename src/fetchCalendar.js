'use strict'

/**
 * fetchCalendar.js
 * ---------------------------------------------------------------------------
 * Fetches the .ics feed over HTTP GET and caches it locally.
 *
 * Port of v1's module with two environment changes:
 * - Transport is injectable. In the webview it defaults to the Tauri http
 *   plugin (bypasses CORS; the campus server sends no CORS headers); Node
 *   tests can stub it.
 * - Cache storage is injectable: localStorage in the widget, a Map in tests.
 *
 * Unchanged from v1: the 15-minute refresh floor, conditional GET with
 * ETag/If-Modified-Since, offline retry ladder, and URL diagnostics.
 */

export const MINUTE_MS = 60 * 1000

/** Hard floor mandated by the spec. */
export const MIN_REFRESH_MS = 15 * MINUTE_MS
export const DEFAULT_REFRESH_MS = 20 * MINUTE_MS
export const MAX_REFRESH_MS = 30 * MINUTE_MS

const REQUEST_TIMEOUT_MS = 20 * 1000
const MAX_BYTES = 8 * 1024 * 1024
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

/** Retry ladder for failures where the request never reached the server. */
const OFFLINE_RETRY_LADDER_MS = [MINUTE_MS, 2 * MINUTE_MS, 4 * MINUTE_MS, 8 * MINUTE_MS]

export class FeedError extends Error {
  constructor (message, code, { transport = false, status = null } = {}) {
    super(message)
    this.name = 'FeedError'
    this.code = code
    /** transport === true means the server was never reached. */
    this.transport = transport
    this.status = status
  }
}

export function clampInterval (value) {
  if (!Number.isFinite(value)) return DEFAULT_REFRESH_MS
  return Math.min(Math.max(value, MIN_REFRESH_MS), MAX_REFRESH_MS)
}

/**
 * The feed URL carries a private auth token, so it must never be logged.
 */
export function describeUrl (url) {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    return '<invalid url>'
  }
}

export function validateUrl (rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new FeedError('Calendar feed URL is not configured.', 'URL_MISSING')
  }
  let parsed
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new FeedError('Calendar feed URL is not a valid URL.', 'URL_INVALID')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new FeedError(
      `Calendar feed URL must use http or https (got "${parsed.protocol}").`,
      'URL_PROTOCOL'
    )
  }
  return parsed.toString()
}

function looksLikeCalendar (text) {
  return typeof text === 'string' && text.includes('BEGIN:VCALENDAR')
}

/**
 * Sanity-check the *shape* of a feed URL before spending a request on it.
 * Advisory only — unusual but valid deployments still get to try.
 */
export function inspectFeedUrl (rawUrl) {
  let parsed
  try {
    parsed = new URL(String(rawUrl).trim())
  } catch {
    return { ok: false, hint: null }
  }

  const path = parsed.pathname.toLowerCase()
  const params = parsed.searchParams
  const isExport = path.includes('export_execute.php')
  const hasToken = params.has('authtoken')

  if (isExport && hasToken) return { ok: true, hint: null }

  const KNOWN_PAGES = [
    [/\/my\/?$/, 'That is your BRONE dashboard, which needs your login to open.'],
    [/\/calendar\/view\.php/, 'That is the calendar page you were viewing, not its export link.'],
    [/\/course\/view\.php/, 'That is a course page, not a calendar feed.'],
    [/\/mod\//, 'That is a single activity page, not a calendar feed.'],
    [/^\/?$/, 'That is just the site home page.']
  ]

  for (const [pattern, why] of KNOWN_PAGES) {
    if (pattern.test(path)) {
      return {
        ok: false,
        hint: `${why} Open Calendar → Export calendar → Get calendar URL and paste that link instead.`
      }
    }
  }

  if (!isExport) {
    return {
      ok: false,
      hint: 'This does not look like a calendar export link. It should contain /calendar/export_execute.php and an authtoken.'
    }
  }

  return {
    ok: false,
    hint: 'This is the export address but the authtoken is missing. Copy the whole URL from "Get calendar URL".'
  }
}

/** fetch()-compatible transport that works in the webview and in Node. */
async function defaultTransport (url, init) {
  const tauriFetch = typeof window !== 'undefined' ? window.__TAURI__?.http?.fetch : null
  const doFetch = tauriFetch ?? globalThis.fetch.bind(globalThis)
  return doFetch(url, init)
}

/** localStorage-backed cache with an in-memory fallback for tests/Node.
 *  `key` namespaces the slot so each feed keeps its own cache. */
function defaultStore (key = 'feed-cache') {
  if (typeof localStorage !== 'undefined') {
    return {
      async load () {
        try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
      },
      async save (payload) {
        try { localStorage.setItem(key, JSON.stringify(payload)) } catch { /* quota */ }
      },
      async clear () {
        try { localStorage.removeItem(key) } catch { /* noop */ }
      }
    }
  }
  let memory = null
  return {
    async load () { return memory },
    async save (payload) { memory = payload },
    async clear () { memory = null }
  }
}

async function fingerprintOf (url) {
  try {
    const data = new TextEncoder().encode(url)
    const buf = await crypto.subtle.digest('SHA-256', data)
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
  } catch {
    // Non-crypto environments fall back to direct comparison.
    return url
  }
}

/**
 * Emits via injected callbacks:
 *   onUpdate ({ ics, meta, changed })   feed content available
 *   onError  (FeedError)                a refresh attempt failed
 *   onStatus (state)                    any state transition
 */
export class CalendarFetcher {
  /**
   * @param {object} options
   * @param {string}   options.url          feed URL (kept private)
   * @param {number}   [options.refreshMs]  clamped into [15min, 30min]
   * @param {string}   [options.cacheKey]   cache slot; one per feed id
   * @param {Function} [options.transport]  (url, init) => fetch-like Response
   * @param {{load:Function,save:Function,clear:Function}} [options.store]
   * @param {{onUpdate?:Function,onError?:Function,onStatus?:Function}} [options.handlers]
   */
  constructor ({
    url,
    refreshMs = DEFAULT_REFRESH_MS,
    cacheKey = 'feed-cache',
    transport = defaultTransport,
    store = null,
    handlers = {}
  } = {}) {
    if (!store) store = defaultStore(cacheKey)
    this.refreshMs = clampInterval(refreshMs)
    this.transport = transport
    this.store = store
    this.onUpdate = handlers.onUpdate ?? (() => {})
    this.onError = handlers.onError ?? (() => {})
    this.onStatus = handlers.onStatus ?? (() => {})

    this.url = null
    this.configError = null
    try {
      this.url = validateUrl(url)
    } catch (error) {
      this.configError = error
    }

    this.ics = null
    this.etag = null
    this.lastModified = null
    this.lastFetchedAt = null
    this.lastChangedAt = null
    this.lastError = this.configError
    this.status = this.configError ? 'unconfigured' : 'idle'
    this.fromCache = false

    this.timer = null
    this.inFlight = null
    this.consecutiveTransportFailures = 0
    this.stopped = false
    this.nextRefreshAt = null
  }

  get configured () {
    return this.url !== null
  }

  getState () {
    return {
      status: this.status,
      configured: this.configured,
      hasData: typeof this.ics === 'string' && this.ics.length > 0,
      fromCache: this.fromCache,
      lastFetchedAt: this.lastFetchedAt,
      lastChangedAt: this.lastChangedAt,
      nextRefreshAt: this.nextRefreshAt,
      refreshMs: this.refreshMs,
      feed: this.url ? describeUrl(this.url) : null,
      error: this.lastError ? { code: this.lastError.code, message: this.lastError.message } : null
    }
  }

  setStatus (status) {
    this.status = status
    this.onStatus(this.getState())
  }

  async start () {
    this.stopped = false
    await this.loadCache()

    if (!this.configured) {
      this.setStatus('unconfigured')
      this.onError(this.configError)
      return this.getState()
    }

    if (this.ics) {
      this.fromCache = true
      this.onUpdate({ ics: this.ics, meta: this.getState(), changed: false })
    }

    const age = this.lastFetchedAt ? Date.now() - Date.parse(this.lastFetchedAt) : Infinity
    if (Number.isFinite(age) && age < this.refreshMs) {
      this.scheduleNext(this.refreshMs - age)
    } else {
      await this.refresh()
    }
    return this.getState()
  }

  stop () {
    this.stopped = true
    this.clearTimer()
  }

  clearTimer () {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.nextRefreshAt = null
  }

  scheduleNext (delayMs) {
    this.clearTimer()
    if (this.stopped || !this.configured) return
    const delay = Math.max(1000, Math.round(delayMs))
    this.nextRefreshAt = new Date(Date.now() + delay).toISOString()
    this.timer = setTimeout(() => {
      this.timer = null
      this.refresh().catch(() => {})
    }, delay)
  }

  async loadCache () {
    try {
      const cached = await this.store.load()
      if (!cached || !looksLikeCalendar(cached.ics)) return
      const fingerprint = await fingerprintOf(this.url ?? '')
      if (cached.urlFingerprint !== fingerprint) return

      this.ics = cached.ics
      this.etag = cached.etag ?? null
      this.lastModified = cached.lastModified ?? null
      this.lastFetchedAt = cached.lastFetchedAt ?? null
      this.lastChangedAt = cached.lastChangedAt ?? null
    } catch {
      // Missing or corrupt cache is not an error; we just fetch fresh.
    }
  }

  async saveCache () {
    if (!this.ics) return
    const payload = {
      version: 1,
      urlFingerprint: await fingerprintOf(this.url ?? ''),
      etag: this.etag,
      lastModified: this.lastModified,
      lastFetchedAt: this.lastFetchedAt,
      lastChangedAt: this.lastChangedAt,
      ics: this.ics
    }
    await this.store.save(payload)
  }

  async refresh (options = {}) {
    if (!this.configured) {
      this.setStatus('unconfigured')
      return this.getState()
    }
    if (this.inFlight) return this.inFlight

    const sinceLast = this.lastFetchedAt ? Date.now() - Date.parse(this.lastFetchedAt) : Infinity
    if (!options.force && Number.isFinite(sinceLast) && sinceLast < MIN_REFRESH_MS) {
      this.scheduleNext(MIN_REFRESH_MS - sinceLast)
      return this.getState()
    }

    this.inFlight = this.performFetch().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  async performFetch () {
    this.setStatus(this.ics ? 'refreshing' : 'loading')

    try {
      const result = await this.requestFeed()
      const now = new Date().toISOString()

      this.consecutiveTransportFailures = 0
      this.lastError = null
      this.lastFetchedAt = now
      this.fromCache = false

      if (result.notModified) {
        this.setStatus('ready')
        await this.saveCache()
        this.onUpdate({ ics: this.ics, meta: this.getState(), changed: false })
      } else {
        const changed = result.ics !== this.ics
        this.ics = result.ics
        this.etag = result.etag
        this.lastModified = result.lastModified
        if (changed) this.lastChangedAt = now
        this.setStatus('ready')
        await this.saveCache()
        this.onUpdate({ ics: this.ics, meta: this.getState(), changed })
      }

      this.scheduleNext(this.refreshMs)
      return this.getState()
    } catch (error) {
      const feedError = error instanceof FeedError
        ? error
        : new FeedError(error.message ?? String(error), 'FETCH_FAILED', { transport: true })

      this.lastError = feedError
      this.setStatus(this.ics ? 'stale' : 'error')
      this.onError(feedError)

      if (feedError.transport) {
        const ladderIndex = Math.min(
          this.consecutiveTransportFailures,
          OFFLINE_RETRY_LADDER_MS.length - 1
        )
        this.consecutiveTransportFailures += 1
        const delay =
          this.consecutiveTransportFailures > OFFLINE_RETRY_LADDER_MS.length
            ? this.refreshMs
            : OFFLINE_RETRY_LADDER_MS[ladderIndex]
        this.scheduleNext(delay)
      } else {
        this.consecutiveTransportFailures = 0
        this.scheduleNext(this.refreshMs)
      }

      return this.getState()
    }
  }

  async requestFeed () {
    const headers = {
      Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5',
      'User-Agent': USER_AGENT
    }
    // Conditional GET: cheap for the campus server when nothing changed.
    if (this.ics && this.etag) headers['If-None-Match'] = this.etag
    if (this.ics && this.lastModified) headers['If-Modified-Since'] = this.lastModified

    let response
    try {
      response = await this.transport(this.url, {
        method: 'GET',
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      throw new FeedError(
        timedOut
          ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
          : `Cannot reach the calendar feed (${error?.cause?.code ?? error?.message ?? 'network error'}).`,
        timedOut ? 'TIMEOUT' : 'NETWORK',
        { transport: true }
      )
    }

    if (response.status === 304) {
      if (!this.ics) {
        throw new FeedError(
          'Server replied 304 Not Modified but no cached copy exists.',
          'STALE_304',
          { status: 304 }
        )
      }
      return { notModified: true }
    }

    if (response.status === 401 || response.status === 403) {
      throw new FeedError(
        `Feed rejected the request (HTTP ${response.status}). The token in the calendar URL may have been reset — export a fresh calendar URL.`,
        'UNAUTHORIZED',
        { status: response.status }
      )
    }

    if (!response.ok) {
      throw new FeedError(
        `Feed returned HTTP ${response.status} ${response.statusText}.`,
        'HTTP_ERROR',
        { status: response.status }
      )
    }

    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      throw new FeedError(`Feed is too large (${declaredLength} bytes).`, 'TOO_LARGE', { status: response.status })
    }

    const text = await response.text()
    if (text.length > MAX_BYTES) {
      throw new FeedError(`Feed is too large (${text.length} bytes).`, 'TOO_LARGE')
    }

    if (!looksLikeCalendar(text)) {
      throw new FeedError(
        'Response is not an iCalendar feed. Check that the saved URL points at the exported .ics address.',
        'NOT_CALENDAR',
        { status: response.status }
      )
    }

    return {
      notModified: false,
      ics: text,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified')
    }
  }
}
