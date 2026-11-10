import assert from 'node:assert/strict'
import test from 'node:test'
import { API_BASE_URL } from '../../../api/client.js'
import { ClassApiError, createClass, getClassById, getClasses } from './classService.js'

// Test-only contract fixtures; the application never imports or falls back to them.
const classSummary = {
  id: 'c5fe7d1c-0a2d-4ad7-9cd2-dab9091dc379', name: 'Contract test class',
  totalSeats: 11, heldSeats: 2, confirmedSeats: 4, availableSeats: 5,
}
const originalFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = originalFetch })

test('GET /classes uses the central client, cancellation signal, and no student header', async () => {
  const controller = new AbortController()
  let request
  globalThis.fetch = async (...args) => {
    request = args
    return Response.json([classSummary])
  }
  assert.deepEqual(await getClasses({ signal: controller.signal }), [classSummary])
  assert.deepEqual(request, [`${API_BASE_URL}/classes`, {
    method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal,
  }])
})

test('an empty array is a successful result', async () => {
  globalThis.fetch = async () => Response.json([])
  assert.deepEqual(await getClasses(), [])
})

test('non-success HTTP responses fail without consuming their body as data', async () => {
  globalThis.fetch = async () => new Response('Service unavailable', { status: 503 })
  await assert.rejects(getClasses(), /HTTP 503/)
})

test('network errors propagate without fake fallback data', async () => {
  globalThis.fetch = async () => { throw new TypeError('Network unavailable') }
  await assert.rejects(getClasses(), /Network unavailable/)
})

test('malformed JSON is rejected', async () => {
  globalThis.fetch = async () => new Response('<html>Unexpected proxy response</html>')
  await assert.rejects(getClasses(), SyntaxError)
})

test('invalid shapes and missing, negative, fractional or string seat counts are rejected', async () => {
  const invalidPayloads = [
    {}, null, [null], [{ ...classSummary, id: '' }], [{ ...classSummary, name: null }],
    [{ ...classSummary, availableSeats: undefined }], [{ ...classSummary, heldSeats: -1 }],
    [{ ...classSummary, confirmedSeats: '4' }], [{ ...classSummary, totalSeats: 1.5 }],
  ]
  for (const payload of invalidPayloads) {
    globalThis.fetch = async () => Response.json(payload)
    await assert.rejects(getClasses(), /invalid class data/)
  }
})

test('abort is forwarded and rejects the request', async () => {
  const controller = new AbortController()
  globalThis.fetch = async (_url, { signal }) => {
    assert.equal(signal, controller.signal)
    throw new DOMException('Request aborted', 'AbortError')
  }
  controller.abort()
  await assert.rejects(getClasses({ signal: controller.signal }), { name: 'AbortError' })
})

test('details request uses the selected UUID and rejects mismatched responses', async () => {
  let requested
  globalThis.fetch = async (url) => { requested = url; return Response.json(classSummary) }
  assert.deepEqual(await getClassById(classSummary.id), classSummary)
  assert.equal(requested, `${API_BASE_URL}/classes/${classSummary.id}`)
  globalThis.fetch = async () => Response.json({ ...classSummary, id: 'another-id' })
  await assert.rejects(getClassById(classSummary.id), /invalid class details/)
})

test('invalid UUIDs do not send requests and 404 remains distinguishable', async () => {
  globalThis.fetch = () => { throw new Error('Unexpected request') }
  await assert.rejects(getClassById('not-a-uuid'), (error) => error instanceof ClassApiError && error.status === 400)
  globalThis.fetch = async () => Response.json({ title: 'Not Found' }, { status: 404 })
  await assert.rejects(getClassById(classSummary.id), (error) => error.status === 404)
})

test('POST sends exactly the generated name and capacity and consumes the real 201 contract', async () => {
  const payload = { name: 'KG - Day Shift', totalSeats: 24 }
  const created = { id: classSummary.id, ...payload }
  let request
  globalThis.fetch = async (...args) => { request = args; return Response.json(created, { status: 201 }) }
  assert.deepEqual(await createClass(payload), created)
  assert.equal(request[0], `${API_BASE_URL}/classes`)
  assert.equal(request[1].method, 'POST')
  assert.deepEqual(request[1].headers, { Accept: 'application/json', 'Content-Type': 'application/json' })
  assert.deepEqual(JSON.parse(request[1].body), payload)
})

test('POST preserves duplicate and validation ProblemDetails, and rejects fake success responses', async () => {
  const payload = { name: 'KG - Day Shift', totalSeats: 24 }
  globalThis.fetch = async () => Response.json({ title: 'A class with this name already exists.' }, { status: 409 })
  await assert.rejects(createClass(payload), (error) => error.status === 409 && error.message.includes('already exists'))
  globalThis.fetch = async () => Response.json({ title: 'Validation failed.', errors: { TotalSeats: ['TotalSeats must be a positive integer.'] } }, { status: 400 })
  await assert.rejects(createClass(payload), (error) => error.status === 400 && error.fields.TotalSeats.length === 1)
  globalThis.fetch = async () => Response.json({}, { status: 201 })
  await assert.rejects(createClass(payload), /Could not confirm creation/)
})
