import test from 'node:test'
import assert from 'node:assert/strict'
import { isStudentId, readStudent, saveStudent, STUDENT_STORAGE_KEY } from './student.js'
import { classMetadata, filterParentClasses } from './classFilters.js'
import { admissionEligibility } from './admissionEligibility.js'

test('student identification requires exactly 17 ASCII digits and preserves leading zeroes', () => {
  const id = '00123456789012345'
  assert.equal(isStudentId(id), true)
  for (const invalid of ['', '123', '123456789012345678', ' 12345678901234567', 'à§§à§¨à§©à§ªà§«à§¬à§­à§®à§¯à§¦à§§à§¨à§©à§ªà§«à§¬à§­', 12345]) assert.equal(isStudentId(invalid), false)
  const entries = new Map()
  const storage = { getItem: (key) => entries.get(key), setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) }
  assert.equal(saveStudent(storage, id), true)
  assert.equal(readStudent(storage), id)
  entries.set(STUDENT_STORAGE_KEY, '{broken}')
  assert.equal(readStudent(storage), '')
  saveStudent(storage, '')
  assert.equal(entries.has(STUDENT_STORAGE_KEY), false)
  assert.equal(readStudent(null), '')
  assert.equal(saveStudent(null, id), false)
})

test('class filters parse supported levels/shifts and retain other backend names', () => {
  assert.deepEqual(classMetadata('Class 10 - Day Shift'), { level: 'Class 10', shift: 'Day' })
  assert.deepEqual(classMetadata('play - morning Shift'), { level: 'Play', shift: 'Morning' })
  assert.deepEqual(classMetadata('Special intake'), { level: 'Other', shift: 'Other' })
  const items = [{ name: 'KG - Morning Shift' }, { name: 'KG - Day Shift' }, { name: 'Special intake' }]
  assert.equal(filterParentClasses(items, '', '').length, 3)
  assert.deepEqual(filterParentClasses(items, 'KG', 'Day'), [items[1]])
  assert.deepEqual(filterParentClasses(items, 'Other', ''), [items[2]])
})

test('eligibility fails closed without identity, while loading or on API errors', () => {
  assert.equal(admissionEligibility({ studentId: '', status: 'success', applications: [] }).allowed, false)
  for (const status of ['idle', 'loading', 'error']) assert.equal(admissionEligibility({ studentId: '00123456789012345', status, applications: [] }).allowed, false)
  assert.equal(admissionEligibility({ studentId: '00123456789012345', status: 'success', applications: null }).allowed, false)
})

test('confirmed applications block new admission; held/expired/cancelled do not', () => {
  const id = '00123456789012345'
  for (const status of ['HELD', 'EXPIRED', 'CANCELLED']) assert.equal(admissionEligibility({ studentId: id, status: 'success', applications: [{ status }] }).allowed, true)
  const confirmed = { status: 'CONFIRMED', className: 'Class 6 - Morning Shift' }
  const result = admissionEligibility({ studentId: id, status: 'success', applications: [{ status: 'CANCELLED' }, confirmed] })
  assert.equal(result.allowed, false)
  assert.equal(result.confirmed, confirmed)
  assert.match(result.message, /Admission already confirmed.*Class 6/)
})
