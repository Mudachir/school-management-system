import { useContext } from 'react'
import { ParentDataContext } from '../context/ParentDataContext.js'
import { useStudent } from './useStudent.js'
import { admissionEligibility } from '../helpers/admissionEligibility.js'

export function useParentData() {
  const data = useContext(ParentDataContext)
  const { studentId } = useStudent()
  return { ...data, eligibility: admissionEligibility({ ...data, studentId }) }
}
