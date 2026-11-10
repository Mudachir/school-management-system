import assert from 'node:assert/strict'
import test from 'node:test'
import { getSeatDistribution, summarizeClasses } from './dashboardSummary.js'

test('sums actual response fields, including backend-supplied availability', () => {
  const classes = [
    { totalSeats: 31, heldSeats: 4, confirmedSeats: 12, availableSeats: 14 },
    { totalSeats: 19, heldSeats: 2, confirmedSeats: 7, availableSeats: 10 },
  ]
  assert.deepEqual(summarizeClasses(classes), {
    classCount: 2, totalSeats: 50, heldSeats: 6, confirmedSeats: 19,
    availableSeats: 24, occupiedPercentage: 50,
  })
  assert.equal(classes[0].availableSeats, 14)
})

test('empty results have zero totals and finite empty bar widths', () => {
  const summary = summarizeClasses([])
  assert.deepEqual(summary, {
    classCount: 0, totalSeats: 0, heldSeats: 0, confirmedSeats: 0,
    availableSeats: 0, occupiedPercentage: 0,
  })
  assert.deepEqual(getSeatDistribution(summary), { confirmed: 0, held: 0, available: 0 })
})

test('zero-capacity classes are counted without division by zero', () => {
  const summary = summarizeClasses([{ totalSeats: 0, heldSeats: 0, confirmedSeats: 0, availableSeats: 0 }])
  assert.equal(summary.classCount, 1)
  assert.equal(summary.occupiedPercentage, 0)
  assert.deepEqual(getSeatDistribution(summary), { confirmed: 0, held: 0, available: 0 })
})

test('occupied percentage rounds from confirmed plus held, not available seats', () => {
  const summary = summarizeClasses([{ totalSeats: 7, heldSeats: 1, confirmedSeats: 3, availableSeats: 3 }])
  assert.equal(summary.occupiedPercentage, 57)
  assert.deepEqual(getSeatDistribution(summary), {
    confirmed: 3 / 7 * 100, held: 1 / 7 * 100, available: 3 / 7 * 100,
  })
})

test('inconsistent or over-capacity counts cannot overflow the bar or alter actual totals', () => {
  const summary = summarizeClasses([{ totalSeats: 10, heldSeats: 4, confirmedSeats: 8, availableSeats: 1 }])
  const distribution = getSeatDistribution(summary)
  assert.ok(Math.abs(distribution.confirmed + distribution.held + distribution.available - 100) < 0.00001)
  assert.equal(summary.occupiedPercentage, 120)
  assert.equal(summary.availableSeats, 1)
})
