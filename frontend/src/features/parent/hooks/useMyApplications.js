import { useEffect } from 'react'
import { useStudent } from './useStudent.js'
import { useParentData } from './useParentData.js'

export function useMyApplications() {
  const { studentId } = useStudent()
  const data = useParentData()
  const { verify } = data
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active && studentId) verify().catch(() => {}) })
    return () => { active = false }
  }, [studentId, verify])
  return { ...data, studentId, isLoading: data.status === 'loading' }
}
