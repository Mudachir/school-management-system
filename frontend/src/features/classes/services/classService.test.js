import assert from 'node:assert/strict'
import test from 'node:test'
import { API_BASE_URL } from '../../../api/client.js'
import { getClasses } from './classService.js'

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
