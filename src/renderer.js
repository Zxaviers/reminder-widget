'use strict'

/**
 * renderer.js
 * ---------------------------------------------------------------------------
 * Renders the task list and keeps countdowns live.
 *
 * Architecture change from v1: the widget page itself owns fetching, parsing,
 * notifications and the done-map. The Rust shell owns only native surfaces
 * (window, tray, toasts, secrets). Relative times are recomputed locally every
 * 30s without touching the network.
 */

import { api } from './api.js'
import { CalendarFetcher } from './fetchCalendar.js'
import { parseTasks, DAY_MS, DEFAULT_KEEP_OVERDUE_MS } from './parseTasks.js'
import { createDoneStore } from './doneStore.js'
import { selectForCheck } from './submissionQueue.js'
import { thresholdsToMs } from './notifyConfig.js'
import { planSchedules } from './schedulePlan.js'
import { normalizeLocalEvent, withLocalTasks } from './localEvents.js'
import { mergeFeedTasks } from './multiFetch.js'

const el = {
  panel: document.getElementById('panel'),
  status: document.getElementById('status'),
  taskCount: document.getElementById('task-count'),
  list: document.getElementById('list'),
  hero: document.getElementById('hero'),
  heroCode: document.getElementById('hero-code'),
  heroName: document.getElementById('hero-name'),
  heroWarn: document.getElementById('hero-warn'),
  heroCount: document.getElementById('hero-count'),
  heroTitle: document.getElementById('hero-title'),
  heroDone: document.getElementById('hero-done'),
  doneBtn: document.getElementById('done-btn'),
  doneCount: document.getElementById('done-count'),
  doneToggleLabel: document.getElementById('done-toggle-label'),
  donePanel: document.getElementById('done-panel'),
  doneList: document.getElementById('done-list'),
  btnSettings: document.getElementById('btn-settings'),
  digest: document.getElementById('digest'),
  body: document.getElementById('body'),
  stale: document.getElementById('stale'),
  staleText: document.getElementById('stale-text'),
  errorTitle: document.getElementById('error-title'),
  errorNote: document.getElementById('error-note'),
  errorFix: document.getElementById('error-fix'),
  undoBar: document.getElementById('undo-bar'),
  undoText: document.getElementById('undo-text'),
  btnUndo: document.getElementById('btn-undo'),
  btnCollapse: document.getElementById('btn-collapse'),
  btnAddLocal: document.getElementById('btn-add-local'),
  localPanel: document.getElementById('local-panel'),
  localList: document.getElementById('local-list'),
  localTitle: document.getElementById('local-title'),
  localDate: document.getElementById('local-date'),
  localTime: document.getElementById('local-time'),
  localSave: document.getElementById('local-save'),
  localCancel: document.getElementById('local-cancel'),
  localNote: document.getElementById('local-note'),
  placeholders: {
    loading: document.getElementById('ph-loading'),
    empty: document.getElementById('ph-empty'),
    setup: document.getElementById('ph-setup'),
    error: document.getElementById('ph-error')
  }
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const SOON_MS = DAY // the 24-hour highlight window
const TICK_MS = 30 * 1000

/** Notify once per task as it crosses each of these remaining-time marks.
 *  User-configurable (hours) via Settings; normalised by notifyConfig. */
let notifyThresholdsMs = thresholdsToMs([24, 6, 1])

let state = { tasks: [], meta: { configured: false, status: 'idle' }, settings: {} }
let settingsDoc = {}
let lastSignature = ''
let busy = false
/** One CalendarFetcher per enabled feed; empty when unconfigured. */
let fetchers = []
/** feedId -> {feed, tasks} last parsed output per feed. */
let feedTasksById = new Map()
/** feedId -> {code, message} last error per feed. */
let feedErrors = new Map()

/** taskId -> fired thresholds. Persisted inside settings.json (v1 parity). */
let notified = new Map()
/** Mark-done state (see doneStore.js). */
let done = createDoneStore({})
let undoTimer = null
let persistTimer = null

/** taskId -> epoch ms of the last auto-detect check (rate limiting). */
let lastChecked = new Map()
let checkInFlight = false
/** Currently applied refresh interval, so settings-changed can restart the feed. */
let currentRefreshMinutes = 20
/** Monotonic token: handlers from a superseded startFeed are ignored. */
let startSeq = 0
/** Manual events persisted in settings.json (`localEvents`), merged into tasks. */
let localEvents = []

// ------------------------------------------------------------------ formatting

const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const weekdayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long' })
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })
const weekdayShortFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short' })
const fullDateFmt = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})

function startOfDay (ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function countdown (deltaMs) {
  const abs = Math.abs(deltaMs)
  if (abs < MINUTE) return 'now'
  if (abs < HOUR) return `${Math.floor(abs / MINUTE)}m`
  if (abs < DAY) {
    let hours = Math.floor(abs / HOUR)
    let minutes = Math.round((abs % HOUR) / MINUTE)
    if (minutes >= 60) { hours += 1; minutes = 0 }
    if (hours >= 24) return '1d'
    return minutes >= 5 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  const days = Math.floor(abs / DAY)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return weeks < 5 ? `${weeks}w` : `${Math.floor(days / 30)}mo`
}

function groupLabel (dayStartMs, todayStartMs) {
  const dayDelta = Math.round((dayStartMs - todayStartMs) / DAY)
  if (dayDelta < 0) return 'Terlewat (Overdue)'
  if (dayDelta === 0) return 'Hari Ini'
  if (dayDelta === 1) return 'Besok'
  if (dayDelta < 7) return weekdayFmt.format(new Date(dayStartMs))
  return `${weekdayShortFmt.format(new Date(dayStartMs))}, ${dateFmt.format(new Date(dayStartMs))}`
}

const PHASE_LABEL = { due: 'due', closes: 'closes', opens: 'opens', event: 'event' }

// ------------------------------------------------------------- persistence

function schedulePersist () {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(async () => {
    try {
      // Both maps go over as plain objects: serde BTreeMap round-trips
      // objects, not array-of-pairs.
      await api.settingsWrite({
        done: done.toJSON(),
        notified: Object.fromEntries(notified),
        lastChecked: Object.fromEntries(lastChecked)
      })
    } catch { /* best effort */ }
  }, 400)
}

/** settings.json may carry an object or legacy array-of-pairs. */
function toMap (value) {
  if (Array.isArray(value)) return new Map(value)
  if (value && typeof value === 'object') {
    return new Map(Object.entries(value).map(([k, v]) => [k, Array.isArray(v) ? v : []]))
  }
  return new Map()
}

/** Same shape tolerance for plain-number maps (lastChecked). */
function toNumberMap (value) {
  if (Array.isArray(value)) return new Map(value)
  if (value && typeof value === 'object') {
    return new Map(Object.entries(value).map(([k, v]) => [k, Number(v) || 0]))
  }
  return new Map()
}

// -------------------------------------------------------------- notifications

/**
 * Fires at most once per (task, threshold) as deadlines approach.
 * Done tasks never notify — that is the point of marking them.
 */
async function evaluateNotifications (tasksAll) {
  if (!settingsDoc.notifications) return

  const isMob = await api.isMobile()
  if (isMob) {
    const thresholds = Array.isArray(settingsDoc.notifyThresholdsHours)
      ? settingsDoc.notifyThresholdsHours
      : [24, 6, 1]
    const plans = planSchedules(tasksAll, thresholds, Date.now(), Object.fromEntries(notified))
    for (const p of plans) {
      const already = notified.get(p.taskId) ?? []
      notified.set(p.taskId, [...already, p.thresholdHours])
      if (p.kind === 'instant') {
        api.notify(p.title, p.body)
      } else if (p.kind === 'scheduled') {
        await api.scheduleNotification({ id: p.id, title: p.title, body: p.body, at: p.atMs })
      }
    }
    if (plans.length > 0) schedulePersist()
    return
  }

  const now = Date.now()
  const crossed = []

  for (const task of tasksAll) {
    if (done.isDone(task.id)) continue
    const remaining = task.dueMs - now
    if (remaining < 0 || remaining > notifyThresholdsMs[0]) continue

    const already = notified.get(task.id) ?? []
    const threshold = notifyThresholdsMs.filter((t) => remaining <= t).sort((a, b) => a - b)[0]
    if (threshold === undefined || already.includes(threshold)) continue

    notified.set(task.id, [...already, threshold])
    crossed.push({ task, remaining })
  }

  if (crossed.length === 0) return
  schedulePersist()

  if (crossed.length > 2) {
    const soonest = [...crossed].sort((a, b) => a.remaining - b.remaining)[0]
    api.notify(`${crossed.length} deadlines approaching`, `Soonest: ${soonest.task.title} — ${formatRelative(soonest.remaining)}`)
    return
  }

  for (const { task, remaining } of crossed) {
    const course = task.course ? `${task.course} · ` : ''
    api.notify(task.title, `${course}${formatRelative(remaining)}`)
  }
}

function formatRelative (deltaMs) {
  const overdue = deltaMs < 0
  const abs = Math.abs(deltaMs)
  const minutes = Math.floor(abs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  let text
  if (minutes < 1) text = 'due now'
  else if (minutes < 60) text = `${minutes}m`
  else if (hours < 24) text = `${hours}h ${minutes % 60}m`
  else text = `${days}d ${hours % 24}h`

  if (text === 'due now') return 'due now'
  return overdue ? `${text} overdue` : `in ${text}`
}

// --------------------------------------------------------------------- render

function signatureOf (tasks) {
  return tasks.map((t) => `${t.id}:${t.dueMs}`).join('|')
}

function svg (paths, viewBox = '0 0 16 16') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  node.setAttribute('viewBox', viewBox)
  node.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    node.appendChild(path)
  }
  return node
}

const CHECK_ICON = ['M3.5 8.5 6.5 11.5 12.5 5']
const RESTORE_ICON = ['M13.5 8.5 6.5 5.5 2.5 8.5']

/** Opt5 urgency: overdue | soon (<24h) | later. Neutral items stay uncolored. */
function urgencyOf (task, now) {
  const delta = task.dueMs - now
  if (delta < 0) return 'overdue'
  if (delta <= SOON_MS) return 'soon'
  return 'later'
}

/** Feed label for the name slot (mockup hero-name / row name). */
function feedLabelFor (task) {
  if (task.source === 'local') return 'Event manual'
  const metas = Array.isArray(settingsDoc.feeds) ? settingsDoc.feeds : []
  const meta = metas.find((m) => m && m.id === task.feedId)
  if (meta && meta.label) return meta.label
  if (task.feedId === 'brone' || !task.feedId) return 'BRONE'
  return String(task.feedId).toUpperCase()
}

/** Code slot: course code when present, else feed/source tag. */
function codeFor (task) {
  if (task.source === 'local') return 'LOCAL'
  if (task.course) return task.course
  if (task.feedId) return String(task.feedId).toUpperCase()
  return 'BRONE'
}

const dotTimeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function dotTime (dueMs) {
  return dotTimeFmt.format(new Date(dueMs)).replace(':', '.')
}

/**
 * Timeline time text: relative when near, weekday + clock when further.
 * Always words + numbers, never color alone.
 */
function rowTime (task, now) {
  const delta = task.dueMs - now
  const abs = Math.abs(delta)
  const minutes = Math.floor(abs / MINUTE)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (delta < 0) {
    if (minutes < 60) return `Terlewat ${Math.max(minutes, 1)} mnt`
    if (hours < 24) return `Terlewat ${hours} jam`
    return `Terlewat ${days} hari`
  }
  if (minutes < 60) return `${Math.max(minutes, 1)} mnt lagi`
  if (hours < 24) return `${hours} jam lagi`
  const due = new Date(task.dueMs)
  const start = startOfDay(now)
  const dayDelta = Math.round((startOfDay(task.dueMs) - start) / DAY)
  if (dayDelta === 1) return `Besok ${dotTime(task.dueMs)}`
  if (dayDelta < 7) return `${weekdayFmt.format(due)} ${dotTime(task.dueMs)}`
  return `${days} hari lagi`
}

/**
 * Builds one timeline row. Uses textContent throughout: feed values are
 * untrusted remote content and never become markup.
 */
function taskRow (task, now, { animate, index }) {
  const urgency = urgencyOf(task, now)
  const dueDate = new Date(task.dueMs)

  const row = document.createElement('li')
  row.className = 'row'
  if (urgency === 'overdue') row.classList.add('overdue')
  else if (urgency === 'soon') row.classList.add('soon')

  if (animate) {
    row.classList.add('row--enter')
    row.style.setProperty('--stagger', `${Math.min(index, 8) * 28}ms`)
  }

  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'row-open'

  const time = document.createElement('span')
  time.className = 'time'
  time.textContent = rowTime(task, now)

  const titleWrap = document.createElement('span')
  titleWrap.className = 'row-title'

  const title = document.createElement('span')
  title.className = 't'
  title.textContent = task.title

  const meta = document.createElement('span')
  meta.className = 'c'
  const code = document.createElement('code')
  code.textContent = codeFor(task)
  const name = document.createElement('span')
  name.textContent = feedLabelFor(task)
  meta.append(code, name)

  titleWrap.append(title, meta)
  open.append(time, titleWrap)

  if (task.url) {
    open.setAttribute('aria-label', `${task.title}, buka di browser`)
    open.addEventListener('click', () => api.openExternal(task.url))
  } else {
    open.setAttribute('aria-label', task.title)
    open.disabled = true
  }

  const doneBtn = document.createElement('button')
  doneBtn.type = 'button'
  doneBtn.className = 'row-done'
  doneBtn.title = 'Tandai selesai'
  doneBtn.setAttribute('aria-label', `Tandai ${task.title} selesai`)
  const ring = document.createElement('span')
  ring.className = 'ring'
  ring.appendChild(svg(CHECK_ICON))
  doneBtn.appendChild(ring)
  doneBtn.addEventListener('click', (event) => {
    event.stopPropagation()
    markDone(task)
  })

  row.append(open, doneBtn)

  const spoken = [
    task.title,
    codeFor(task),
    `Deadline: ${fullDateFmt.format(dueDate)}`,
    rowTime(task, now)
  ]
    .filter(Boolean)
    .join(', ')
  row.setAttribute('aria-label', spoken)
  row.title = spoken

  return row
}

/** Hero shows state.tasks[0]; the timeline lists the rest. */
function renderHero (task, now) {
  if (!task || !el.hero) {
    if (el.hero) el.hero.hidden = true
    return
  }
  const urgency = urgencyOf(task, now)
  el.hero.hidden = false
  el.hero.classList.toggle('overdue', urgency === 'overdue')
  el.hero.classList.toggle('soon', urgency === 'soon')
  el.heroCode.textContent = codeFor(task)
  el.heroName.textContent = feedLabelFor(task)
  if (el.heroWarn) el.heroWarn.hidden = urgency === 'later'
  el.heroCount.textContent = rowTime(task, now)
  el.heroTitle.textContent = task.title
  el.heroDone.onclick = () => markDone(task)
  el.heroDone.setAttribute('aria-label', `Tandai ${task.title} selesai`)
}

function renderList (animate) {
  const now = Date.now()
  const [first, ...rest] = state.tasks
  renderHero(first, now)

  el.list.replaceChildren()
  let index = 0
  for (const task of rest) {
    el.list.appendChild(taskRow(task, now, { animate, index }))
    index += 1
  }

  renderDigest(now)
}

/**
 * Builds one row for a done task with a restore button.
 */
/**
 * Builds one done row with a restore button.
 */
function doneTaskRow (task, now) {
  const dueDate = new Date(task.dueMs)

  const row = document.createElement('li')
  row.className = 'drow'

  const code = document.createElement('span')
  code.className = 'd-code'
  code.textContent = codeFor(task)

  const title = document.createElement('span')
  title.className = 'd-title'
  title.textContent = task.title

  const restoreBtn = document.createElement('button')
  restoreBtn.type = 'button'
  restoreBtn.className = 'icon-btn small'
  restoreBtn.title = 'Kembalikan ke daftar tugas'
  restoreBtn.setAttribute('aria-label', `Kembalikan ${task.title} ke daftar tugas`)
  restoreBtn.appendChild(svg(RESTORE_ICON))
  restoreBtn.addEventListener('click', (event) => {
    event.stopPropagation()
    restoreTask(task)
  })

  row.append(code, title, restoreBtn)

  const spoken = [task.title, codeFor(task), `Deadline: ${fullDateFmt.format(dueDate)}`]
    .filter(Boolean)
    .join(', ')
  row.setAttribute('aria-label', spoken)
  row.title = spoken

  return row
}

function renderDoneList () {
  const tasksAll = Array.isArray(state._allTasks) ? state._allTasks : []
  const doneTasks = done.doneList(tasksAll)
  if (doneTasks.length === 0) {
    el.doneBtn.hidden = true
    el.donePanel.hidden = true
    return
  }

  el.doneBtn.hidden = false
  el.doneList.replaceChildren()

  for (const task of doneTasks) {
    el.doneList.appendChild(doneTaskRow(task, Date.now()))
  }

  // Expansion state lives in settings (showDone) so it survives restarts.
  const expanded = settingsDoc.showDone === true
  el.doneBtn.setAttribute('aria-expanded', String(expanded))
  el.donePanel.hidden = !expanded
  if (el.doneCount) el.doneCount.textContent = String(doneTasks.length)
  if (el.doneToggleLabel) el.doneToggleLabel.textContent = expanded ? 'Tutup' : 'Kembalikan'
}

async function toggleDonePanel () {
  const expanded = el.donePanel.hidden
  await api.settingsWrite({ showDone: expanded }).catch(() => {})
  settingsDoc.showDone = expanded
  renderDoneList()
  requestAnimationFrame(autosize)
}

function restoreTask (task) {
  done.unmark(task.id)
  applyVisibleTasks()
  schedulePersist()
}

/** Collapsed mode shows exactly one thing: the next undone deadline. */
function renderDigest (now) {
  el.digest.replaceChildren()
  const next = state.tasks.find((task) => task.dueMs >= now) ?? state.tasks[0]
  if (!next) {
    const note = document.createElement('span')
    note.className = 'placeholder__note'
    note.textContent = 'Nothing due'
    el.digest.appendChild(note)
    return
  }
  const wrap = document.createElement('div')
  wrap.className = 'list'
  wrap.appendChild(taskRow(next, now, { animate: false, index: 0 }))
  el.digest.appendChild(wrap)
}

// ---------------------------------------------------------------- status text

const ERROR_FIX = {
  URL_MISSING: null,
  URL_INVALID: 'The saved calendar URL is not a valid URL.',
  URL_PROTOCOL: 'The URL must start with https://',
  UNAUTHORIZED: 'Export a fresh calendar URL from BRONE and reconnect in Settings.',
  NOT_CALENDAR: 'That URL returned a web page, not a calendar. Use the "Get calendar URL" link.',
  TIMEOUT: 'The server did not answer in time. It may be busy.',
  NETWORK: 'Check your internet connection.',
  HTTP_ERROR: 'The server rejected the request. It may be down for maintenance.',
  TOO_LARGE: 'The feed is unexpectedly large.',
  ICS_PARSE_FAILED: 'The feed downloaded but could not be read.'
}

const STATUS_TEXT = {
  loading: 'Memuat',
  refreshing: 'Refresh',
  ready: 'Sync',
  stale: 'Offline',
  error: 'Error',
  unconfigured: 'Belum hubung',
  idle: 'Idle'
}

function relativeSync (iso) {
  if (!iso) return null
  const delta = Date.now() - Date.parse(iso)
  if (!Number.isFinite(delta)) return null
  if (delta < 90 * 1000) return 'baru saja'
  if (delta < HOUR) return `${Math.round(delta / MINUTE)} mnt`
  if (delta < DAY) return `${Math.round(delta / HOUR)} jam`
  return `${Math.round(delta / DAY)} hari`
}

function renderStatus () {
  const meta = state.meta ?? {}
  const count = state.tasks.length
  const status = meta.status ?? 'idle'

  busy = status === 'loading' || status === 'refreshing'
  el.panel.dataset.busy = String(busy)
  el.panel.dataset.state = status

  if (el.taskCount) el.taskCount.textContent = count === 1 ? '1 tugas' : `${count} tugas`

  let text
  if (!meta.configured) {
    text = STATUS_TEXT.unconfigured
  } else if (busy && count === 0) {
    text = STATUS_TEXT[status]
  } else {
    const synced = relativeSync(meta.lastFetchedAt)
    text = synced ? `sync ${synced}` : STATUS_TEXT[status]
  }
  el.status.textContent = text

  const failedWithData = Boolean(meta.error) && count > 0
  el.stale.hidden = !failedWithData
  if (failedWithData) {
    const fix = ERROR_FIX[meta.error.code]
    const message = typeof meta.error.message === 'string' ? meta.error.message.trim() : ''
    el.staleText.textContent = fix || message || "Couldn't refresh. Showing the last synced copy."
  }
}

function showPlaceholder (which) {
  for (const [key, node] of Object.entries(el.placeholders)) {
    node.hidden = key !== which
  }
  const showingList = which === null
  el.list.hidden = !showingList
  if (el.hero && !showingList) el.hero.hidden = true
  el.doneBtn.hidden = !showingList || done.doneList(state._allTasks ?? []).length === 0
}

function renderError () {
  const meta = state.meta ?? {}
  const error = meta.parseError ?? meta.error ?? {}
  el.errorTitle.textContent =
    error.code === 'NOT_CALENDAR' ? 'Itu bukan feed kalender' : 'Feed tidak terjangkau'
  const message = typeof error.message === 'string' ? error.message.trim() : ''
  el.errorNote.textContent = message || 'Feed kalender tidak bisa dimuat. Coba lagi saat koneksi pulih.'
  const fix = ERROR_FIX[error.code]
  el.errorFix.textContent = fix ?? ''
  el.errorFix.hidden = !fix
}

// ----------------------------------------------------------------- autosizing

function desiredHeight () {
  const bar = document.getElementById('bar').offsetHeight
  const stale = el.stale.hidden ? 0 : el.stale.offsetHeight
  const undo = el.undoBar.hidden ? 0 : el.undoBar.offsetHeight
  const collapsed = el.panel.dataset.collapsed === 'true'
  const content = collapsed ? el.digest.offsetHeight : el.body.scrollHeight
  return bar + content + stale + undo + 24
}

let lastSent = 0
function autosize () {
  const height = desiredHeight()
  if (height <= 24 || Math.abs(height - lastSent) < 2) return
  lastSent = height
  api.autosize(height)
}

const observer = new ResizeObserver(() => autosize())
observer.observe(el.list)
observer.observe(el.digest)
if (el.hero) observer.observe(el.hero)
for (const node of Object.values(el.placeholders)) observer.observe(node)

// ------------------------------------------------------------ mark-done flow

function markDone (task) {
  done.mark(task.id, new Date().toISOString())
  applyVisibleTasks()

  el.undoText.textContent = `"${task.title}" ditandai selesai`
  el.undoBar.hidden = false
  clearTimeout(undoTimer)
  undoTimer = setTimeout(() => { el.undoBar.hidden = true }, 6000)
  requestAnimationFrame(autosize)
  schedulePersist()
}

function undoLastMark () {
  done.undo()
  el.undoBar.hidden = true
  clearTimeout(undoTimer)
  applyVisibleTasks()
  schedulePersist()
}

// --------------------------------------------------------------- state update

/**
 * Placeholder decision (v1 apply() parity): exactly one of setup / error /
 * loading / empty is shown, or none when the task list is on screen.
 */
function renderPlaceholders () {
  const meta = state.meta ?? {}
  const count = state.tasks.length
  const tasksAll = Array.isArray(state._allTasks) ? state._allTasks : []
  const doneCount = done.doneList(tasksAll).length

  if (!meta.configured) {
    showPlaceholder('setup')
  } else if (count > 0 || doneCount > 0) {
    // Done tasks still render (the Selesai section), so the list stays up
    // even when every task in the feed is marked done.
    showPlaceholder(null)
  } else if (meta.parseError || (meta.error && !meta.hasData)) {
    showPlaceholder('error')
    renderError()
  } else if (meta.status === 'loading' && !meta.hasData) {
    showPlaceholder('loading')
  } else {
    showPlaceholder('empty')
  }
}

/** Recompute the visible list from the full parsed set + done map. */
function applyVisibleTasks ({ animate = false } = {}) {
  const tasksAll = Array.isArray(state._allTasks) ? state._allTasks : []
  state.tasks = done.visible(tasksAll)
  renderPlaceholders()
  renderList(animate && signatureChanged())
  renderDoneList()
  renderStatus()
  updateTrayTooltip()
  syncHomeScreenWidget()
  requestAnimationFrame(autosize)
}

function syncHomeScreenWidget () {
  try {
    const tasks = (state.tasks || []).slice(0, 10).map((t) => ({
      id: t.id,
      title: t.title,
      course: t.course || (t.source === 'local' ? 'LOCAL' : 'BRONE'),
      dueMs: t.dueMs
    }))
    api.syncWidgetData(tasks).catch(() => {})
  } catch (e) {
    console.warn('[widget] sync failed', e)
  }
}

function signatureChanged () {
  const signature = signatureOf(state.tasks)
  const changed = signature !== lastSignature
  lastSignature = signature
  return changed
}

function updateTrayTooltip () {
  const now = Date.now()
  const next = state.tasks.find((t) => t.dueMs >= now)
  if (!next) {
    api.trayTooltip(state.meta.configured ? 'Reminder Widget — nothing upcoming' : 'Reminder Widget — not configured')
    return
  }
  const delta = next.dueMs - now
  api.trayTooltip(`Reminder Widget — next: ${next.title} (${formatRelative(delta)})`)
}

async function refreshNow () {
  if (fetchers.length === 0 || busy) return
  busy = true
  el.panel.dataset.busy = 'true'
  try {
    await Promise.all(fetchers.map((one) => one.refresh({ force: true }).catch(() => {})))
  } finally {
    busy = false
  }
}

/** Aggregate per-feed states into one widget status. One failing feed never
 *  hides healthy feeds: the error screen shows only when no feed has data. */
function aggregateFeedStatus (seq) {
  if (seq !== startSeq) return
  let anyData = false
  let lastFetchedAt = null
  for (const one of fetchers) {
    try {
      const st = one.getState()
      if (st.hasData) anyData = true
      if (st.lastFetchedAt && (!lastFetchedAt || st.lastFetchedAt > lastFetchedAt)) {
        lastFetchedAt = st.lastFetchedAt
      }
    } catch { /* ignore dead fetcher */ }
  }
  if (lastFetchedAt) state.meta = { ...state.meta, lastFetchedAt }
  const firstError = [...feedErrors.values()][0]
  if (anyData) {
    state.meta = { ...state.meta, configured: true, status: 'ready', feedCount: fetchers.length }
    if (firstError) {
      state.meta.partialError = { code: firstError.code, message: firstError.message }
    } else {
      delete state.meta.partialError
    }
  } else if (fetchers.length > 0 && feedErrors.size >= fetchers.length && firstError) {
    state.meta = {
      ...state.meta,
      configured: true,
      status: 'error',
      error: { code: firstError.code, message: firstError.message }
    }
  } else {
    state.meta = {
      ...state.meta,
      configured: fetchers.length > 0,
      status: fetchers.length > 0 ? 'loading' : 'unconfigured'
    }
  }
  renderPlaceholders()
  renderStatus()
  updateTrayTooltip()
  requestAnimationFrame(autosize)
}

/** Re-merge all feeds + local events after one feed delivered an update. */
function afterFeedUpdate (seq) {
  if (seq !== startSeq) return
  state._feedTasks = mergeFeedTasks([...feedTasksById.values()])
  state._allTasks = withLocalTasks(state._feedTasks, localEvents, Date.now())
  // Retire done-entries for events feeds removed long ago. The post-parse
  // steps are UI-side concerns: a bug here must never surface as a feed
  // error (fetchCalendar's catch would mark the feed stale).
  done.prune(state._allTasks, DEFAULT_KEEP_OVERDUE_MS, Date.now())
  try {
    evaluateNotifications(state._allTasks)
  } catch (error) {
    console.error('[notify]', error)
  }
  applyVisibleTasks({ animate: true })
  schedulePersist()
  aggregateFeedStatus(seq)
  void maybeRunSubmissionCheck()
}

async function startFeed () {
  // Serialize: a superseded run's handlers must not apply stale state after a
  // newer startFeed has built fresh fetchers (double-emit guard).
  const seq = ++startSeq
  for (const one of fetchers) one.stop()
  fetchers = []
  feedTasksById = new Map()
  feedErrors = new Map()

  let feeds = await api.feedsGetFull().catch(() => [])
  if (seq !== startSeq) return
  if (!Array.isArray(feeds) || feeds.length === 0) {
    // Legacy fallback: a BRONE secret with no metadata row yet.
    const legacy = await api.feedUrlGetFull().catch(() => null)
    if (seq !== startSeq) return
    feeds = legacy ? [{ id: 'brone', kind: 'brone', label: 'BRONE', enabled: true, url: legacy }] : []
  }
  if (seq !== startSeq) return

  currentRefreshMinutes = Number(settingsDoc.refreshMinutes) || 20
  state.meta = {
    ...(state.meta ?? {}),
    configured: feeds.length > 0,
    status: feeds.length > 0 ? 'loading' : 'unconfigured',
    feedCount: feeds.length
  }
  state.tasks = []
  state._feedTasks = []
  state._allTasks = withLocalTasks([], localEvents, Date.now())
  lastSignature = ''
  if (feeds.length === 0) {
    applyVisibleTasks()
    return
  }

  for (const feed of feeds) {
    const one = new CalendarFetcher({
      url: feed.url,
      cacheKey: `feed-cache:${feed.id}`,
      refreshMs: currentRefreshMinutes * MINUTE,
      handlers: {
        onUpdate: ({ ics }) => {
          if (seq !== startSeq) return
          let tasks = []
          try {
            tasks = parseTasks(ics)
            feedErrors.delete(feed.id)
            delete state.meta.parseError
          } catch (error) {
            state.meta.parseError = { code: error.code ?? 'PARSE_FAILED', message: error.message }
          }
          feedTasksById.set(feed.id, { feed, tasks })
          afterFeedUpdate(seq)
        },
        onStatus: () => aggregateFeedStatus(seq),
        onError: (error) => {
          if (seq !== startSeq) return
          feedErrors.set(feed.id, { code: error?.code, message: error?.message })
          aggregateFeedStatus(seq)
        }
      }
    })
    fetchers.push(one)
  }

  await Promise.all(fetchers.map((one) => one.start().catch(() => {})))
}

// -------------------------------------------------- submission auto-detect

/**
 * Opt-in: ask the hidden checker webview to peek at undone future tasks'
 * BRONE pages. The queue module rate-limits (per task interval + batch cap);
 * results arrive as 'submission-checked' events below.
 */
async function maybeRunSubmissionCheck () {
  if (!settingsDoc.autoDetect || checkInFlight) return
  const now = Date.now()
  const candidates = (state._allTasks ?? [])
    .filter((t) => t.url && !done.isDone(t.id) && t.dueMs > now)
    .map((t) => ({ id: t.id, url: t.url, dueMs: t.dueMs }))

  const picks = selectForCheck({
    candidates,
    lastChecked: Object.fromEntries(lastChecked),
    now,
    intervalMs: 6 * HOUR,
    maxPerCycle: 8
  })
  if (picks.length === 0) return

  checkInFlight = true
  try {
    await api.submissionCheck(picks.map((p) => p.url))
  } catch { /* checker busy or failed; the next feed update retries */ } finally {
    checkInFlight = false
  }
}

api.listen('submission-checked', (result) => {
  if (!result || typeof result.url !== 'string') return
  const matches = (state._allTasks ?? []).filter((t) => t.url === result.url)
  if (matches.length === 0) return

  // Only definitive verdicts count toward the rate limit; "unknown" retries
  // on the next feed update (bounded by the batch cap).
  if (result.status === 'yes' || result.status === 'no' || result.status === 'login') {
    for (const t of matches) lastChecked.set(t.id, Date.now())
  }
  if (result.status === 'yes') {
    // Same assignment page = same submission state: mark every task sharing it.
    let changed = false
    for (const t of matches) {
      if (!done.isDone(t.id)) {
        done.mark(t.id, new Date().toISOString())
        changed = true
      }
    }
    if (changed) {
      applyVisibleTasks({ animate: true })
      schedulePersist()
    }
  }
})

// --------------------------------------------------------------- opacity

function applyOpacity () {
  const o = Number(settingsDoc.opacity)
  document.body.style.opacity = Number.isFinite(o) ? String(Math.min(1, Math.max(0.35, o))) : '1'
}

/** Opt5 theme trio. "auto" follows the OS color scheme live. */
function resolveTheme () {
  if (settingsDoc.theme === 'light') return 'light'
  if (settingsDoc.theme === 'dark') return 'dark'
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** Opt5 theme pair. The native Android widget always stays dark. */
function applyTheme () {
  document.documentElement.dataset.theme = resolveTheme()
}

try {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if ((settingsDoc.theme ?? 'auto') === 'auto') applyTheme()
  })
} catch { /* older webviews: manual theme only */ }

// ------------------------------------------------------------------ rendering

function applyCollapsed (collapsed) {
  el.panel.dataset.collapsed = String(collapsed)
  el.btnCollapse.setAttribute('aria-expanded', String(!collapsed))
  el.btnCollapse.title = collapsed ? 'Expand' : 'Collapse'
  el.btnCollapse.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse')
}

function tick () {
  if (state.tasks.length > 0 && el.list.hidden === false) {
    renderList(false)
  }
  renderStatus()
}

// -------------------------------------------------------------------- wiring

el.btnUndo?.addEventListener('click', undoLastMark)

document.getElementById('btn-refresh')?.addEventListener('click', refreshNow)
document.getElementById('btn-retry-error')?.addEventListener('click', refreshNow)
document.getElementById('btn-retry-stale')?.addEventListener('click', refreshNow)
document.getElementById('btn-hide')?.addEventListener('click', () => api.hide())

// Quick-login from the setup panel: surface the outcome in the status line so
// a failed assisted login is never silent.
document.getElementById('btn-quick-login')?.addEventListener('click', async () => {
  const result = await api.loginBrone().catch((error) => ({ ok: false, message: String(error) }))
  if (!result?.ok && el.status) {
    el.status.textContent = result?.canceled
      ? 'Login ditutup'
      : `Login gagal: ${result?.message ?? 'coba lagi'}`
  }
})

for (const id of ['btn-open-settings', 'btn-open-settings-2']) {
  document.getElementById(id)?.addEventListener('click', () => api.openSettings())
}

document.getElementById('btn-collapse').addEventListener('click', async () => {
  const collapsed = el.panel.dataset.collapsed !== 'true'
  applyCollapsed(collapsed)
  requestAnimationFrame(autosize)
  settingsDoc.collapsed = collapsed
  await api.settingsWrite({ collapsed })
  await api.settingsChanged()
})

el.doneBtn?.addEventListener('click', toggleDonePanel)
el.btnSettings?.addEventListener('click', () => api.openSettings())

document.addEventListener('contextmenu', (event) => event.preventDefault())

// Esc hides to tray (README parity). The widget takes focus when clicked,
// so key events do reach it — unlike v1's always-unfocused window.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') api.hide()
})

api.listen('tray-command', async (command) => {
  if (command === 'refresh') await refreshNow()
})

api.listen('settings-changed', async () => {
  const doc = await api.settingsRead().catch(() => ({}))
  settingsDoc = { ...settingsDoc, ...doc }
  localEvents = Array.isArray(doc.localEvents) ? doc.localEvents : []
  notified = toMap(doc.notified)
  lastChecked = toNumberMap(doc.lastChecked)
  notifyThresholdsMs = thresholdsToMs(settingsDoc.notifyThresholdsHours)
  applyCollapsed(Boolean(settingsDoc.collapsed))
  applyOpacity()
  applyTheme()
  state._allTasks = withLocalTasks(Array.isArray(state._feedTasks) ? state._feedTasks : [], localEvents, Date.now())
  applyVisibleTasks()
  renderLocalList()

  // A changed refresh interval needs a fetcher rebuild.
  const newRefresh = Number(settingsDoc.refreshMinutes) || 20
  if (newRefresh !== currentRefreshMinutes) await startFeed()

  // Turning auto-detect on should produce a first batch immediately, not wait
  // a full refresh cycle.
  void maybeRunSubmissionCheck()
})

api.listen('feed-changed', () => startFeed())

// Safety net for missed saves: every time the widget is revealed, re-check
// the configured URL if we still think there is none.
api.listen('widget-shown', () => {
  if (!state.meta.configured) startFeed()
})

// ---------------------------------------------------- local (manual) events

function localPanelOpen (open) {
  if (!el.localPanel) return
  el.localPanel.hidden = !open
  const scrim = document.getElementById('local-scrim')
  if (scrim) scrim.hidden = !open
  el.btnAddLocal?.setAttribute('aria-expanded', String(open))
  if (open) el.localTitle?.focus()
  requestAnimationFrame(autosize)
}

function renderLocalList () {
  if (!el.localList) return
  el.localList.replaceChildren()
  for (const ev of localEvents) {
    const li = document.createElement('li')
    li.className = 'local-item'

    const label = document.createElement('span')
    label.className = 'local-item__label'
    label.textContent = `${ev.title} · ${fullDateFmt.format(new Date(ev.dueMs))}`

    const rm = document.createElement('button')
    rm.type = 'button'
    rm.className = 'local-item__remove'
    rm.setAttribute('aria-label', `Hapus event ${ev.title}`)
    rm.textContent = 'Hapus'
    rm.addEventListener('click', () => removeLocalEvent(ev.id))

    li.append(label, rm)
    el.localList.appendChild(li)
  }
  requestAnimationFrame(autosize)
}

/** Re-merge feed + local events after a local add/remove, then re-render. */
function refreshLocalMerge () {
  state._allTasks = withLocalTasks(
    Array.isArray(state._feedTasks) ? state._feedTasks : [],
    localEvents,
    Date.now()
  )
  try {
    evaluateNotifications(state._allTasks)
  } catch (error) {
    console.error('[notify]', error)
  }
  applyVisibleTasks()
  renderLocalList()
  schedulePersist()
}

async function addLocalEvent () {
  const result = normalizeLocalEvent({
    title: el.localTitle?.value ?? '',
    date: el.localDate?.value ?? '',
    time: el.localTime?.value ?? ''
  }, Date.now())
  if (!result.ok) {
    if (el.localNote) el.localNote.textContent = result.error
    requestAnimationFrame(autosize)
    return
  }
  if (el.localNote) el.localNote.textContent = ''
  localEvents = [...localEvents, result.event]
  if (el.localTitle) el.localTitle.value = ''
  if (el.localDate) el.localDate.value = ''
  if (el.localTime) el.localTime.value = ''
  await api.settingsWrite({ localEvents }).catch(() => {})
  refreshLocalMerge()
}

async function removeLocalEvent (id) {
  localEvents = localEvents.filter((ev) => ev.id !== id)
  await api.settingsWrite({ localEvents }).catch(() => {})
  refreshLocalMerge()
}

el.btnAddLocal?.addEventListener('click', () => localPanelOpen(el.localPanel.hidden))
document.getElementById('local-scrim')?.addEventListener('click', () => localPanelOpen(false))
el.localCancel?.addEventListener('click', () => localPanelOpen(false))
el.localSave?.addEventListener('click', addLocalEvent)

// ---------------------------------------------------------------------- boot

;(async () => {
  const isMob = await api.isMobile()
  if (isMob) {
    if (el.btnHide) el.btnHide.hidden = true
    try {
      if (window.__TAURI__?.notification?.isPermissionGranted) {
        const granted = await window.__TAURI__.notification.isPermissionGranted()
        if (!granted && window.__TAURI__.notification.requestPermission) {
          await window.__TAURI__.notification.requestPermission()
        }
      }
    } catch (e) {
      console.warn('[notification] permission check failed', e)
    }
  }

  const doc = await api.settingsRead().catch(() => ({}))
  settingsDoc = { ...doc }
  localEvents = Array.isArray(doc.localEvents) ? doc.localEvents : []
  notified = toMap(doc.notified)
  lastChecked = toNumberMap(doc.lastChecked)
  notifyThresholdsMs = thresholdsToMs(settingsDoc.notifyThresholdsHours)
  done = createDoneStore(doc.done ?? {})
  applyCollapsed(Boolean(settingsDoc.collapsed))
  applyOpacity()
  applyTheme()

  await startFeed()
  setInterval(tick, TICK_MS)
  void maybeRunSubmissionCheck()
})()
