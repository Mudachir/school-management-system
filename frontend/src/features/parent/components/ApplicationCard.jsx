import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge.jsx'
import HoldSummary from './HoldSummary.jsx'
import { remainingSeconds } from '../helpers/countdown.js'

export default function ApplicationCard({ application, onCancel, disabled }) {
  const canCancel = application.status === 'CONFIRMED' || (application.status === 'HELD' && remainingSeconds(application.expiresAt) > 0)
  return <article className="soft-card parent-application-card">
    <header><h3>{application.className}</h3><StatusBadge status={application.status} /></header>
    <HoldSummary hold={application} />
    <div className="parent-actions"><Link className="button button-secondary" to={`/parent/holds/${application.holdId}`} aria-label={`View application ${application.holdId} for ${application.className}`}>View Details</Link>
      {canCancel && <button className="button button-secondary" type="button" disabled={disabled} onClick={() => onCancel(application)} aria-label={`Cancel application for ${application.className}`}>Cancel application</button>}
    </div>
  </article>
}
