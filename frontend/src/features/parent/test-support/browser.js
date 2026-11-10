import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

export const chromePath = [
  process.env.PARENT_TEST_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((path) => path && existsSync(path))

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

async function connection(url, onEvent = () => {}) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let sequence = 0, closed = false
  const pending = new Map()
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id); clearTimeout(request.timeout)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    } else onEvent(message)
  })
  socket.addEventListener('close', () => {
    closed = true
    for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error('Browser connection closed')) }
    pending.clear()
  })
  return {
    command(method, params = {}) {
      if (closed) return Promise.reject(new Error('Browser connection closed'))
      const id = ++sequence
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out: ' + method)) }, 10000)
        pending.set(id, { resolve, reject, timeout })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    close: () => socket.close(),
  }
}

export async function startBrowser() {
  const root = fileURLToPath(new URL('../../../../', import.meta.url))
  const profile = await mkdtemp(join(tmpdir(), 'school-parent-regression-'))
  const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  let child, browser
  try {
    await server.listen()
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port
    child = spawn(chromePath, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let launchError = '', stderr = ''
    child.on('error', (error) => { launchError = error.message })
    child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-2000) })
    let port
    for (let attempt = 0; attempt < 150 && !port && !launchError; attempt++) {
      port = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').then((text) => Number(text.split('\n')[0])).catch(() => null)
      if (!port) await pause(100)
    }
    if (!port) throw new Error(launchError || 'Headless Chrome did not start: ' + stderr)
    const endpoint = 'http://127.0.0.1:' + port
    const version = await fetch(endpoint + '/json/version').then((response) => response.json())
    browser = await connection(version.webSocketDebuggerUrl)
    return {
      origin,
      async page(handleRequest, preload = '') {
        const target = await browser.command('Target.createTarget', { url: 'about:blank' })
        const targets = await fetch(endpoint + '/json/list').then((response) => response.json())
        const url = targets.find((item) => item.id === target.targetId).webSocketDebuggerUrl
        const requests = [], errors = []
        const client = await connection(url, (message) => {
          if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
          if (message.method === 'Fetch.requestPaused') {
            const request = message.params
            requests.push(request)
            Promise.resolve(handleRequest(request.request)).then(async (reply) => {
              const status = reply?.status ?? 200
              await client.command('Fetch.fulfillRequest', {
                requestId: request.requestId, responseCode: status,
                responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
                body: Buffer.from(status === 204 ? '' : JSON.stringify(reply?.body ?? null)).toString('base64'),
              })
            }).catch((error) => {
              // A fixture response can finish after the app has aborted that request.
              if (!/Invalid|closed|interception|session/i.test(error.message)) errors.push(error.message)
            })
          }
        })
        await client.command('Page.enable')
        await client.command('Runtime.enable')
        await client.command('Fetch.enable', { patterns: [{ urlPattern: origin + '/api/*', requestStage: 'Request' }] })
        if (preload) await client.command('Page.addScriptToEvaluateOnNewDocument', { source: preload })
        async function evaluate(expression) {
          const result = await client.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
          if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
          return result.result.value
        }
        async function waitFor(expression, timeout = 10000) {
          const deadline = Date.now() + timeout
          while (Date.now() < deadline) {
            if (await evaluate('Boolean(' + expression + ')').catch(() => false)) return
            await pause(25)
          }
          throw new Error('Browser assertion timed out: ' + expression + '\n' + await evaluate('document.body.innerText') + '\n' + JSON.stringify(errors))
        }
        return {
          requests, errors, evaluate, waitFor,
          async goto(route) {
            await client.command('Page.navigate', { url: origin + route })
            await waitFor('document.querySelector("h1")')
          },
          async fill(selector, value) {
            await evaluate('{ const element = document.querySelector(' + JSON.stringify(selector) + '); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, ' + JSON.stringify(value) + '); element.dispatchEvent(new Event("input", {bubbles:true})); }')
          },
          async selectStudent(studentId) {
            await this.goto('/parent')
            await this.fill('#student-number', studentId)
            await evaluate('document.querySelector("form").requestSubmit()')
            await waitFor('location.pathname === "/parent/classes" && document.querySelector(".parent-class-card")')
          },
          async close() {
            await browser.command('Target.closeTarget', { targetId: target.targetId })
            client.close()
          },
        }
      },
      async close() {
        await browser.command('Browser.close').catch(() => {})
        browser.close()
        await server.close()
        await pause(300)
        // Only remove the unique, verified test profile created above.
        if (resolve(profile).startsWith(resolve(tmpdir()) + sep + 'school-parent-regression-')) {
          await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
        }
      },
    }
  } catch (error) {
    browser?.close(); child?.kill()
    await server.close()
    throw error
  }
}
