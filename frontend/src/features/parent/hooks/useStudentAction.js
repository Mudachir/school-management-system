import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStudent } from './useStudent.js'
import { useParentData } from './useParentData.js'

export function useStudentAction(resourceId) {
  const { studentId, registerRequest, isCurrent } = useStudent()
  const { verify, refreshClasses, invalidateHolds } = useParentData()
  const identity = useMemo(() => ({ resourceId, studentId, isCurrent }), [resourceId, studentId, isCurrent])
  const currentScope = useRef(null)
  const [state, setState] = useState(null)
  useLayoutEffect(() => {
    const scope = { identity, alive: true, request: null }
    currentScope.current = scope
    return () => { scope.alive = false; scope.request?.abort() }
  }, [identity])
  const run = useCallback(async (operation, onSuccess) => {
    const scope = currentScope.current
    const active = () => scope?.alive && scope.identity === identity && currentScope.current === scope && isCurrent()
    if (!resourceId || !active() || scope.request) return false
    const controller = new AbortController()
    scope.request = controller
    const unregister = registerRequest(controller)
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 15000)
    setState({ identity, isPending: true, error: '' })
    try {
      const result = await operation(studentId, { signal: controller.signal, readApplications: verify })
      controller.signal.throwIfAborted()
      if (!active()) return false
      // A mutation may already have reached the server even if a subsequent read fails.
      refreshClasses()
      await verify({ fresh: true }).catch(() => {})
      controller.signal.throwIfAborted()
      if (!active()) return false
      onSuccess?.(result)
      return true
    } catch (error) {
      if (active() && (!controller.signal.aborted || timedOut)) {
        setState({ identity, isPending: false, error: timedOut ? 'The request took too long. Check My Applications before retrying; the server may have received it.' : error instanceof TypeError ? 'The admission service could not be reached. Check your connection and retry.' : error.message })
        // Reconcile seat counts and ownership/status after conflict or uncertain responses.
        // Invalidating immediately hides an obsolete reservation, even if refetch fails.
        invalidateHolds()
        refreshClasses()
        verify({ fresh: true }).catch(() => {})
      }
      return false
    } finally {
      clearTimeout(timeout); unregister()
      if (scope.request === controller) scope.request = null
      if (active()) setState((value) => value?.identity === identity ? { ...value, isPending: false } : value)
    }
  }, [resourceId, identity, studentId, registerRequest, isCurrent, verify, refreshClasses, invalidateHolds])
  const resetError = useCallback(() => { if (!currentScope.current?.request) setState(null) }, [])
  return { ...(state?.identity === identity ? state : { isPending: false, error: '' }), run, resetError }
}
