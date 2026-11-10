import { Link, useParams } from 'react-router-dom'
import { useOwnedHold } from '../hooks/useOwnedHold.js'
import { useHoldCountdown } from '../hooks/useHoldCountdown.js'
import ParentIntro from '../components/ParentIntro.jsx'
import HoldSummary from '../components/HoldSummary.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import ExpiryCountdown from '../components/ExpiryCountdown.jsx'
import ReservationState from '../components/ReservationState.jsx'

export default function HoldPage() {
  const { holdId } = useParams()
  const resource = useOwnedHold(holdId)
  const { hold, refresh } = resource
  const countdown = useHoldCountdown(resource)
  const { seconds } = countdown
  return <>
    <ParentIntro eyebrow={hold?.status === 'HELD' ? 'Seat reserved' : 'Your reservation'} title={hold?.status === 'HELD' ? 'Your seat is on hold' : 'Application details'}>Review your admission request and its current server status.</ParentIntro>
    <ReservationState resource={resource}>{hold && <section className="soft-card parent-panel parent-reservation-panel">
      <StatusBadge status={hold.status} /><HoldSummary hold={hold} />
      {hold.status === 'HELD' && <ExpiryCountdown {...countdown} />}
      <div className="parent-actions">{hold.status === 'HELD' && seconds > 0 && <Link className="button button-primary" to={`/parent/holds/${hold.holdId}/review`}>Review and confirm</Link>}
        <Link className="button button-secondary" to="/parent/applications">My Applications</Link><button className="text-link" onClick={refresh}>Refresh status</button></div>
    </section>}</ReservationState>
  </>
}
