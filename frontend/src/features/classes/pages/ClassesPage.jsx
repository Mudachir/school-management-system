import { RefreshCw, Search } from 'lucide-react'
import { useContext, useState } from 'react'
import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'
import RequestState from '../../../components/ui/RequestState.jsx'
import RefreshNotice from '../../../components/ui/RefreshNotice.jsx'
import ClassesTable from '../components/ClassesTable.jsx'
import CreateClassButton from '../components/CreateClassButton.jsx'
import { ClassDataContext } from '../context/ClassDataContext.js'
import { useClasses } from '../hooks/useClasses.js'
import { filterClasses } from '../helpers/filterClasses.js'
import '../classes.css'

export default function ClassesPage() {
  const { classes, status, error, refresh, isLoading, refreshError } = useClasses()
  const revision = useContext(ClassDataContext)
  const [search, setSearch] = useState({ revision, query: '' })
  const query = search.revision === revision ? search.query : ''
  const filtered = classes ? filterClasses(classes, query) : []
  const message = isLoading ? 'Loading admission classes.' : status === 'error'
    ? 'Unable to load admission classes. Use Retry to try again.' : `${filtered.length} admission classes shown.`
  return (
    <section className="classes-page" aria-labelledby="classes-heading">
      <div className="dashboard-intro">
        <div><p className="eyebrow">Capacity management</p><h2 id="classes-heading">Admission Classes</h2>
          <p className="dashboard-subtitle">Search classes and review their available seats.</p></div>
        <div className="dashboard-actions">
          <button type="button" className="button dashboard-refresh" onClick={refresh} disabled={isLoading}><RefreshCw size={16} aria-hidden="true" /> Refresh</button>
          <CreateClassButton />
        </div>
      </div>
      <LiveAnnouncement message={message} />
      <RefreshNotice error={refreshError} onRetry={refresh} />
      <div aria-busy={isLoading}>
        {status !== 'success' ? <RequestState status={status} error={error} onRetry={refresh} /> : (
          <div className="soft-card classes-card">
            <div className="classes-toolbar">
              <h3 id="classes-table-heading">All classes &amp; shifts</h3>
              <div className="classes-search"><Search size={16} aria-hidden="true" />
                <label className="dashboard-sr-only" htmlFor="class-search">Search admission classes</label>
                <input id="class-search" type="search" value={query} onChange={(event) => setSearch({ revision, query: event.target.value })} placeholder="Search class or shift…" />
              </div>
            </div>
            {classes.length === 0 ? <div className="dashboard-empty"><h3>No admission classes yet</h3>
              <p>Create an admission class to start tracking seats.</p><CreateClassButton /></div>
              : filtered.length === 0 ? <p className="classes-no-results">No classes match your search</p>
                : <ClassesTable classes={filtered} labelledBy="classes-table-heading" />}
          </div>
        )}
      </div>
    </section>
  )
}
