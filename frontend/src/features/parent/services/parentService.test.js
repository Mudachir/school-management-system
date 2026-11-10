import test from 'node:test'
import assert from 'node:assert/strict'
import { getMyApplications, getHold, cancelHold, createHold, confirmHold } from './holdService.js'
import { createAdmissionHold, confirmAdmission, getOwnedHold, cancelAdmission } from './admissionService.js'
import { remainingSeconds, countdownLabel } from '../helpers/countdown.js'

const studentId = '00123456789012345'
const classId = '11111111-1111-4111-8111-111111111111'
const holdId = '22222222-2222-4222-8222-222222222222'
const otherId = '33333333-3333-4333-8333-333333333333'
const expiresAt = '2099-01-01T00:00:00Z'
const application = { holdId, classId, className: 'KG - Morning Shift', status: 'HELD', expiresAt }
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('hold creation rechecks applications, uses the active string header, no body and real 201 response', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return url.endsWith('/me/holds') ? reply([]) : reply({ ...application, studentId }, 201)
  })
  const controller = new AbortController()
  const hold = await createAdmissionHold(classId, studentId, { signal: controller.signal })
  assert.equal(hold.holdId, holdId)
  assert.deepEqual(calls.map((call) => [call.url, call.options.method]), [['/api/me/holds', 'GET'], [`/api/classes/${classId}/holds`, 'POST']])
  for (const { options } of calls) { assert.equal(options.headers['X-Student-Id'], studentId); assert.equal(options.body, undefined); assert.equal(options.signal, controller.signal) }
})

test('confirmed application prevents new holds and confirmation of another held application', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => { calls.push(url); return reply([application, { ...application, holdId: otherId, status: 'CONFIRMED', className: 'Play - Day Shift' }]) })
  await assert.rejects(createAdmissionHold(classId, studentId), /Admission already confirmed for Play - Day Shift/)
  await assert.rejects(confirmAdmission(holdId, studentId), /Admission already confirmed/)
  assert.deepEqual(calls, ['/api/me/holds', '/api/me/holds'])
})

test('HELD, EXPIRED and CANCELLED records do not impose the confirmed restriction', async (t) => {
  let current = 'HELD', posts = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/me/holds')) return reply([{ ...application, status: current }])
    posts++; return reply({ ...application, studentId }, 201)
  })
  for (const status of ['HELD', 'EXPIRED', 'CANCELLED']) { current = status; await createAdmissionHold(classId, studentId) }
  assert.equal(posts, 3)
})

test('failed or malformed latest status never sends a mutation', async (t) => {
  let response = reply({ title: 'Unavailable' }, 503), calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return response })
  await assert.rejects(createAdmissionHold(classId, studentId), /Unavailable/)
  response = reply([{ ...application, status: 'UNKNOWN' }])
  await assert.rejects(confirmAdmission(holdId, studentId), /could not be verified/)
  response = reply({})
  await assert.rejects(createAdmissionHold(classId, studentId), /could not be verified/)
  assert.equal(calls, 3)
})

test('pending verification cannot submit early, and student switch aborts before POST', async (t) => {
  const controller = new AbortController()
  let release, calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return reply({ ...application, studentId }, 201) })
  const pending = createAdmissionHold(classId, studentId, { signal: controller.signal, readApplications: () => new Promise((resolve) => { release = resolve }) })
  assert.equal(calls, 0)
  controller.abort(); release([])
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(calls, 0)
})

test('owned hold lookup verifies selected-student ownership before public details', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return url.endsWith('/me/holds') ? reply([application]) : reply(application)
  })
  assert.equal((await getOwnedHold(holdId, studentId)).className, application.className)
  assert.equal(calls[1].options.headers['X-Student-Id'], undefined)
  await assert.rejects(getOwnedHold(otherId, studentId), /not found for the selected student/)
  assert.equal(calls.length, 3)
  await assert.rejects(getOwnedHold('invalid', studentId), /valid UUID/)
  assert.equal(calls.length, 3)
})

test('confirm is guarded for held/expired/cancelled and already-confirmed is idempotent', async (t) => {
  let status = 'HELD', expiry = expiresAt, posts = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/me/holds')) return reply([{ ...application, status, expiresAt: expiry }])
    assert.equal(options.body, undefined); assert.equal(options.headers['X-Student-Id'], studentId)
    posts++; return reply({ holdId, status: 'CONFIRMED' })
  })
  assert.equal((await confirmAdmission(holdId, studentId)).status, 'CONFIRMED')
  for (const next of ['EXPIRED', 'CANCELLED']) { status = next; await assert.rejects(confirmAdmission(holdId, studentId), /Only an unexpired/ ) }
  status = 'HELD'; expiry = '2000-01-01T00:00:00Z'
  await assert.rejects(confirmAdmission(holdId, studentId), /Only an unexpired/)
  status = 'CONFIRMED'
  assert.equal((await confirmAdmission(holdId, studentId)).status, 'CONFIRMED')
  assert.equal(posts, 1)
})

test('cancellation supports HELD and CONFIRMED and consumes 204 without parsing JSON', async (t) => {
  let status = 'HELD', deletes = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/me/holds')) return reply([{ ...application, status }])
    assert.equal(options.method, 'DELETE'); assert.equal(options.body, undefined)
    deletes++; return new Response(null, { status: 204 })
  })
  for (const next of ['HELD', 'CONFIRMED', 'CANCELLED']) { status = next; await cancelAdmission(holdId, studentId) }
  status = 'EXPIRED'; await assert.rejects(cancelAdmission(holdId, studentId), /Expired/)
  assert.equal(deletes, 2)
})

test('hold API preserves 400/404/409 ProblemDetails and rejects malformed or mismatched success', async (t) => {
  let status = 409, title = 'This class has no available seats.', body
  t.mock.method(globalThis, 'fetch', async () => reply(body ?? { title }, status))
  for (const code of [400, 404, 409]) { status = code; await assert.rejects(createHold(classId, studentId), (error) => error.status === code && error.message === title) }
  status = 201; body = { ...application, studentId: '99123456789012345' }
  await assert.rejects(createHold(classId, studentId), /could not be verified/)
  status = 200; body = { ...application, holdId: otherId }
  await assert.rejects(getHold(holdId), /invalid reservation/)
  body = { holdId, status: 'HELD' }
  await assert.rejects(confirmHold(holdId, studentId), /could not be verified/)
  status = 200; await assert.rejects(cancelHold(holdId, studentId), /could not be verified/)
  await assert.rejects(getMyApplications('123'), /17-digit/)
})

test('countdown uses original expiry, rounds up, never resets on reload and handles elapsed time', () => {
  const expiry = '2026-01-01T00:10:00Z', start = Date.parse('2026-01-01T00:00:00Z')
  assert.equal(remainingSeconds(expiry, start), 600)
  assert.equal(remainingSeconds(expiry, start + 125000), 475)
  assert.equal(remainingSeconds(expiry, start + 125001), 475)
  assert.equal(remainingSeconds(expiry, start + 700000), 0)
  assert.equal(remainingSeconds('invalid', start), 0)
  assert.equal(countdownLabel(475), '07:55')
  assert.equal(countdownLabel(0), '00:00')
})
