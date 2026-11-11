import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ClassDataContext } from '../context/ClassDataContext.js'

export function useClassResource(load, identity) {
  const revision = useContext(ClassDataContext)
  const [snapshot, setSnapshot] = useState(null)
  const activeScope = useRef(null)
  const refresh = useCallback(() => activeScope.current?.run(), [])

  useEffect(() => {
    const scope = { alive: true, request: null, timer: null, timeout: null, run: null }
    activeScope.current = scope
    scope.run = async () => {
      if (!scope.alive || scope.request) return
      clearTimeout(scope.timer)
      const controller = new AbortController()
      scope.request = controller
      let timedOut = false, pollAgain = true
      const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 15000)
      scope.timeout = timeout
      setSnapshot((previous) => previous?.identity === identity && previous.status === 'success'
        ? { ...previous, isRefreshing: true }
        : { identity, data: null, status: 'loading', error: null, refreshError: null, isRefreshing: false })
      try {
        const data = await load({ signal: controller.signal })
        if (scope.alive && !controller.signal.aborted) {
          setSnapshot({ identity, data, status: 'success', error: null, refreshError: null, isRefreshing: false })
        }
      } catch (error) {
        if (scope.alive && (!controller.signal.aborted || timedOut)) {
          const problem = timedOut ? new Error('The admission service took too long to respond. Please try again.')
            : error instanceof TypeError ? new Error('The admission service could not be reached. Please try again.')
              : error instanceof SyntaxError ? new Error('The admission service returned invalid data. Please try again.') : error
          pollAgain = ![400, 404].includes(error.status)
          setSnapshot((previous) => previous?.identity === identity && previous.status === 'success' && pollAgain
            ? { ...previous, refreshError: problem, isRefreshing: false }
            : { identity, data: null, status: 'error', error: problem, refreshError: null, isRefreshing: false })
        }
      } finally {
        clearTimeout(timeout)
        scope.request = null
        // Delay after completion: slow requests and manual refresh cannot overlap.
        if (scope.alive && pollAgain) scope.timer = setTimeout(scope.run, 5000)
      }
    }
    queueMicrotask(() => { if (scope.alive) scope.run() })
    return () => {
      scope.alive = false
      clearTimeout(scope.timer)
      clearTimeout(scope.timeout)
      scope.request?.abort()
      if (activeScope.current === scope) activeScope.current = null
    }
  }, [load, identity, revision])

  const current = snapshot?.identity === identity
    ? snapshot : { data: null, status: 'loading', error: null, refreshError: null, isRefreshing: false }
  return { ...current, refresh, isLoading: current.status === 'loading' }
}
