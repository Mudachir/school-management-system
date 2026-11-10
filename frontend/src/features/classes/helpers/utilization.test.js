import assert from 'node:assert/strict'
import test from 'node:test'
import { getUtilization } from './utilization.js'

test('utilization uses held plus confirmed, protects zero and clamps progress semantics', () => {
  assert.deepEqual(getUtilization({ totalSeats: 0, heldSeats: 0, confirmedSeats: 0 }), { percentage: 0, progress: 0 })
  assert.deepEqual(getUtilization({ totalSeats: 10, heldSeats: 2, confirmedSeats: 3 }), { percentage: 50, progress: 50 })
  assert.deepEqual(getUtilization({ totalSeats: 10, heldSeats: 2, confirmedSeats: 8 }), { percentage: 100, progress: 100 })
  assert.deepEqual(getUtilization({ totalSeats: 10, heldSeats: 6, confirmedSeats: 8 }), { percentage: 140, progress: 100 })
})
