'use strict'

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { planSchedules, makeNotificationId } from '../src/schedulePlan.js'

describe('schedulePlan', () => {
  const HOUR = 60 * 60 * 1000
  const now = 1700000000000

  it('makeNotificationId produces consistent non-negative integers', () => {
    const id1 = makeNotificationId('task-123', 24)
    const id2 = makeNotificationId('task-123', 24)
    const id3 = makeNotificationId('task-123', 6)

    assert.equal(typeof id1, 'number')
    assert.ok(id1 >= 0)
    assert.equal(id1, id2)
    assert.notEqual(id1, id3)
  })

  it('schedules future notifications for tasks due beyond thresholds', () => {
    const task = {
      id: 'task-1',
      title: 'Tugas Algoritma',
      course: 'Algoritma & Struktur Data',
      dueMs: now + 48 * HOUR // Due in 48 hours
    }

    const plans = planSchedules([task], [24, 6, 1], now, {})

    assert.equal(plans.length, 3)
    // 24h threshold: should be scheduled at now + 24h
    assert.equal(plans[0].thresholdHours, 24)
    assert.equal(plans[0].kind, 'scheduled')
    assert.equal(plans[0].atMs, now + 24 * HOUR)

    // 6h threshold: scheduled at now + 42h
    assert.equal(plans[1].thresholdHours, 6)
    assert.equal(plans[1].kind, 'scheduled')
    assert.equal(plans[1].atMs, now + 42 * HOUR)

    // 1h threshold: scheduled at now + 47h
    assert.equal(plans[2].thresholdHours, 1)
    assert.equal(plans[2].kind, 'scheduled')
    assert.equal(plans[2].atMs, now + 47 * HOUR)
  })

  it('triggers instant notification when remaining time is already inside threshold', () => {
    const task = {
      id: 'task-2',
      title: 'Kuis Jaringan',
      course: 'Jarkom',
      dueMs: now + 12 * HOUR // Due in 12 hours (inside 24h window)
    }

    const plans = planSchedules([task], [24, 6, 1], now, {})

    assert.equal(plans.length, 3)
    // 24h threshold: instant because 12h <= 24h
    assert.equal(plans[0].thresholdHours, 24)
    assert.equal(plans[0].kind, 'instant')
    assert.equal(plans[0].atMs, now)

    // 6h threshold: scheduled in 6h (at now + 6h)
    assert.equal(plans[1].thresholdHours, 6)
    assert.equal(plans[1].kind, 'scheduled')
    assert.equal(plans[1].atMs, now + 6 * HOUR)

    // 1h threshold: scheduled in 11h (at now + 11h)
    assert.equal(plans[2].thresholdHours, 1)
    assert.equal(plans[2].kind, 'scheduled')
    assert.equal(plans[2].atMs, now + 11 * HOUR)
  })

  it('skips thresholds that have already been fired', () => {
    const task = {
      id: 'task-3',
      title: 'Laporan Basis Data',
      course: 'Basdat',
      dueMs: now + 10 * HOUR
    }

    // 24h already marked fired in notifiedMap
    const notifiedMap = { 'task-3': [24] }
    const plans = planSchedules([task], [24, 6, 1], now, notifiedMap)

    assert.equal(plans.length, 2)
    assert.equal(plans[0].thresholdHours, 6)
    assert.equal(plans[1].thresholdHours, 1)
  })

  it('ignores overdue tasks with negative remaining time', () => {
    const task = {
      id: 'task-overdue',
      title: 'Tugas Lama',
      dueMs: now - 2 * HOUR
    }

    const plans = planSchedules([task], [24, 6, 1], now, {})
    assert.equal(plans.length, 0)
  })
})
