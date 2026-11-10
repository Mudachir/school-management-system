import assert from 'node:assert/strict'
import test from 'node:test'
import { filterClasses } from './filterClasses.js'

test('class search trims whitespace and matches class or shift case-insensitively', () => {
  const records = [{ name: 'Nursery - Day Shift' }, { name: 'Class 4 - Morning Shift' }]
  assert.deepEqual(filterClasses(records, '  DAY  '), [records[0]])
  assert.deepEqual(filterClasses(records, 'class 4'), [records[1]])
  assert.deepEqual(filterClasses(records, '  '), records)
  assert.deepEqual(filterClasses(records, 'KG'), [])
  assert.equal(records.length, 2)
})
