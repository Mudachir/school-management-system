import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'
import RequestState from '../../../components/ui/RequestState.jsx'
import RefreshNotice from '../../../components/ui/RefreshNotice.jsx'
import ClassDetailsStats from '../components/ClassDetailsStats.jsx'
import { useClassDetails } from '../hooks/useClassDetails.js'
import { getUtilization } from '../helpers/utilization.js'
import '../classes.css'

export default function ClassDetailsPage() {
  const { classId } = useParams()
  const { admissionClass, status, error, refresh, isLoading, refreshError } = useClassDetails(classId)
  const missing = error?.status === 404
  const invalid = error?.status === 400
  const title = missing ? 'Class not found' : invalid ? 'Invalid class ID' : undefined
  const utilization = admissionClass ? getUtilization(admissionClass) : null
  return (
    <section className="classes-page class-details" aria-labelledby="class-details-heading">
      <Link className="text-link back-link" to="/admin/classes"><ArrowLeft size={16} aria-hidden="true" /> Back to classes</Link>
      <RefreshNotice error={refreshError} onRetry={refresh} />
      <LiveAnnouncement message={isLoading ? 'Loading class details.' : status === 'error'
        ? (title ?? 'Unable to load class details. Use Retry to try again.') : `Class details loaded for ${admissionClass.name}.`} />
      <div aria-busy={isLoading}>
        {status !== 'success' ? <><h2 id="class-details-heading" className="dashboard-sr-only">Class Details</h2>
          <RequestState status={status} error={error} subject="class details" title={title} onRetry={missing || invalid ? undefined : refresh} /></> : (
          <>
            <div className="dashboard-intro">
              <div><p className="eyebrow">Class details</p><h2 id="class-details-heading">{admissionClass.name}</h2>
                <p className="dashboard-subtitle">Seat allocation and capacity at a glance.</p></div>
              <button type="button" className="button dashboard-refresh" onClick={refresh} disabled={isLoading}><RefreshCw size={16} aria-hidden="true" /> Refresh</button>
            </div>
            <ClassDetailsStats admissionClass={admissionClass} />
            <section className="soft-card class-utilization" aria-labelledby="utilization-heading">
              <div className="dashboard-occupancy-heading"><h3 id="utilization-heading">Capacity utilization</h3>
                <strong>{utilization.percentage}%</strong></div>
              <p>The share of seats that are held or confirmed.</p>
              <div className="class-utilization-track" role="progressbar" aria-label="Capacity utilized"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={utilization.progress}
                aria-valuetext={`${utilization.percentage}% of capacity occupied`}>
                <div style={{ width: `${utilization.progress}%` }} />
              </div>
            </section>
          </>
        )}
      </div>
    </section>
  )
}
