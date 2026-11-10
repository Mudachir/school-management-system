// Five sequential checks per reservation view, then explicit refresh only.
export const EXPIRY_RECHECK_DELAYS = [0, 2000, 5000, 10000, 20000]

export function remainingSeconds(expiresAt, now = Date.now()) {
  const expires = Date.parse(expiresAt)
  return Number.isFinite(expires) ? Math.max(0, Math.ceil((expires - now) / 1000)) : 0
}
export function countdownLabel(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
export function expiryLabel(expiresAt) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(expiresAt))
}
