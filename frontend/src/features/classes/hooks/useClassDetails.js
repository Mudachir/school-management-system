import { useCallback } from 'react'
import { getClassById } from '../services/classService.js'
import { useClassResource } from './useClassResource.js'

export function useClassDetails(classId) {
  const load = useCallback((options) => getClassById(classId, options), [classId])
  const { data, ...state } = useClassResource(load, classId)
  return { ...state, admissionClass: data }
}
