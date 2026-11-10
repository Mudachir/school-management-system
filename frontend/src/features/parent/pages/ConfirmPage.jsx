import { Link, useNavigate, useParams } from 'react-router-dom'
import { useOwnedHold } from '../hooks/useOwnedHold.js'
import { useHoldCountdown } from '../hooks/useHoldCountdown.js'
import { useParentData } from '../hooks/useParentData.js'
import { useStudentAction } from '../hooks/useStudentAction.js'
import { confirmAdmission } from '../services/admissionService.js'
import ParentIntro from '../components/ParentIntro.jsx'
import HoldSummary from '../components/HoldSummary.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import ExpiryCountdown from '../components/ExpiryCountdown.jsx'
import EligibilityNotice from '../components/EligibilityNotice.jsx'
import ReservationState from '../components/ReservationState.jsx'
import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'

export default function ConfirmPage() {
  const { holdId } = useParams()
  const resource = useOwnedHold(holdId)
  const { hold, refresh } = resource
  const countdown = useHoldCountdown(resource)
  const { seconds } = countdown
  const { eligibility } = useParentData()
  const action = useStudentAction(holdId)
  const navigate = useNavigate()
  return <>
    <ParentIntro eyebrow="Final step" title="Review and confirm">Check the class and student number before confirming admission.</ParentIntro>
    <LiveAnnouncement message={action.isPending ? 'Checking applications and confirming admission.' : action.error || eligibility.message} />
    <ReservationState resource={resource}>{hold && <section className="soft-card parent-panel parent-reservation-panel">
      <StatusBadge status={hold.status} /><HoldSummary hold={hold} />
      {hold.status === 'HELD' && <><ExpiryCountdown {...countdown} /><EligibilityNotice /></>}
      {['EXPIRED', 'CANCELLED'].includes(hold.status) && <p className="parent-notice">This application is {hold.status.toLowerCase()} and cannot be confirmed. Browse classes to start a new request.</p>}
      {action.error && <p className="parent-form-error">{action.error}</p>}
      <div className="parent-actions">{hold.status === 'HELD' && <button type="button" className="button button-primary" disabled={seconds === 0 || !eligibility.allowed || action.isPending}
        onClick={() => action.run((studentId, options) => confirmAdmission(holdId, studentId, options), () => navigate(`/parent/holds/${holdId}/success`, { replace: true }))}>{action.isPending ? 'Confirming…' : 'Confirm Admission'}</button>}
        {hold.status === 'CONFIRMED' && <Link className="button button-primary" to={`/parent/holds/${holdId}/success`}>View confirmation</Link>}
        <Link className="button button-secondary" to="/parent/applications">My Applications</Link><button type="button" className="text-link" onClick={refresh} disabled={action.isPending}>Refresh status</button></div>
    </section>}</ReservationState>
  </>
}
