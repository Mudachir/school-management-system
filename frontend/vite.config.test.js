import assert from 'node:assert/strict'
import test from 'node:test'
import configureVite from './vite.config.js'

function configuration(target, legacyTarget) {
  const previousTarget = process.env.API_PROXY_TARGET
  const previousLegacy = process.env.VITE_API_BASE_URL
  try {
    // Empty overrides keep developer-specific .env.local files out of these tests.
    process.env.API_PROXY_TARGET = target ?? ''
    process.env.VITE_API_BASE_URL = legacyTarget ?? ''
    return configureVite({ mode: 'test' })
  } finally {
    if (previousTarget === undefined) delete process.env.API_PROXY_TARGET
    else process.env.API_PROXY_TARGET = previousTarget
    if (previousLegacy === undefined) delete process.env.VITE_API_BASE_URL
    else process.env.VITE_API_BASE_URL = previousLegacy
  }
}

test('development and preview explicitly proxy the same API namespace and default target', () => {
  const config = configuration()
  assert.deepEqual(config.preview.proxy, config.server.proxy)
  const [[pattern, proxy]] = Object.entries(config.preview.proxy)
  assert.equal(proxy.target, 'http://localhost:8080')
  assert.equal(proxy.changeOrigin, true)
  assert.ok(new RegExp(pattern).test('/api/classes'))
  assert.ok(!new RegExp(pattern).test('/apiary'))
  assert.equal(proxy.rewrite('/api/classes?sort=name'), '/classes?sort=name')
  assert.equal(proxy.rewrite('/api'), '/')
})

test('server-only backend target is configurable and takes precedence over legacy settings', () => {
  const config = configuration(' http://127.0.0.1:8095/backend/// ', 'http://legacy.invalid')
  assert.equal(Object.values(config.server.proxy)[0].target, 'http://127.0.0.1:8095/backend')
  assert.equal(Object.values(config.preview.proxy)[0].target, 'http://127.0.0.1:8095/backend')
})

test('legacy absolute API URLs remain a server-side fallback; relative values do not change the target', () => {
  assert.equal(Object.values(configuration(undefined, 'http://legacy.invalid/').server.proxy)[0].target, 'http://legacy.invalid')
  assert.equal(Object.values(configuration(undefined, '/api').server.proxy)[0].target, 'http://localhost:8080')
})
