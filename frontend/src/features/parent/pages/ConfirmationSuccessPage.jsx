import { Link, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useOwnedHold } from '../hooks/useOwnedHold.js'
import HoldSummary from '../components/HoldSummary.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import ReservationState from '../components/ReservationState.jsx'

export default function ConfirmationSuccessPage() {
  const { holdId } = useParams()
  const resource = useOwnedHold(holdId)
  const { hold } = resource
  return <ReservationState resource={resource}>{hold && <section className="soft-card parent-panel parent-success">
    {hold.status === 'CONFIRMED' && <span className="parent-success-icon"><Check size={30} aria-hidden="true" /></span>}
    <h2>{hold.status === 'CONFIRMED' ? 'Admission confirmed' : 'Application status has changed'}</h2>
    <p>{hold.status === 'CONFIRMED' ? 'Your seat is confirmed for the class below. You can manage this request in My Applications.' : 'This application is not currently confirmed. Review its latest details before proceeding.'}</p>
    <StatusBadge status={hold.status} /><HoldSummary hold={hold} />
    <div className="parent-actions"><Link className="button button-primary" to="/parent/applications">My Applications</Link><Link className="button button-secondary" to={`/parent/holds/${holdId}`}>View application</Link></div>
  </section>}</ReservationState>
}
