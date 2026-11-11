import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chromePath, deferred, pause, startBrowser } from '../../parent/test-support/browser.js'

const classA = { id: '11111111-1111-4111-8111-111111111111', name: 'KG - Morning Shift', totalSeats: 4, heldSeats: 0, confirmedSeats: 0, availableSeats: 4 }
const classB = { ...classA, id: '33333333-3333-4333-8333-333333333333', name: 'Class 6 - Day Shift' }
// Accelerate the real polling timer only; request timeouts keep their real duration.
const quickPoll = 'const realTimeout = window.setTimeout; window.setTimeout = (fn, delay, ...args) => realTimeout(fn, delay === 5000 ? 80 : delay, ...args);'
const counts = `(() => {
  if (document.querySelector('tbody tr')) return ['.dashboard-seat-available','.dashboard-seat-held','.dashboard-seat-confirmed'].map(s => document.querySelector('tbody ' + s).textContent);
  if (document.querySelector('.class-details-stats')) return ['.class-details-available','.class-details-held','.class-details-confirmed'].map(s => document.querySelector(s + ' .dashboard-metric-value').textContent);
  if (document.querySelector('.parent-class-card')) { const text = document.querySelector('.parent-class-counts').textContent; return [document.querySelector('.parent-available').textContent.split(' ')[0], text.match(/Held ([0-9]+)/)[1], text.match(/Confirmed ([0-9]+)/)[1]]; }
  if (document.querySelector('.parent-capacity')) { const values = [...document.querySelectorAll('.parent-capacity dd')].map(e => e.textContent); return [values[3],values[1],values[2]]; }
  return null;
})()`

function fixture() {
  const state = { item: { ...classA }, reads: 0, active: 0, maximum: 0, status: 200, empty: false, detailReads: { [classA.id]: 0, [classB.id]: 0 } }
  return { state, async request(request) {
    const path = new URL(request.url).pathname.replace('/api', '')
    assert.ok(path === '/classes' || path.startsWith('/classes/'), path)
    const id = path.split('/')[2]
    state.reads++; if (id) state.detailReads[id]++
    state.active++; state.maximum = Math.max(state.maximum, state.active)
    const snapshot = id === classB.id ? { ...classB } : { ...state.item }
    const gate = state.gate; state.gate = null
    if (gate) { state.waiting = gate; await gate.promise }
    state.active--
    return { status: state.status, body: state.status !== 200 ? { title: 'Temporary outage' } : id ? snapshot : state.empty ? [] : [snapshot] }
  } }
}

describe('Automatic class capacity refresh', { skip: !chromePath, concurrency: false }, () => {
  let browser
  before(async () => { browser = await startBrowser() }, { timeout: 30000 })
  after(async () => { await browser?.close() }, { timeout: 15000 })
  async function withPage(run) {
    const api = fixture(), page = await browser.page(api.request, quickPoll)
    try { await run(page, api.state); assert.deepEqual(page.errors, []) }
    finally { api.state.waiting?.resolve(); api.state.gate?.resolve(); await page.close() }
  }
  for (const route of ['/admin', '/admin/classes', '/admin/classes/' + classA.id, '/parent/classes', '/parent/classes/' + classA.id]) {
    test(route + ' updates hold/confirm/cancel/expiry counts without replacing visible content', async () => {
      await withPage(async (page, state) => {
        await page.goto(route)
        await page.waitFor('JSON.stringify(' + counts + ') === JSON.stringify(["4","0","0"])')
        await page.evaluate('void (window.beforeRefresh = document.querySelector("tbody tr, .class-details-stats, .parent-class-card, .parent-capacity"))')
        for (const [heldSeats, confirmedSeats, availableSeats] of [[1,0,3],[0,1,3],[0,0,4],[1,0,3],[0,0,4]]) {
          state.item = { ...state.item, heldSeats, confirmedSeats, availableSeats }
          await page.waitFor('JSON.stringify(' + counts + ') === ' + JSON.stringify(JSON.stringify([availableSeats,heldSeats,confirmedSeats].map(String))))
          assert.equal(await page.evaluate('window.beforeRefresh.isConnected && !document.querySelector(".dashboard-state")'), true)
        }
        assert.equal(state.maximum, 1)
      })
    })
  }

  test('slow background reads retain data; manual refresh cannot overlap them; unmount stops polling', async () => {
    await withPage(async (page, state) => {
      await page.goto('/admin/classes'); await page.waitFor('document.querySelector("tbody tr")')
      state.gate = deferred()
      for (let i=0; i<100 && !state.waiting; i++) await pause(20)
      assert.ok(state.waiting)
      const reads = state.reads
      await page.evaluate('[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Refresh").click()')
      await pause(220)
      assert.equal(state.reads, reads)
      assert.deepEqual(await page.evaluate(counts), ['4','0','0'])
      assert.equal(await page.evaluate('Boolean(document.querySelector(".dashboard-state"))'), false)
      state.waiting.resolve(); state.waiting = null
      await page.evaluate('history.pushState(null,"","/missing-page"); dispatchEvent(new PopStateEvent("popstate"))')
      await page.waitFor('!document.querySelector("tbody tr")')
      const stopped = state.reads; await pause(250)
      assert.equal(state.reads, stopped)
      assert.equal(state.maximum, 1)
    })
  })

  test('changing class ID aborts its old polling scope and ignores its late response', async () => {
    await withPage(async (page, state) => {
      await page.goto('/admin/classes/' + classA.id); await page.waitFor('document.querySelector(".class-details-stats")')
      state.gate = deferred()
      for (let i=0; i<100 && !state.waiting; i++) await pause(20)
      assert.ok(state.waiting)
      await page.evaluate('history.pushState(null,"",' + JSON.stringify('/admin/classes/' + classB.id) + '); dispatchEvent(new PopStateEvent("popstate"))')
      await page.waitFor('document.querySelector("#class-details-heading")?.textContent === ' + JSON.stringify(classB.name))
      const oldReads = state.detailReads[classA.id]
      state.waiting.resolve(); state.waiting = null
      await pause(250)
      assert.equal(state.detailReads[classA.id], oldReads)
      assert.equal(await page.evaluate('document.querySelector("#class-details-heading").textContent'), classB.name)
      assert.ok(state.detailReads[classB.id] >= 2)
    })
  })

  test('initial error/retry and empty results survive; background errors retain data and can recover', async () => {
    await withPage(async (page, state) => {
      state.status = 503
      await page.goto('/admin/classes'); await page.waitFor('document.querySelector(".dashboard-state button")')
      state.status = 200; state.empty = true
      await page.click('.dashboard-state button'); await page.waitFor('document.body.innerText.includes("No admission classes yet")')
      state.empty = false; await page.waitFor('document.querySelector("tbody tr")')
      state.status = 503; await page.waitFor('document.querySelector(".refresh-notice")')
      assert.deepEqual(await page.evaluate(counts), ['4','0','0'])
      state.status = 200; state.item = { ...state.item, heldSeats: 1, availableSeats: 3 }
      await page.click('.refresh-notice button')
      await page.waitFor('!document.querySelector(".refresh-notice") && JSON.stringify(' + counts + ') === JSON.stringify(["3","1","0"])')
    })
  })
})
