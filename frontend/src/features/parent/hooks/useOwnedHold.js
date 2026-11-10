import { useCallback, useEffect, useRef, useState } from 'react'
import { getOwnedHold } from '../services/admissionService.js'
import { useStudent } from './useStudent.js'
import { useParentData } from './useParentData.js'

export function useOwnedHold(holdId) {
  const { studentId, registerRequest, isCurrent } = useStudent()
  const { verify, holdRevision, applications } = useParentData()
  const [version, setVersion] = useState(0)
  const [snapshot, setSnapshot] = useState(null)
  const active = useRef(null)
  const refresh = useCallback(() => { if (!active.current) setVersion((value) => value + 1) }, [])
  useEffect(() => {
    if (!studentId) return
    const controller = new AbortController()
    active.current = controller
    const unregister = registerRequest(controller)
    let alive = true, timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, 15000)
    getOwnedHold(holdId, studentId, { signal: controller.signal, readApplications: verify })
      .then((hold) => { if (alive && isCurrent() && !controller.signal.aborted) setSnapshot({ holdId, version, holdRevision, hold, status: 'success', error: null }) })
      .catch((error) => {
        if (alive && isCurrent() && (!controller.signal.aborted || timedOut)) setSnapshot({ holdId, version, holdRevision, hold: null, status: 'error', error: timedOut ? new Error('The admission service took too long. Please retry.') : error instanceof TypeError ? new Error('The admission service could not be reached. Please retry.') : error })
      }).finally(() => { clearTimeout(timeout); unregister(); if (active.current === controller) active.current = null })
    return () => { alive = false; clearTimeout(timeout); controller.abort(); unregister(); if (active.current === controller) active.current = null }
  }, [holdId, studentId, registerRequest, isCurrent, verify, version, holdRevision])
  const current = snapshot?.holdId === holdId && snapshot.version === version && snapshot.holdRevision === holdRevision ? snapshot : { hold: null, status: studentId ? 'loading' : 'idle', error: null }
  // /me/holds is authoritative too. Never show a known terminal hold as HELD
  // while a newer detail request is being reconciled.
  const known = applications?.find((item) => item.holdId.toLowerCase() === holdId.toLowerCase())
  const hold = current.hold?.status === 'HELD' && known && known.status !== 'HELD'
    ? { ...current.hold, status: known.status, expiresAt: known.expiresAt } : current.hold
  return { ...current, holdId, hold, refresh, isLoading: current.status === 'loading' }
}
