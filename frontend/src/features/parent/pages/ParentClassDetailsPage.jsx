import { Link, useParams, useNavigate } from 'react-router-dom'
import { useClassDetails } from '../../classes/hooks/useClassDetails.js'
import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'
import RequestState from '../../../components/ui/RequestState.jsx'
import ParentIntro from '../components/ParentIntro.jsx'
import CapacitySummary from '../components/CapacitySummary.jsx'
import EligibilityNotice from '../components/EligibilityNotice.jsx'
import { useParentData } from '../hooks/useParentData.js'
import { useStudentAction } from '../hooks/useStudentAction.js'
import { createAdmissionHold } from '../services/admissionService.js'

export default function ParentClassDetailsPage() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const { eligibility } = useParentData()
  const action = useStudentAction(classId)
  const { admissionClass, status, error, refresh, isLoading } = useClassDetails(classId)
  return <>
    <Link className="text-link back-link" to="/parent/classes">← Back to classes</Link>
    <LiveAnnouncement message={isLoading ? 'Loading class details.' : status === 'error' ? 'Class details unavailable.' : `Class details loaded for ${admissionClass.name}.`} />
    <LiveAnnouncement message={action.isPending ? 'Checking applications and holding your seat.' : action.error || eligibility.message} />
    <div aria-busy={isLoading}>{status !== 'success' ? <RequestState status={status} error={error} title={error?.status === 404 ? 'Class not found' : error?.status === 400 ? 'Invalid class ID' : undefined} subject="class details" onRetry={refresh} /> : <>
      <ParentIntro eyebrow="Class details" title={admissionClass.name}>Explore this class before holding a seat.</ParentIntro>
      <section className="soft-card parent-panel parent-reservation-panel"><h3>Seat capacity</h3><CapacitySummary admissionClass={admissionClass} />
        <EligibilityNotice />{admissionClass.availableSeats === 0 && <p className="parent-notice">This class is full. Please browse other classes.</p>}
        {action.error && <p className="parent-form-error">{action.error} <Link className="text-link" to="/parent/applications">My Applications</Link></p>}
        <button type="button" className="button button-primary" disabled={!eligibility.allowed || admissionClass.availableSeats === 0 || action.isPending}
          onClick={() => action.run((studentId, options) => createAdmissionHold(classId, studentId, options), (hold) => navigate(`/parent/holds/${hold.holdId}`))}>{action.isPending ? 'Holding seat…' : 'Hold My Seat'}</button>
      </section>
    </>}</div>
  </>
}
