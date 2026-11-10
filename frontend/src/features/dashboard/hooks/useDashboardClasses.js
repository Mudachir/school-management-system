import { useCallback, useEffect, useRef, useState } from 'react'
import { getClasses } from '../../classes/services/classService.js'

const requestTimeoutMs = 15000

export function useDashboardClasses() {
  const [state, setState] = useState({ classes: null, status: 'loading', error: null })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const activeRequest = useRef(null)

  const refresh = useCallback(() => {
    if (activeRequest.current) return
    setState({ classes: null, status: 'loading', error: null })
    setRefreshVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    activeRequest.current = controller
    let isActive = true
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, requestTimeoutMs)

    getClasses({ signal: controller.signal })
      .then((classes) => {
        if (isActive && !controller.signal.aborted) {
          setState({ classes, status: 'success', error: null })
        }
      })
      .catch(() => {
        if (isActive && (!controller.signal.aborted || timedOut)) {
          setState({
            classes: null,
            status: 'error',
            error: timedOut
              ? 'The admission service took too long to respond. Please try again.'
              : 'Check your connection and make sure the admission service is available, then try again.',
          })
        }
      })
      .finally(() => {
        clearTimeout(timeout)
        if (activeRequest.current === controller) activeRequest.current = null
      })

    return () => {
      isActive = false
      clearTimeout(timeout)
      controller.abort()
      if (activeRequest.current === controller) activeRequest.current = null
    }
  }, [refreshVersion])

  return { ...state, refresh, isLoading: state.status === 'loading' }
}
