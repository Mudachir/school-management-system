const LABELS = { HELD: 'Held', CONFIRMED: 'Confirmed', EXPIRED: 'Expired', CANCELLED: 'Cancelled' }
export default function StatusBadge({ status }) {
  return <span className={`parent-status parent-status-${status.toLowerCase()}`}>{LABELS[status]}</span>
}
