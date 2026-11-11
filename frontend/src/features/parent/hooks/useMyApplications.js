import { useCallback, useEffect, useRef, useState } from 'react'
import { useStudent } from './useStudent.js'
import { useParentData } from './useParentData.js'
import { EXPIRY_RECHECK_DELAYS } from '../helpers/countdown.js'

export function useMyApplications() {
  const { studentId } = useStudent()
  const data = useParentData()
  const { verify, applications, status, isRefreshing, refreshError, refreshClasses } = data
  const scope = useRef(null)
  const attempts = useRef(new Map())
  const [checkVersion, setCheckVersion] = useState(0)
  const [expiryPending, setExpiryPending] = useState(false)
  const refresh = useCallback(() => {
    const current = scope.current
    return current?.alive ? verify({ signal: current.controller.signal }) : Promise.resolve()
  }, [verify])
  useEffect(() => {
    const current = { alive: true, controller: new AbortController() }
    scope.current = current
    attempts.current = new Map()
    queueMicrotask(() => { if (current.alive && studentId) refresh().catch(() => {}) })
    return () => {
      current.alive = false
      current.controller.abort()
      if (scope.current === current) scope.current = null
    }
  }, [studentId, verify, refresh])

  useEffect(() => {
    if (!studentId || status !== 'success' || isRefreshing || refreshError) return
    const current = scope.current
    if (!current?.alive) return
    const held = applications.filter((item) => item.status === 'HELD')
    const keys = new Set(held.map((item) => `${item.holdId}:${item.expiresAt}`))
    for (const key of attempts.current.keys()) if (!keys.has(key)) attempts.current.delete(key)
    for (const item of held) {
      const key = `${item.holdId}:${item.expiresAt}`
      if (!attempts.current.has(key)) attempts.current.set(key, { count: 0, at: Date.parse(item.expiresAt) })
    }
    const pending = held.some((item) => attempts.current.get(`${item.holdId}:${item.expiresAt}`)?.count >= EXPIRY_RECHECK_DELAYS.length)
    queueMicrotask(() => { if (current.alive) setExpiryPending(pending) })
    const candidates = [...attempts.current.values()].filter((entry) => entry.count < EXPIRY_RECHECK_DELAYS.length)
    if (!candidates.length) return
    let timer
    function schedule() {
      const at = Math.min(...candidates.map((entry) => entry.at))
      // Long timers are bounded by the browser's signed 32-bit timer limit.
      timer = setTimeout(check, Math.min(2147483647, Math.max(0, at - Date.now())))
    }
    async function check() {
      if (!current.alive) return
      const due = candidates.filter((entry) => entry.at <= Date.now())
      if (!due.length) { schedule(); return }
      for (const entry of due) { entry.count++; entry.at = Infinity }
      try {
        const latest = await verify({ background: true, signal: current.controller.signal })
        if (!current.alive || current.controller.signal.aborted) return
        // The server alone changes statuses. A slow/fast browser clock never does.
        if (latest.some((item) => item.status !== 'HELD' && held.some((old) => old.holdId === item.holdId))) refreshClasses()
        for (const entry of due) entry.at = Date.now() + (EXPIRY_RECHECK_DELAYS[entry.count] ?? Infinity)
        setCheckVersion((value) => value + 1)
      } catch {
        // Keep the spent budget, but allow a successful manual retry to resume it.
        if (current.alive) for (const entry of due) entry.at = Date.now() + (EXPIRY_RECHECK_DELAYS[entry.count] ?? Infinity)
      }
    }
    schedule()
    return () => clearTimeout(timer)
  }, [applications, status, isRefreshing, refreshError, studentId, verify, refreshClasses, checkVersion])
  return { ...data, studentId, verify: refresh, expiryPending, isLoading: data.status === 'loading' }
}
