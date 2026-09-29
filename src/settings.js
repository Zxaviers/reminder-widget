'use strict'

/**
 * settings.js
 * ---------------------------------------------------------------------------
 * Settings sheet logic. Ported from v1 with Tauri IPC:
 * - Assisted BRONE login window (1-click) + clipboard paste.
 * - Manual .ics calendar feed URL configuration and testing.
 * - Display mode switching (Always on top vs Desktop wallpaper layer).
 * - Windows autostart and notification preferences.
 */

import { api } from './api.js'
import { normalizeFeed } from './feeds.js'
import { ICONS as PH, PH_VIEWBOX } from './icons.js'

const el = {
  close: document.getElementById('close'),
  btnOpenBrowserMain: document.getElementById('btn-open-browser-main'),
  btnPasteClipboard: document.getElementById('btn-paste-clipboard'),
  modeAlwaysTop: document.getElementById('mode-always-top'),
  modeDesktop: document.getElementById('mode-desktop'),
  feedList: document.getElementById('feed-list'),
  feedUrl: document.getElementById('feed-url'),
  feedSave: document.getElementById('feed-save'),
  thChips: document.getElementById('th-chips'),
  refreshChips: document.getElementById('refresh-chips'),
  themeChips: document.getElementById('theme-chips'),
  desktopOpts: document.getElementById('desktop-opts'),
  result: document.getElementById('result'),
  resultIcon: document.querySelector('.result__icon'),
  resultTitle: document.getElementById('result-title'),
  resultNote: document.getElementById('result-note'),
  sub: document.getElementById('sub'),
  autostart: document.getElementById('autostart'),
  notify: document.getElementById('notify'),
  autoDetect: document.getElementById('auto-detect'),
  opacity: document.getElementById('opacity'),
  opacityVal: document.getElementById('opacity-val'),
  footnote: document.getElementById('footnote')
}

// Official Phosphor Icons (Bold) result glyphs — see src/icons.js.
const ICONS = {
  ok: PH.checkCircle,
  bad: PH.warningCircle,
  busy: PH.refresh
}

let busy = false

function setIcon (kind) {
  if (!el.resultIcon) return
  el.resultIcon.setAttribute('viewBox', PH_VIEWBOX)
  el.resultIcon.setAttribute('fill', 'currentColor')
  el.resultIcon.setAttribute('data-ph', '')
  el.resultIcon.replaceChildren()
  for (const d of ICONS[kind] ?? []) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    el.resultIcon.appendChild(path)
  }
}

function showResult (kind, title, note) {
  if (!el.result) return
  el.result.hidden = false
  el.result.className = `result result--${kind}`
  setIcon(kind)
  if (el.resultTitle) el.resultTitle.textContent = title
  if (el.resultNote) el.resultNote.textContent = note ?? ''
}

function clearResult () {
  if (el.result) el.result.hidden = true
}

function setBusy (value, label) {
  busy = value
  if (el.test) el.test.disabled = value
  if (el.save) el.save.disabled = value
  if (el.btnPasteClipboard) el.btnPasteClipboard.disabled = value
  if (value) showResult('busy', label ?? 'Memproses…', '')
}

/** Turn a due ISO string into something short and human. */
function describeNext (next) {
  if (!next) return 'Belum ada tugas mendesak dalam rentang waktu.'
  const due = new Date(next.due)
  const when = due.toLocaleString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  const course = next.course ? ` · ${next.course}` : ''
  return `Terdekat: ${next.title}${course} — ${when}`
}

function extractUrlFromText (rawText) {
  if (typeof rawText !== 'string') return ''
  const trimmed = rawText.trim()
  const match = trimmed.match(/https:\/\/[^\s"'<>]+/i)
  return match ? match[0] : trimmed
}

async function pasteFromClipboardAndConnect () {
  try {
    setBusy(true, 'Membaca clipboard...')
    const text = await api.readClipboard()

    const extracted = extractUrlFromText(text)
    if (!extracted || !extracted.startsWith('http')) {
      setBusy(false)
      showResult(
        'bad',
        'Belum Ada Link di Clipboard',
        'Silakan salin (copy) URL kalender dari browser terlebih dahulu, lalu klik tombol ini lagi. Jika diblokir, gunakan kolom manual (Ctrl+V).'
      )
      return
    }

    if (el.feedUrl) el.feedUrl.value = extracted
    setBusy(false)
    await saveExtraFeed()
  } catch (err) {
    setBusy(false)
    showResult('bad', 'Gagal Membaca Clipboard', err.message || 'Izin clipboard ditolak.')
  }
}

// ---- Feed sources: kind auto-detected from URL, secrets to Rust store.

const KIND_NAME = { brone: 'BRONE', google: 'Google Calendar', ics: 'ICS' }

function detectFeedKind (rawUrl) {
  let host = ''
  let path = ''
  try {
    const parsed = new URL(String(rawUrl ?? '').trim())
    host = parsed.hostname.toLowerCase()
    path = parsed.pathname.toLowerCase()
  } catch {
    return 'ics'
  }
  if (host.includes('brone.ub.ac.id') || path.includes('export_execute.php')) return 'brone'
  if (host.includes('google.com') || host.includes('googleapis.com')) return 'google'
  return 'ics'
}

function autoFeedLabel (kind, rawUrl) {
  if (kind === 'brone') return 'BRONE'
  if (kind === 'google') return 'Google Calendar'
  try {
    return new URL(String(rawUrl).trim()).hostname || 'ICS'
  } catch {
    return 'ICS'
  }
}

function feedHostOf (rawUrl) {
  try {
    return new URL(String(rawUrl ?? '').trim()).hostname || null
  } catch {
    return null
  }
}

function feedHost (feed) {
  return feedHosts[feed.id] ?? null
}

function nextFeedId (kind) {
  if (kind === 'brone') return 'brone'
  const prefix = kind === 'google' ? 'google' : 'ics'
  return `${prefix}-${Date.now().toString(36)}`
}

function svgIcon (paths, viewBox = '0 0 16 16') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  node.setAttribute('viewBox', viewBox)
  node.setAttribute('aria-hidden', 'true')
  if (viewBox === PH_VIEWBOX) {
    node.setAttribute('fill', 'currentColor')
    node.setAttribute('data-ph', '')
  }
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    node.appendChild(path)
  }
  return node
}

// Official Phosphor Icons (Bold) — see src/icons.js.
const ICON_REFRESH = PH.refresh
const ICON_TRASH = PH.trash

/** Hostname (non-secret URL part) per feed id for informative meta rows. */
let feedHosts = {}

async function refreshFeedList () {
  if (!el.feedList) return
  el.feedList.replaceChildren()
  let feeds = []
  try {
    feeds = await api.feedsList()
  } catch {
    feeds = []
  }
  try {
    const full = await api.feedsGetFull()
    feedHosts = Object.fromEntries(
      (Array.isArray(full) ? full : []).map((f) => [f.id, feedHostOf(f.url)])
    )
  } catch {
    feedHosts = {}
  }
  const ordered = [...feeds].sort((a, b) => {
    if (a.id === 'brone') return -1
    if (b.id === 'brone') return 1
    return String(a.label || a.id).localeCompare(String(b.label || b.id))
  })
  for (const feed of ordered) {
    if (!feed || !feed.id) continue
    const li = document.createElement('li')
    li.className = 'feed-row'

    const info = document.createElement('div')
    info.className = 'feed-info'
    const name = document.createElement('span')
    name.className = 'feed-name'
    name.textContent = feed.label || feed.id
    const meta = document.createElement('span')
    meta.className = 'feed-meta'
    meta.textContent = `${(feedHost(feed) ?? KIND_NAME[feed.kind]) || feed.kind} · ${feed.hasSecret ? 'terhubung' : 'tanpa URL'}`
    info.append(name, meta)

    const testBtn = document.createElement('button')
    testBtn.type = 'button'
    testBtn.className = 'icon-btn small'
    testBtn.setAttribute('aria-label', `Uji koneksi ${feed.label || feed.id}`)
    testBtn.appendChild(svgIcon(ICON_REFRESH, PH_VIEWBOX))
    testBtn.addEventListener('click', () => testFeedRow(feed))

    const rm = document.createElement('button')
    rm.type = 'button'
    rm.className = 'icon-btn small'
    rm.setAttribute('aria-label', `Hapus feed ${feed.label || feed.id}`)
    rm.appendChild(svgIcon(ICON_TRASH, PH_VIEWBOX))
    rm.addEventListener('click', async () => {
      setBusy(true, 'Menghapus feed…')
      try {
        await api.feedRemove(feed.id)
        await refreshFeedList()
        setBusy(false)
        showResult('ok', 'Feed Dihapus', `${feed.label || feed.id} tidak lagi disinkronkan.`)
      } catch (err) {
        setBusy(false)
        showResult('bad', 'Gagal Menghapus', err.message || String(err))
      }
    })

    li.append(info, testBtn, rm)
    el.feedList.appendChild(li)
  }
}

async function testFeedRow (feed) {
  setBusy(true, 'Menghubungi server feed…')
  let full = []
  try {
    full = await api.feedsGetFull()
  } catch {
    full = []
  }
  const match = full.find((f) => f && f.id === feed.id)
  if (!match) {
    setBusy(false)
    showResult('bad', 'Belum Ada URL', 'Feed ini belum menyimpan URL. Tambahkan ulang lewat kolom di bawah.')
    return null
  }
  const result = await api.testFeed(match.url)
  setBusy(false)
  if (result.ok) {
    const count = result.count === 1 ? '1 tugas ditemukan' : `${result.count} tugas ditemukan`
    showResult('ok', `Feed valid — ${count}`, describeNext(result.next))
  } else {
    showResult('bad', 'Koneksi Gagal', result.message)
  }
  return result
}

async function saveExtraFeed () {
  const url = el.feedUrl?.value ?? ''
  const kind = detectFeedKind(url)
  const checked = normalizeFeed({
    id: nextFeedId(kind),
    kind,
    label: autoFeedLabel(kind, url),
    url
  })
  if (!checked.ok) {
    showResult('bad', 'Belum Bisa Disimpan', checked.error)
    return
  }
  setBusy(true, 'Memverifikasi & menyimpan feed…')
  const probe = await api.testFeed(checked.feed.url)
  if (!probe || !probe.ok) {
    setBusy(false)
    showResult('bad', 'Koneksi Gagal', probe?.message || 'Tidak dapat memuat feed kalender.')
    return
  }
  try {
    await api.feedSet(checked.feed)
  } catch (err) {
    setBusy(false)
    showResult('bad', 'Gagal Menyimpan', err.message || String(err))
    return
  }
  if (el.feedUrl) el.feedUrl.value = ''
  await refreshFeedList()
  setBusy(false)
  showResult('ok', `Feed Ditambahkan (${probe.count} tugas)`, 'Widget mengambil feed ini tiap refresh.')
}

// ---- Chips: thresholds (multi), interval + theme (single).

function renderChips (container, options, selected, { multi, format }) {
  if (!container) return
  container.replaceChildren()
  for (const value of options) {
    const on = multi ? selected.includes(value) : selected === value
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `chip${on ? ' on' : ''}`
    btn.textContent = format(value)
    btn.setAttribute('aria-pressed', String(on))
    btn.addEventListener('click', () => container.dispatchEvent(
      new CustomEvent('chip-pick', { detail: value, bubbles: false })
    ))
    container.appendChild(btn)
  }
}

const THRESHOLD_CHOICES = [1, 6, 12, 24]
const REFRESH_CHOICES = [15, 20, 30]

function currentThresholds () {
  const raw = settingsCache.notifyThresholdsHours
  const list = Array.isArray(raw) ? raw.filter((n) => Number.isFinite(n) && n > 0) : [24, 6, 1]
  return [...new Set(list)].sort((a, b) => a - b)
}

function paintThresholdChips () {
  const selected = currentThresholds()
  const extra = selected.filter((n) => !THRESHOLD_CHOICES.includes(n))
  renderChips(el.thChips, [...THRESHOLD_CHOICES, ...extra].sort((a, b) => a - b), selected, {
    multi: true,
    format: (n) => `${n}j`
  })
}

function paintRefreshChips () {
  const current = Number(settingsCache.refreshMinutes) || 20
  const nearest = REFRESH_CHOICES.includes(current)
    ? current
    : REFRESH_CHOICES.reduce((a, b) => Math.abs(b - current) < Math.abs(a - current) ? b : a)
  renderChips(el.refreshChips, REFRESH_CHOICES, nearest, {
    multi: false,
    format: (n) => String(n)
  })
}

function paintThemeChips () {
  const current = ['dark', 'light', 'auto'].includes(settingsCache.theme)
    ? settingsCache.theme
    : 'auto'
  renderChips(el.themeChips, ['dark', 'light', 'auto'], current, {
    multi: false,
    format: (v) => v === 'dark' ? 'Gelap' : v === 'light' ? 'Terang' : 'Otomatis'
  })
}

function previewTheme () {
  const pref = ['dark', 'light', 'auto'].includes(settingsCache.theme)
    ? settingsCache.theme
    : 'auto'
  let theme = pref
  if (pref === 'auto') {
    try {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    } catch {
      theme = 'dark'
    }
  }
  document.documentElement.dataset.theme = theme
  void api.setStatusBarStyle(theme !== 'light')
}

/** Live snapshot of settings for chip painting; refreshed on load + change. */
let settingsCache = {}

async function commitChips (patch) {
  Object.assign(settingsCache, patch)
  await api.settingsWrite(patch)
  await api.settingsChanged()
  paintThresholdChips()
  paintRefreshChips()
  paintThemeChips()
}

async function load () {
  const config = await api.getSettings()
  settingsCache = {
    notifyThresholdsHours: config.notifyThresholdsHours,
    refreshMinutes: config.refreshMinutes,
    theme: config.theme
  }
  refreshFeedList().catch(() => {})

  if (el.autostart) el.autostart.checked = Boolean(config.openAtLogin)
  if (el.notify) el.notify.checked = Boolean(config.notifications)
  if (el.autoDetect) el.autoDetect.checked = Boolean(config.autoDetect)

  if (el.opacity) {
    const pct = Math.round((Number(config.opacity) || 1) * 100)
    el.opacity.value = String(pct)
    if (el.opacityVal) el.opacityVal.textContent = `${pct}%`
  }

  previewTheme()
  paintThresholdChips()
  paintRefreshChips()
  paintThemeChips()

  const mode = config.displayMode || 'alwaysOnTop'
  if (mode === 'desktop') {
    if (el.modeDesktop) el.modeDesktop.checked = true
  } else if (el.modeAlwaysTop) {
    el.modeAlwaysTop.checked = true
  }

  const authBox = document.getElementById('auth-box')
  if (config.feedUrl) {
    if (el.sub) el.sub.textContent = 'Terhubung'
    if (authBox) authBox.classList.add('connected')
  } else if (config.envMasked) {
    if (el.sub) el.sub.textContent = 'Menggunakan .env'
    showResult('ok', 'Menggunakan CALENDAR_FEED_URL', `${config.envMasked} — tambah feed di bawah jika ingin mengganti.`)
  } else if (el.sub) {
    el.sub.textContent = 'Belum Terhubung'
    if (authBox) authBox.classList.remove('connected')
  }

  const isMob = await api.isMobile()
  if (isMob) {
    // Desktop-only options stay visible but dimmed and disabled.
    if (el.desktopOpts) el.desktopOpts.classList.add('dim')
    for (const input of [el.autostart, el.autoDetect]) {
      if (input) input.disabled = true
    }
    const modeSection = document.querySelector('.mode-options')
    if (modeSection) {
      modeSection.hidden = true
      if (modeSection.previousElementSibling) modeSection.previousElementSibling.hidden = true
    }
    if (el.footnote) {
      el.footnote.textContent =
        'URL kalender tersimpan privat di aplikasi ini. Pengingat deadline dijadwalkan otomatis.'
    }
  } else {
    if (el.desktopOpts) el.desktopOpts.classList.remove('dim')
    if (el.footnote) {
      el.footnote.textContent =
        'URL kalender tersimpan aman di Windows Credential Manager. Refresh otomatis tiap 20 menit.'
    }
  }
}

// Event Listeners
if (el.btnOpenBrowserMain) {
  el.btnOpenBrowserMain.addEventListener('click', () => {
    api.openExternal('https://brone.ub.ac.id/calendar/export.php')
  })
}

if (el.btnPasteClipboard) {
  el.btnPasteClipboard.addEventListener('click', pasteFromClipboardAndConnect)
}

if (el.feedSave) el.feedSave.addEventListener('click', saveExtraFeed)
if (el.feedUrl) el.feedUrl.addEventListener('input', clearResult)
if (el.close) el.close.addEventListener('click', () => api.closeSettings())

if (el.thChips) {
  el.thChips.addEventListener('chip-pick', (event) => {
    const value = event.detail
    const selected = new Set(currentThresholds())
    if (selected.has(value)) {
      if (selected.size > 1) selected.delete(value)
    } else {
      selected.add(value)
    }
    void commitChips({ notifyThresholdsHours: [...selected].sort((a, b) => b - a) })
  })
}

if (el.refreshChips) {
  el.refreshChips.addEventListener('chip-pick', (event) => {
    void commitChips({ refreshMinutes: Number(event.detail) || 20 })
  })
}

if (el.themeChips) {
  el.themeChips.addEventListener('chip-pick', (event) => {
    const theme = ['dark', 'light', 'auto'].includes(event.detail) ? event.detail : 'auto'
    settingsCache.theme = theme
    previewTheme()
    paintThemeChips()
    api.settingsWrite({ theme }).then(() => api.settingsChanged()).catch(() => {})
  })
}

try {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if ((settingsCache.theme ?? 'auto') === 'auto') previewTheme()
  })
} catch { /* older webviews: manual theme only */ }

if (el.modeAlwaysTop) {
  el.modeAlwaysTop.addEventListener('change', () => {
    if (el.modeAlwaysTop.checked) api.setDisplayMode('alwaysOnTop')
  })
}

if (el.modeDesktop) {
  el.modeDesktop.addEventListener('change', () => {
    if (el.modeDesktop.checked) api.setDisplayMode('desktop')
  })
}

if (el.feedUrl) {
  el.feedUrl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      saveExtraFeed()
    }
  })
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !busy) api.closeSettings()
})

if (el.autostart) {
  el.autostart.addEventListener('change', async () => {
    await api.autostartSet(el.autostart.checked)
    // Keep settings.json in sync for the tray checkbox.
    await api.settingsWrite({ openAtLogin: Boolean(await api.autostartGet()) })
    await api.settingsChanged()
  })
}

if (el.notify) {
  el.notify.addEventListener('change', async () => {
    await api.settingsWrite({ notifications: el.notify.checked })
    await api.settingsChanged()
  })
}

// ---- Notifikasi & Sinkronisasi section

if (el.autoDetect) {
  el.autoDetect.addEventListener('change', async () => {
    await api.settingsWrite({ autoDetect: el.autoDetect.checked })
    await api.settingsChanged()
  })
}

if (el.opacity) {
  el.opacity.addEventListener('input', () => {
    if (el.opacityVal) el.opacityVal.textContent = `${el.opacity.value}%`
  })
  el.opacity.addEventListener('change', async () => {
    const value = Number(el.opacity.value) / 100
    await api.settingsWrite({ opacity: value })
    await api.settingsChanged()
  })
}

document.addEventListener('contextmenu', (event) => {
  if (event.target !== el.feedUrl) event.preventDefault()
})

// Drop sticky hover/focus after tap (audit A5): touch keeps :hover stuck.
document.addEventListener('click', (event) => {
  const btn = event.target.closest?.('button')
  if (btn) btn.blur()
})

load().catch((error) => {
  showResult('bad', 'Gagal Memuat Pengaturan', error.message)
})
