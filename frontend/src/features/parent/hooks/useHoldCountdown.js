import { useEffect, useMemo, useState } from 'react'
import { EXPIRY_RECHECK_DELAYS, remainingSeconds } from '../helpers/countdown.js'

export function useHoldCountdown({ holdId, hold, refresh, isLoading, status }) {
  const [, tick] = useState(0)
  // Keep the budget across loading snapshots; reset only for a different record.
  const identity = useMemo(() => ({ holdId }), [holdId])
  const [rechecks, setRechecks] = useState(null)
  const attempts = rechecks?.identity === identity ? rechecks.attempts : 0
  const held = hold?.status === 'HELD'
  const seconds = hold ? remainingSeconds(hold.expiresAt) : 0
  useEffect(() => {
    if (!held) return
    const interval = setInterval(() => tick((value) => value + 1), 1000)
    return () => clearInterval(interval)
  }, [held, hold?.holdId])
  useEffect(() => {
    if (!held || seconds > 0 || isLoading || status !== 'success') return
    const delay = EXPIRY_RECHECK_DELAYS[attempts]
    if (delay === undefined) return
    const task = setTimeout(() => { setRechecks({ identity, attempts: attempts + 1 }); refresh() }, delay)
    return () => clearTimeout(task)
  }, [held, holdId, seconds, refresh, isLoading, status, identity, attempts])
  return { seconds, exhausted: held && seconds === 0 && attempts >= EXPIRY_RECHECK_DELAYS.length }
}
