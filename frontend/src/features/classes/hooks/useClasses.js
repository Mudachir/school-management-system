import { getClasses } from '../services/classService.js'
import { useClassResource } from './useClassResource.js'

export function useClasses() {
  const { data, ...state } = useClassResource(getClasses, 'classes')
  return { ...state, classes: data }
}
