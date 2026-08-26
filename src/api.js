'use strict'

/**
 * api.js
 * ---------------------------------------------------------------------------
 * Thin typed bridge over the Tauri IPC surface. Replaces v1's preload.js
 * contextBridge: same call shapes, so renderer/settings logic ports with
 * minimal churn. Everything that touches the OS goes through here.
 */

import { CalendarFetcher, validateUrl as validateFeedUrl } from './fetchCalendar.js'
import { parseTasks } from './parseTasks.js'

const cmd = (name, args) => window.__TAURI__.core.invoke(name, args)

/** Probe a candidate feed URL without saving it (v1 settings:test parity). */
async function testFeed (rawUrl) {
  let url
  try {
    url = validateFeedUrl(rawUrl)
  } catch (error) {
    return { ok: false, code: error.code ?? 'URL_INVALID', message: error.message }
  }
  const fetcher = new CalendarFetcher({ url })
  try {
    const result = await Promise.race([
      fetcher.requestFeed(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Koneksi timeout ke server kampus.')), 15000))
    ])
    const found = parseTasks(result.ics ?? '')
    const next = found[0]
    return {
      ok: true,
      count: found.length,
      next: next ? { title: next.title, course: next.course, due: next.due } : null
    }
  } catch (error) {
    return { ok: false, code: error.code ?? 'FETCH_FAILED', message: error.message ?? String(error) }
  }
}

export const api = {
  // ---- lifecycle
  hide: () => cmd('widget_hide'),
  quit: () => cmd('app_quit'),
  autosize: (height) => cmd('widget_autosize', { height: Number(height) || 0 }),

  // ---- links & folders
  openExternal: (url) => cmd('open_external', { url: String(url ?? '') }),
  openConfigFolder: () => cmd('open_config_folder'),

  // ---- persistence (whole-doc merge patches, renderer owns merging)
  settingsRead: () => cmd('settings_read'),
  settingsWrite: async (patch) => cmd('settings_write', { patch }),
  /** Tell Rust a save happened: tray checkboxes + layering refresh. */
  settingsChanged: () => cmd('settings_changed'),

  // ---- feed secret
  /** Masked URL + where it came from ("keyring-full" | "env-var" | "none"). */
  feedUrlInfo: () => cmd('feed_url_get'),
  /** Full URL — only for prefilling the settings form. */
  feedUrlGetFull: () => cmd('feed_url_get_full'),
  feedUrlSet: (url) => cmd('feed_url_set', { url }),

  // ---- display mode
  setDisplayMode: (mode) => cmd('set_display_mode', { mode: String(mode ?? '') }),

  // ---- native surfaces
  notify: (title, body) => cmd('notify', { title: String(title ?? ''), body: String(body ?? '') }),
  trayTooltip: (text) => cmd('tray_tooltip', { text: String(text ?? '') }),
  openSettings: () => cmd('open_settings'),
  closeSettings: () => cmd('settings_close'),

  // ---- BRONE assisted login
  loginBrone: () => cmd('auth_brone_login'),

  // ---- submission auto-detection (opt-in)
  /** Hidden checker webview visits each URL with the user's session; results
   *  arrive as `submission-checked` events ({url, status}). */
  submissionCheck: (urls) => cmd('submission_check', { urls: Array.isArray(urls) ? urls : [] }),

  // ---- autostart
  autostartGet: () => cmd('autostart_get'),
  autostartSet: (enabled) => cmd('autostart_set', { enabled: Boolean(enabled) }),

  /**
   * Configuration snapshot for the Settings form (v1 `settings:get` parity).
   */
  getSettings: async () => {
    const [doc, info, full, openAtLogin] = await Promise.all([
      cmd('settings_read'),
      cmd('feed_url_get'),
      cmd('feed_url_get_full').catch(() => null),
      cmd('autostart_get').catch(() => false)
    ])
    return {
      /** Full URL for form prefill; masked variants are for display only. */
      feedUrl: full ?? null,
      source: info.source,
      envMasked: info.source === 'env-var' ? info.url : null,
      openAtLogin,
      notifications: doc.notifications !== false,
      collapsed: Boolean(doc.collapsed),
      opacity: typeof doc.opacity === 'number' ? doc.opacity : 1,
      displayMode: doc.displayMode || 'alwaysOnTop',
      autoDetect: doc.autoDetect === true,
      refreshMinutes: Number(doc.refreshMinutes) || 20,
      notifyThresholdsHours: Array.isArray(doc.notifyThresholdsHours)
        ? doc.notifyThresholdsHours
        : [24, 6, 1]
    }
  },

  // ---- helpers
  testFeed,
  /**
   * Clipboard text via the plugin (WebView2 denies navigator.clipboard by
   * default); falls back to the webview API when the plugin is absent.
   */
  readClipboard: async () => {
    try {
      return await window.__TAURI__.clipboardManager.readText()
    } catch {
      try { return await navigator.clipboard.readText() } catch { return '' }
    }
  },
  /**
   * Global events: 'tray-command', 'settings-changed', 'feed-changed'.
 * @returns {Promise<() => void>} unsubscribe
   */
  listen: (event, handler) =>
    window.__TAURI__.event.listen(event, (e) => handler(e.payload))
}

export { validateFeedUrl }
