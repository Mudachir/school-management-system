import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../parent.css', import.meta.url), 'utf8')
function luminance(color) {
  return color.match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)

test('parent status/countdown and neutral text meet AA on their actual backgrounds', () => {
  // Assert against the CSS as well as measuring the intended foreground pairs.
  for (const color of ['985316', '146749', '586780']) assert.ok(css.includes(`#${color}`))
  for (const [foreground, background] of [['985316', 'fff1e5'], ['146749', 'e3f6ee'], ['586780', 'edf0f5'], ['586780', 'e8edf5']]) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground}/${background}: ${contrast(foreground, background).toFixed(3)}:1`)
  }
})
