import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chromePath, deferred, pause, startBrowser } from '../test-support/browser.js'

const studentA = '00123456789012345', studentB = '00123456789012346'
const classId = '11111111-1111-4111-8111-111111111111'
const holdId = '22222222-2222-4222-8222-222222222222'
const secondId = '44444444-4444-4444-8444-444444444444'
const seed = `sessionStorage.setItem('school-admission.active-student', '${studentA}');`
const skew = `const now = Date.now; let offset = 60000; Date.now = () => now() + offset;
const later = window.setTimeout; window.setTimeout = (fn, delay, ...args) => {
  if (delay >= 1000 && delay <= 20000 && delay !== 15000) return later(() => { offset += delay - 35; fn(...args); }, 35);
  return later(fn, delay, ...args);
};`

function fixture(options = {}) {
  const state = { reads: 0, active: 0, maximum: 0, status: 'HELD', ttl: 800, autoExpire: false, deletes: 0, ...options }
  return { state, async request(request) {
    const path = new URL(request.url).pathname.replace('/api', '')
    const student = Object.entries(request.headers).find(([key]) => key.toLowerCase() === 'x-student-id')?.[1]
    const admissionClass = { id: classId, name: 'KG - Morning Shift', totalSeats: 4, heldSeats: 1, confirmedSeats: 0, availableSeats: 3 }
    if (path === '/classes') return { body: [admissionClass] }
    if (path === '/classes/' + classId) return { body: admissionClass }
    if (path === '/holds/' + holdId && request.method === 'DELETE') { state.deletes++; state.status = 'CANCELLED'; return { status: 204 } }
    assert.equal(path, '/me/holds')
    if (student === studentB) return { body: [] }
    assert.equal(student, studentA)
    state.reads++; state.active++; state.maximum = Math.max(state.maximum, state.active)
    state.expiresAt ??= new Date(Date.now() + state.ttl).toISOString()
    if (state.autoExpire && Date.now() >= Date.parse(state.expiresAt)) state.status = 'EXPIRED'
    if (state.terminalAfter && state.reads >= state.terminalAfter) state.status = state.terminalStatus
    const row = { holdId, classId, className: 'KG - Morning Shift', status: state.status, expiresAt: state.expiresAt }
    const body = [row, ...(state.two ? [{ ...row, holdId: secondId }] : [])]
    const gate = state.reads > 1 || state.gateFirst ? state.gate : null
    if (gate) { state.gate = null; state.waiting = gate; await gate.promise }
    await pause(20)
    state.active--
    return state.fail && state.reads > 1 ? { status: 503, body: { title: 'Status unavailable' } } : { body }
  } }
}

describe('My Applications automatic expiry reconciliation', { skip: !chromePath, concurrency: false }, () => {
  let browser
  before(async () => { browser = await startBrowser() }, { timeout: 30000 })
  after(async () => { await browser?.close() }, { timeout: 15000 })
  async function withPage(options, run, clock = '') {
    const api = fixture(options), page = await browser.page(api.request, seed + clock)
    try { await page.goto('/parent/applications'); await page.waitFor('document.querySelector(".parent-status-held")'); await run(page, api.state); assert.deepEqual(page.errors, []) }
    finally { api.state.waiting?.resolve(); api.state.gate?.resolve(); await page.close() }
  }

  test('due holds share one authoritative read, retain content and remove expired cancellation actions', async () => {
    await withPage({ two: true, autoExpire: true }, async (page, state) => {
      await page.evaluate('void (window.beforeExpiry = document.querySelector(".parent-application-card"))')
      await page.waitFor('document.querySelectorAll(".parent-status-expired").length === 2')
      assert.equal(state.reads, 2, 'one initial read and one coalesced expiry read')
      assert.equal(state.maximum, 1)
      assert.equal(await page.evaluate('window.beforeExpiry.isConnected'), true)
      assert.equal(await page.evaluate('Boolean(document.querySelector(".parent-application-card button"))'), false)
      assert.equal(await page.evaluate('document.querySelector("time").dateTime'), state.expiresAt)
      await pause(150); assert.equal(state.reads, 2)
    })
  })

  test('a fast browser clock never invents EXPIRED; retries are finite and manual refresh keeps the spent budget', async () => {
    await withPage({ ttl: 30000 }, async (page, state) => {
      await page.waitFor('document.body.innerText.includes("server still reports a held application")')
      await pause(100)
      assert.equal(state.reads, 6, 'initial read plus five bounded checks')
      assert.equal(state.maximum, 1)
      assert.equal(await page.evaluate('Boolean(document.querySelector(".parent-status-expired"))'), false)
      assert.equal(await page.evaluate('document.querySelector("time").dateTime'), state.expiresAt)
      await pause(150); assert.equal(state.reads, 6)
      await page.click('.parent-options-heading button')
      await page.waitFor('document.querySelector(".parent-status-held")')
      await pause(150); assert.equal(state.reads, 7)
    }, skew)
  })

  for (const terminalStatus of ['CANCELLED', 'CONFIRMED']) {
    test('delayed server ' + terminalStatus + ' replaces HELD and stops further checks', async () => {
      await withPage({ ttl: 30000, terminalAfter: 3, terminalStatus }, async (page, state) => {
        await page.waitFor('document.querySelector(".parent-status-' + terminalStatus.toLowerCase() + '")')
        const reads = state.reads; await pause(150)
        assert.equal(state.reads, reads)
        assert.equal(state.maximum, 1)
        assert.equal(await page.evaluate('Boolean(document.querySelector(".parent-status-held"))'), false)
        assert.equal(await page.evaluate('Boolean(document.querySelector(".parent-application-card button"))'), terminalStatus === 'CONFIRMED')
      }, skew)
    })
  }

  test('route change cancels a pending expiry read and ignores its stale result after returning', async () => {
    await withPage({ ttl: 250, gate: deferred() }, async (page, state) => {
      for (let i=0; i<100 && !state.waiting; i++) await pause(20)
      assert.ok(state.waiting)
      await page.click('nav a[href="/parent/classes"]'); await page.waitFor('document.querySelector(".parent-class-card")')
      const reads = state.reads; await pause(120); assert.equal(state.reads, reads)
      state.status = 'CANCELLED'
      await page.click('nav a[href="/parent/applications"]'); await page.waitFor('document.querySelector(".parent-status-cancelled")')
      state.waiting.resolve(); state.waiting = null
      await pause(150)
      assert.equal(await page.evaluate('Boolean(document.querySelector(".parent-status-held"))'), false)
    })
  })

  test('student switch cancels expiry work and never shows the previous student response', async () => {
    await withPage({ ttl: 250, gate: deferred() }, async (page, state) => {
      for (let i=0; i<100 && !state.waiting; i++) await pause(20)
      assert.ok(state.waiting)
      await page.evaluate('[...document.querySelectorAll("button")].find(e => e.textContent === "Change Student").click()')
      await page.waitFor('document.querySelector("#student-number")')
      await page.fill('#student-number', studentB); await page.evaluate('document.querySelector("form").requestSubmit()')
      await page.waitFor('document.querySelector(".parent-class-card")')
      state.waiting.resolve(); state.waiting = null
      await page.click('nav a[href="/parent/applications"]'); await page.waitFor('document.body.innerText.includes("No applications yet")')
      const reads = state.reads; await pause(150); assert.equal(state.reads, reads)
      assert.equal(await page.evaluate('document.body.innerText.includes(' + JSON.stringify(holdId) + ') || document.body.innerText.includes(' + JSON.stringify(studentA) + ')'), false)
    })
  })

  test('leaving an unfinished initial read remains retryable rather than stuck checking identity', async () => {
    const api = fixture({ gateFirst: true, gate: deferred() })
    const page = await browser.page(api.request, seed)
    try {
      await page.goto('/parent/applications')
      for (let i=0; i<100 && !api.state.waiting; i++) await pause(20)
      assert.ok(api.state.waiting)
      await page.click('nav a[href="/parent/classes"]'); await page.waitFor('document.querySelector(".parent-class-card")')
      await page.click('.parent-class-card a'); await page.waitFor('document.querySelector(".parent-capacity")')
      await page.waitFor('[...document.querySelectorAll("button")].some(e => e.textContent === "Retry status check")')
      await page.evaluate('[...document.querySelectorAll("button")].find(e => e.textContent === "Retry status check").click()')
      await page.waitFor('[...document.querySelectorAll("button")].some(e => e.textContent === "Hold My Seat" && !e.disabled)')
      api.state.waiting.resolve(); api.state.waiting = null
      assert.deepEqual(page.errors, [])
    } finally { api.state.waiting?.resolve(); await page.close() }
  })

  test('background failure keeps the last server status, pauses retries, and recovers through Retry refresh', async () => {
    await withPage({ ttl: 30000, fail: true }, async (page, state) => {
      await page.waitFor('document.querySelector(".refresh-notice")')
      assert.equal(await page.evaluate('Boolean(document.querySelector(".parent-status-held"))'), true)
      const reads = state.reads; await pause(150); assert.equal(state.reads, reads)
      state.fail = false; state.status = 'EXPIRED'
      await page.click('.refresh-notice button'); await page.waitFor('document.querySelector(".parent-status-expired") && !document.querySelector(".refresh-notice")')
      assert.equal(state.maximum, 1)
    }, skew)
  })

  test('cancellation and a pending expiry read stay serial and finish with authoritative CANCELLED', async () => {
    await withPage({ ttl: 800, gate: deferred() }, async (page, state) => {
      await page.click('.parent-application-card button'); await page.waitFor('document.querySelector("dialog[open]")')
      for (let i=0; i<100 && !state.waiting; i++) await pause(20)
      assert.ok(state.waiting)
      await page.evaluate('[...document.querySelectorAll("dialog button")].find(e => e.textContent === "Cancel application").click()')
      await pause(80); assert.equal(state.deletes, 0)
      state.waiting.resolve(); state.waiting = null
      await page.waitFor('document.querySelector(".parent-status-cancelled") && !document.querySelector("dialog[open]")')
      assert.equal(state.deletes, 1)
      assert.equal(state.maximum, 1)
      const reads = state.reads; await pause(150); assert.equal(state.reads, reads)
    })
  })
})
