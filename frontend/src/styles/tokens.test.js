import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const css = await readFile(new URL('./tokens.css', import.meta.url), 'utf8')
const colors = Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*#([\da-f]{6})/gi)].map(([, key, value]) => [key, value]))

function luminance(hex) {
  return hex.match(/../g)
    .map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
}

function contrast(first, second) {
  const light = Math.max(luminance(first), luminance(second))
  const dark = Math.min(luminance(first), luminance(second))
  return (light + 0.05) / (dark + 0.05)
}

test('contrast calculation uses linear-light luminance', () => {
  assert.equal(contrast('000000', 'ffffff'), 21)
  assert.equal(contrast('ffffff', 'ffffff'), 1)
})

for (const foreground of ['muted', 'held-ink']) {
  const backgrounds = ['surface', 'background', 'legend', 'table-header']
  if (foreground === 'held-ink') backgrounds.push('held-soft')
  for (const background of backgrounds) {
    test(`${foreground} normal text meets 4.5:1 on ${background}`, () => {
      const ratio = contrast(colors[foreground], colors[background])
      assert.ok(ratio >= 4.5, `Actual contrast: ${ratio.toFixed(3)}:1`)
    })
  }
}

test('refresh hover text meets 4.5:1 on the soft blue hover background', () => {
  assert.ok(contrast(colors['primary-hover'], colors['primary-soft']) >= 4.5)
})
