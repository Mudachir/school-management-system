import { useState } from 'react'
import { useStudent } from './useStudent.js'
import { isStudentId } from '../helpers/student.js'

export function useStudentSelection() {
  const { studentId, selectStudent } = useStudent()
  const [value, setValue] = useState(studentId)
  const [error, setError] = useState('')
  function update(next) {
    if (/^\d*$/.test(next)) { setValue(next); setError('') }
  }
  function submit() {
    if (!isStudentId(value)) { setError('Enter exactly 17 digits.'); return false }
    return selectStudent(value)
  }
  return { value, error, update, submit }
}
