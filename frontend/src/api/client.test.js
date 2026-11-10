import assert from 'node:assert/strict'
import test from 'node:test'
import { API_BASE_URL, apiClient } from './client.js'

const originalFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = originalFetch })

test('the central client always uses same-origin /api without a browser backend address', async () => {
  assert.equal(API_BASE_URL, '/api')
  const requests = []
  const response = new Response('[]')
  globalThis.fetch = async (...args) => { requests.push(args); return response }
  const options = { method: 'GET', signal: new AbortController().signal }
  for (const path of ['classes', '/classes', '///classes']) {
    assert.equal(await apiClient(path, options), response)
  }
  assert.deepEqual(requests, Array.from({ length: 3 }, () => ['/api/classes', options]))
})

test('importing the API client does not send any requests', async () => {
  globalThis.fetch = () => { throw new Error('Unexpected request during import') }
  await import('./client.js?import-check')
})
