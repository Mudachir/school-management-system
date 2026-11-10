import { useClasses } from '../../classes/hooks/useClasses.js'

export function useDashboardClasses() {
  const state = useClasses()
  return { ...state, error: state.error?.message }
}
