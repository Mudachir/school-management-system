import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ParentDataContext } from './ParentDataContext.js'
import { ClassDataContext } from '../../classes/context/ClassDataContext.js'
import { getMyApplications } from '../services/holdService.js'
import { useStudent } from '../hooks/useStudent.js'

export default function ParentDataProvider({ children }) {
  const { studentId, registerRequest, isCurrent } = useStudent()
  const [state, setState] = useState({ status: studentId ? 'loading' : 'idle', applications: null, error: null })
  const [revision, setRevision] = useState(0)
  const [holdRevision, setHoldRevision] = useState(0)
  const activeRead = useRef(null)
  const mounted = useRef(true)
  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; activeRead.current?.controller.abort() }
  }, [])
  const verify = useCallback(function verify(options = {}) {
    options.signal?.throwIfAborted()
    if (!studentId) return Promise.reject(new Error('Select a student first.'))
    if (!mounted.current || !isCurrent()) return Promise.reject(new DOMException('Student changed', 'AbortError'))
    if (activeRead.current?.controller.signal.aborted) activeRead.current = null
    if (options.fresh && activeRead.current) return activeRead.current.promise.catch(() => {}).then(() => verify({ ...options, fresh: false }))
    if (activeRead.current) return activeRead.current.promise
    const controller = new AbortController()
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    const unregister = registerRequest(controller)
    const timeout = setTimeout(() => controller.abort(), 15000)
    const canPublish = () => mounted.current && isCurrent() && activeRead.current?.controller === controller
    setState((previous) => options.background && previous.status === 'success'
      ? { ...previous, isRefreshing: true }
      : { status: 'loading', applications: null, error: null, refreshError: null, isRefreshing: false })
    const promise = getMyApplications(studentId, { signal: controller.signal })
      .then((applications) => {
        if (controller.signal.aborted || !canPublish()) throw new DOMException('Student or route changed', 'AbortError')
        setState({ status: 'success', applications, error: null, refreshError: null, isRefreshing: false })
        return applications
      })
      .catch((error) => {
        if (canPublish()) setState((previous) => {
          if (options.signal?.aborted && previous.status === 'success') return { ...previous, isRefreshing: false }
          const problem = new Error('Application status could not be verified. Please retry.')
          return options.background && previous.status === 'success'
            ? { ...previous, refreshError: problem, isRefreshing: false }
            : { status: 'error', applications: null, error: problem, refreshError: null, isRefreshing: false }
        })
        throw error
      })
      .finally(() => {
        clearTimeout(timeout); unregister()
        options.signal?.removeEventListener('abort', abort)
        if (activeRead.current?.controller === controller) activeRead.current = null
      })
    activeRead.current = { controller, promise }
    return promise
  }, [studentId, registerRequest, isCurrent])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active && studentId) verify().catch(() => {}) })
    return () => { active = false }
  }, [studentId, verify])
  const refreshClasses = useCallback(() => setRevision((value) => value + 1), [])
  const invalidateHolds = useCallback(() => setHoldRevision((value) => value + 1), [])
  return <ParentDataContext.Provider value={{ ...state, verify, refreshClasses, holdRevision, invalidateHolds }}>
    <ClassDataContext.Provider value={revision}>{children}</ClassDataContext.Provider>
  </ParentDataContext.Provider>
}
