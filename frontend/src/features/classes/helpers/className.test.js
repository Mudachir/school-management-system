import assert from 'node:assert/strict'
import test from 'node:test'
import { CLASS_LEVELS, SHIFTS, MAX_SEATS, generatedClassName, validateClassForm } from './className.js'

test('all thirteen classes and both shifts generate the exact backend naming convention', () => {
  assert.deepEqual(CLASS_LEVELS, ['Play', 'Nursery', 'KG', ...Array.from({ length: 10 }, (_, i) => `Class ${i + 1}`)])
  assert.deepEqual(SHIFTS, ['Morning', 'Day'])
  for (const level of CLASS_LEVELS) for (const shift of SHIFTS) {
    assert.equal(generatedClassName(level, shift), `${level} - ${shift} Shift`)
  }
  assert.equal(generatedClassName('Grade 6', 'Morning'), '')
  assert.equal(generatedClassName('KG', 'Night'), '')
})

test('blank, invalid and out-of-range forms cannot produce a POST payload', () => {
  for (const totalSeats of ['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', String(MAX_SEATS + 1)]) {
    const result = validateClassForm({ classLevel: 'KG', shift: 'Day', totalSeats })
    assert.equal(result.payload, null)
    assert.ok(result.errors.totalSeats)
  }
  const result = validateClassForm({ classLevel: '', shift: '', totalSeats: '' })
  assert.deepEqual(Object.keys(result.errors), ['classLevel', 'shift', 'totalSeats'])
})

test('valid form payload has only generated name and numeric seats, including backend limit', () => {
  assert.deepEqual(validateClassForm({ classLevel: 'Class 6', shift: 'Morning', totalSeats: ' 120 ' }), {
    errors: {}, payload: { name: 'Class 6 - Morning Shift', totalSeats: 120 },
  })
  assert.equal(validateClassForm({ classLevel: 'Play', shift: 'Day', totalSeats: String(MAX_SEATS) }).payload.totalSeats, MAX_SEATS)
})
