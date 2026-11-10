import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ClassDataContext } from '../context/ClassDataContext.js'

export function useClassResource(load, identity) {
  const revision = useContext(ClassDataContext)
  const [version, setVersion] = useState(0)
  const [snapshot, setSnapshot] = useState(null)
  const activeRequest = useRef(null)
  const refresh = useCallback(() => {
    if (!activeRequest.current) setVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    activeRequest.current = controller
    let isActive = true
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 15000)
    load({ signal: controller.signal })
      .then((data) => {
        if (isActive && !controller.signal.aborted) {
          setSnapshot({ identity, revision, version, data, status: 'success', error: null })
        }
      })
      .catch((error) => {
        if (isActive && (!controller.signal.aborted || timedOut)) {
          setSnapshot({ identity, revision, version, data: null, status: 'error', error: timedOut
            ? new Error('The admission service took too long to respond. Please try again.')
            : error instanceof TypeError ? new Error('The admission service could not be reached. Please try again.')
              : error instanceof SyntaxError ? new Error('The admission service returned invalid data. Please try again.') : error })
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
  }, [load, identity, revision, version])

  const current = snapshot?.identity === identity && snapshot.revision === revision && snapshot.version === version
    ? snapshot : { data: null, status: 'loading', error: null }
  return { ...current, refresh, isLoading: current.status === 'loading' }
}
