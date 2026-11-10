import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'
import RequestState from '../../../components/ui/RequestState.jsx'
import StudentBanner from './StudentBanner.jsx'
import { useStudent } from '../hooks/useStudent.js'

export default function ReservationState({ resource, children }) {
  const { studentId } = useStudent()
  const { hold, status, error, refresh, isLoading } = resource
  return <>
    <LiveAnnouncement message={isLoading ? 'Loading reservation.' : status === 'error' ? error.message : hold ? `Application status: ${hold.status.toLowerCase()}.` : 'Select a student to view this application.'} />
    {!studentId ? <StudentBanner /> : <div aria-busy={isLoading}>{status !== 'success'
      ? <RequestState status={status} error={error} onRetry={refresh} subject="reservation" /> : children}</div>}
  </>
}
