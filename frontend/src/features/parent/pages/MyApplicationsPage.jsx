import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMyApplications } from '../hooks/useMyApplications.js'
import { useStudentAction } from '../hooks/useStudentAction.js'
import { cancelAdmission } from '../services/admissionService.js'
import ParentIntro from '../components/ParentIntro.jsx'
import StudentBanner from '../components/StudentBanner.jsx'
import ApplicationCard from '../components/ApplicationCard.jsx'
import CancelApplicationDialog from '../components/CancelApplicationDialog.jsx'
import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'
import RequestState from '../../../components/ui/RequestState.jsx'
import RefreshNotice from '../../../components/ui/RefreshNotice.jsx'

export default function MyApplicationsPage() {
  const { applications, studentId, status, error, isLoading, verify, refreshError, isRefreshing, expiryPending } = useMyApplications()
  const [cancelling, setCancelling] = useState(null)
  const action = useStudentAction(cancelling?.holdId)
  const [notice, setNotice] = useState('')
  return <>
    <ParentIntro eyebrow="Your requests" title="My Applications">Review admission requests for the selected student.</ParentIntro>
    <StudentBanner />
    <RefreshNotice error={refreshError} onRetry={() => verify().catch(() => {})} />
    {expiryPending && <p className="parent-notice" role="status">The server still reports a held application. Use Refresh applications to check again.</p>}
    <LiveAnnouncement message={!studentId ? 'Select a student to view applications.' : isLoading ? 'Loading applications.' : status === 'error' ? 'Applications could not be loaded. Please retry.' : applications?.length ? 'Applications loaded.' : 'No applications for this student.'} />
    <LiveAnnouncement message={notice} />
    {notice && <p className="parent-notice">{notice}</p>}
    {studentId && <div aria-busy={isLoading}>{status !== 'success' ? <RequestState status={status} error={error} onRetry={() => verify().catch(() => {})} subject="applications" /> : <>
      <div className="parent-options-heading"><h3>Admission history</h3><button className="text-link" onClick={() => verify().catch(() => {})} disabled={action.isPending}>Refresh applications</button></div>
      {applications.length ? <div className="parent-application-list">{applications.map((application) => <ApplicationCard key={application.holdId} application={application} disabled={action.isPending || isRefreshing || Boolean(refreshError)} onCancel={(item) => { action.resetError(); setNotice(''); setCancelling(item) }} />)}</div>
        : <section className="soft-card parent-panel"><h3>No applications yet</h3><p>Browse available classes to start an admission request.</p><Link className="text-link" to="/parent/classes">Browse classes</Link></section>}
    </>}</div>}
    {cancelling && <CancelApplicationDialog application={cancelling} isPending={action.isPending} error={action.error} onClose={() => setCancelling(null)}
      onConfirm={() => action.run((id, options) => cancelAdmission(cancelling.holdId, id, options), () => { setCancelling(null); setNotice('Application cancelled. The seat has been released.') })} />}
  </>
}
