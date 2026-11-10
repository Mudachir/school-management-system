import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chromePath, deferred, pause, startBrowser } from '../test-support/browser.js'
import { EXPIRY_RECHECK_DELAYS } from '../helpers/countdown.js'

const studentA = '00123456789012345'
const studentB = '00123456789012346'
const classA = { id: '11111111-1111-4111-8111-111111111111', name: 'KG - Morning Shift', totalSeats: 24, heldSeats: 1, confirmedSeats: 0, availableSeats: 23 }
const classB = { ...classA, id: '33333333-3333-4333-8333-333333333333', name: 'Class 6 - Day Shift' }
const holdId = '22222222-2222-4222-8222-222222222222'
const otherHoldId = '44444444-4444-4444-8444-444444444444'
const holdRoute = '/parent/holds/' + holdId
const confirmButton = '[...document.querySelectorAll("button")].find(e => e.textContent === "Confirm Admission")'
const holdButton = '[...document.querySelectorAll("button")].find(e => e.textContent === "Hold My Seat")'
const quickSkew = [
  'const realNow = Date.now; Date.now = () => realNow() + 60000;',
  'const realTimeout = window.setTimeout;',
  'window.setTimeout = (fn, delay, ...args) => realTimeout(fn, ' + JSON.stringify(EXPIRY_RECHECK_DELAYS.slice(1)) + '.includes(delay) ? 25 : delay, ...args);',
].join('\n')

function fixture() {
  const state = {
    status: 'HELD', applicationClass: classA, empty: false, failDetails: false,
    detailReads: 0, activeReads: 0, maxReads: 0, expireAfterReads: Infinity,
    confirmPosts: 0, createPosts: 0, pausedRead: null, pauseAfterCreate: false,
    expiresAt: new Date(Date.now() + 30000).toISOString(),
  }
  function application() {
    return { holdId, classId: state.applicationClass.id, className: state.applicationClass.name, status: state.status, expiresAt: state.expiresAt }
  }
  return {
    state,
    async request(request) {
      const path = new URL(request.url).pathname.replace('/api', '')
      const student = Object.entries(request.headers).find(([key]) => key.toLowerCase() === 'x-student-id')?.[1]
      if (path === '/classes') return { body: [classA, classB] }
      if (path === '/classes/' + classA.id) return { body: classA }
      if (path === '/classes/' + classB.id) return { body: classB }
      if (path === '/me/holds') {
        if (student === studentA && state.readGate) {
          const gate = state.readGate; state.readGate = null; state.pausedRead = gate
          await gate.promise
        }
        return { body: student === studentA && !state.empty ? [application(), ...(state.extraApplication ? [state.extraApplication] : [])] : [] }
      }
      if (path === '/holds/' + otherHoldId && request.method === 'GET') {
        const result = { ...state.extraApplication }
        state.detailGate = deferred()
        await state.detailGate.promise
        return { body: result }
      }
      if (path === '/holds/' + holdId && request.method === 'GET') {
        state.detailReads++; state.activeReads++; state.maxReads = Math.max(state.maxReads, state.activeReads)
        await pause(40)
        state.activeReads--
        if (state.failDetails) return { status: 503, body: { title: 'Status unavailable' } }
        if (state.detailReads >= state.expireAfterReads) state.status = 'EXPIRED'
        return { body: application() }
      }
      if (path === '/holds/' + holdId + '/confirm') {
        state.confirmPosts++
        if (state.confirmError) {
          state.status = 'EXPIRED'
          return { status: 409, body: { title: 'Only an unexpired hold can be confirmed.' } }
        }
        state.status = 'CONFIRMED'
        return { body: { holdId, status: state.status } }
      }
      if (path === '/holds/' + holdId && request.method === 'DELETE') {
        state.status = 'EXPIRED'
        return { status: 409, body: { title: 'Expired holds cannot be cancelled.' } }
      }
      if (path.endsWith('/holds') && request.method === 'POST') {
        state.createPosts++; state.empty = false
        state.applicationClass = path.includes(classB.id) ? classB : classA
        if (state.pauseAfterCreate) state.readGate = deferred()
        return { status: 201, body: { ...application(), studentId: student } }
      }
      // Browser regressions are completely isolated from the live backend.
      throw new Error('Unexpected fixture request: ' + request.method + ' ' + path)
    },
  }
}

describe('Parent Portal lifecycle browser regressions', { skip: !chromePath, concurrency: false }, () => {
  let browser
  before(async () => { browser = await startBrowser() }, { timeout: 30000 })
  after(async () => { await browser?.close() }, { timeout: 15000 })

  async function withPage(run, preload = '') {
    const api = fixture()
    const page = await browser.page(api.request, preload)
    try {
      await page.selectStudent(studentA)
      await run(page, api.state)
      assert.deepEqual(page.errors, [])
    } finally {
      api.state.pausedRead?.resolve()
      api.state.readGate?.resolve()
      api.state.detailGate?.resolve()
      await page.close()
    }
  }

  test('fresh cancellation invalidates HELD and removes confirmation without posting', async () => {
    await withPage(async (page, state) => {
      await page.goto(holdRoute + '/review')
      await page.waitFor(confirmButton + ' && !(' + confirmButton + ').disabled')
      const reads = state.detailReads
      state.status = 'CANCELLED'
      await page.evaluate('(' + confirmButton + ').click()')
      await page.waitFor('document.querySelector(".parent-status-cancelled")')
      assert.equal(await page.evaluate('Boolean(' + confirmButton + ')'), false)
      await page.waitFor('document.querySelector("time")')
      assert.ok(state.detailReads > reads, 'rejected confirmation must refetch hold details')
      assert.equal(state.confirmPosts, 0)
    })
  })

  test('a backend 409 reconciles EXPIRED and failed reconciliation stays closed until retry', async () => {
    await withPage(async (page, state) => {
      await page.goto(holdRoute + '/review')
      await page.waitFor(confirmButton + ' && !(' + confirmButton + ').disabled')
      state.confirmError = true; state.failDetails = true
      await page.evaluate('(' + confirmButton + ').click()')
      await page.waitFor('document.body.innerText.includes("Unable to load reservation")')
      assert.equal(await page.evaluate('Boolean(' + confirmButton + ') || Boolean(document.querySelector(".parent-status-held"))'), false)
      assert.equal(state.confirmPosts, 1)
      state.failDetails = false
      await page.evaluate('document.querySelector(".dashboard-state button").click()')
      await page.waitFor('document.querySelector(".parent-status-expired")')
      assert.equal(await page.evaluate('Boolean(' + confirmButton + ')'), false)
    })
  })

  test('rejected cancellation refreshes authoritative application history', async () => {
    await withPage(async (page) => {
      await page.goto('/parent/applications')
      await page.waitFor('document.querySelector("button[aria-label^=\'Cancel application for\']")')
      await page.evaluate('document.querySelector("button[aria-label^=\'Cancel application for\']").click()')
      await page.waitFor('document.querySelector("dialog[open]")')
      await page.evaluate('[...document.querySelectorAll("dialog button")].find(e => e.textContent === "Cancel application").click()')
      await page.waitFor('document.querySelector(".parent-status-expired") && document.querySelector("dialog .parent-form-error")')
      assert.equal(await page.evaluate('Boolean(document.querySelector(".parent-status-held"))'), false)
    })
  })

  test('late details for another hold cannot overwrite a newer terminal reservation', async () => {
    await withPage(async (page, state) => {
      state.extraApplication = { holdId: otherHoldId, classId: classB.id, className: classB.name, status: 'HELD', expiresAt: state.expiresAt }
      await page.goto(holdRoute)
      await page.waitFor('document.querySelector(".parent-status-held")')
      await page.evaluate('[...document.querySelectorAll("nav a")].find(e => e.textContent === "My Applications").click()')
      await page.waitFor('document.querySelectorAll(".parent-application-card").length === 2')
      await page.evaluate('document.querySelectorAll(".parent-application-card a")[1].click()')
      for (let attempt = 0; attempt < 200 && !state.detailGate; attempt++) await pause(25)
      assert.ok(state.detailGate)
      state.status = 'CANCELLED'
      await page.evaluate('history.go(-2)')
      await page.waitFor('location.pathname === ' + JSON.stringify(holdRoute) + ' && document.querySelector(".parent-status-cancelled")')
      state.detailGate.resolve()
      await pause(150)
      assert.equal(await page.evaluate('Boolean(document.querySelector(".parent-status-held"))'), false)
      assert.equal(await page.evaluate('document.body.innerText.includes(' + JSON.stringify(otherHoldId) + ')'), false)
    })
  })

  test('clock skew and delayed server expiry are rechecked serially without changing expiresAt', async () => {
    await withPage(async (page, state) => {
      state.expireAfterReads = 3
      await page.goto(holdRoute)
      await page.waitFor('document.querySelector(".parent-status-expired")')
      assert.equal(state.detailReads, 3, 'initial read, still-HELD reconciliation, then EXPIRED')
      assert.equal(state.maxReads, 1)
      assert.equal(await page.evaluate('document.querySelector("time").dateTime'), state.expiresAt)
      const reads = state.detailReads
      await pause(200)
      assert.equal(state.detailReads, reads)
    }, quickSkew)
  })

  test('persistent HELD exhausts a finite budget; manual refresh does not restart the countdown', async () => {
    await withPage(async (page, state) => {
      await page.goto(holdRoute)
      await page.waitFor('document.body.innerText.includes("Use Refresh status to check again")')
      assert.equal(state.detailReads, 1 + EXPIRY_RECHECK_DELAYS.length)
      assert.equal(state.maxReads, 1)
      const reads = state.detailReads
      await pause(200)
      assert.equal(state.detailReads, reads)
      await page.evaluate('[...document.querySelectorAll("button")].find(e => e.textContent === "Refresh status").click()')
      await page.waitFor('document.querySelector(".parent-countdown strong")?.textContent === "00:00"')
      assert.equal(state.detailReads, reads + 1)
      assert.equal(await page.evaluate('document.querySelector("time").dateTime'), state.expiresAt)
    }, quickSkew)
  })

  test('terminal status and navigation cancel scheduled expiry checks', async () => {
    for (const status of ['CANCELLED', 'CONFIRMED', 'EXPIRED']) {
      await withPage(async (page, state) => {
        await page.goto(holdRoute)
        await page.waitFor('document.querySelector(".parent-status-held")')
        state.status = status
        await page.waitFor('document.querySelector(".parent-status-' + status.toLowerCase() + '")')
        const reads = state.detailReads
        await pause(150)
        assert.equal(state.detailReads, reads)
      }, quickSkew)
    }
    await withPage(async (page, state) => {
      await page.goto(holdRoute)
      await page.waitFor('document.querySelector(".parent-status-held")')
      await page.evaluate('[...document.querySelectorAll("nav a")].find(e => e.textContent === "Browse Classes").click()')
      await page.waitFor('document.querySelector(".parent-class-card")')
      const reads = state.detailReads
      await pause(2200)
      assert.equal(state.detailReads, reads)
    }, 'const originalNow = Date.now; Date.now = () => originalNow() + 60000;')
  })

  async function pendingAction(page, state) {
    state.empty = true; state.pauseAfterCreate = true
    await page.goto('/parent/classes')
    await page.waitFor('document.querySelector(".parent-class-card")')
    await page.evaluate('document.querySelector(".parent-class-card a").click()')
    await page.waitFor('document.querySelector(".parent-capacity")')
    await page.evaluate('document.querySelector(".back-link").click()')
    await page.waitFor('document.querySelector(".parent-class-card")')
    await page.evaluate('document.querySelectorAll(".parent-class-card a")[1].click()')
    await page.waitFor(holdButton + ' && !(' + holdButton + ').disabled')
    await page.evaluate('(' + holdButton + ').click()')
    for (let attempt = 0; attempt < 200 && !state.pausedRead; attempt++) await pause(25)
    assert.ok(state.pausedRead, 'pause the post-mutation status read before its completion callback')
  }

  test('late action completion after route reuse cannot redirect or update another class', async () => {
    await withPage(async (page, state) => {
      await pendingAction(page, state)
      // Jump over the list entry so React reuses the class details component.
      await page.evaluate('history.go(-2)')
      await page.waitFor('location.pathname === "/parent/classes/' + classA.id + '" && document.querySelector(".parent-capacity")')
      state.pausedRead.resolve()
      await page.waitFor(holdButton + ' && !(' + holdButton + ').disabled')
      await pause(150)
      assert.equal(await page.evaluate('location.pathname'), '/parent/classes/' + classA.id)
      assert.equal(await page.evaluate('Boolean(document.querySelector(".parent-form-error"))'), false)
      assert.equal(state.createPosts, 1)
    })
  })

  test('student switching discards a pending mutation completion and its old errors', async () => {
    await withPage(async (page, state) => {
      await pendingAction(page, state)
      await page.evaluate('[...document.querySelectorAll("button")].find(e => e.textContent === "Change Student").click()')
      await page.waitFor('document.querySelector("#student-number")')
      await page.fill('#student-number', studentB)
      await page.evaluate('document.querySelector("form").requestSubmit()')
      await page.waitFor('document.querySelector(".parent-class-card")')
      state.pausedRead.resolve()
      await pause(200)
      assert.equal(await page.evaluate('location.pathname'), '/parent/classes')
      await page.goto('/parent/applications')
      await page.waitFor('document.body.innerText.includes("No applications yet")')
      assert.equal(await page.evaluate('document.body.innerText.includes(' + JSON.stringify(studentA) + ')'), false)
      assert.equal(state.createPosts, 1)
    })
  })
})
