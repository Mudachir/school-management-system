import { useState } from 'react'
import { useClasses } from '../../classes/hooks/useClasses.js'
import { CLASS_LEVELS } from '../../classes/helpers/className.js'
import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'
import RequestState from '../../../components/ui/RequestState.jsx'
import RefreshNotice from '../../../components/ui/RefreshNotice.jsx'
import ParentIntro from '../components/ParentIntro.jsx'
import AdmissionClassCard from '../components/AdmissionClassCard.jsx'
import { classMetadata, filterParentClasses } from '../helpers/classFilters.js'

export default function BrowseClassesPage() {
  const { classes, status, error, refresh, isLoading, refreshError } = useClasses()
  const [level, setLevel] = useState('')
  const [shift, setShift] = useState('')
  const filtered = classes ? filterParentClasses(classes, level, shift) : []
  const levels = [...CLASS_LEVELS, 'Other'].filter((option) => classes?.some((item) => classMetadata(item.name).level === option))
  return <>
    <ParentIntro eyebrow="Explore" title="Browse classes">Explore Play through Class 10. Filter by level or shift to find the best fit.</ParentIntro>
    <RefreshNotice error={refreshError} onRetry={refresh} />
    <LiveAnnouncement message={isLoading ? 'Loading classes.' : status === 'error' ? 'Unable to load classes. Please retry.' : `${filtered.length} class options shown.`} />
    <div aria-busy={isLoading}>{status !== 'success' ? <RequestState status={status} error={error} onRetry={refresh} /> : <>
      <div className="soft-card parent-filters"><label>Class level<select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">All classes</option>{levels.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label>Shift<select value={shift} onChange={(event) => setShift(event.target.value)}><option value="">All shifts</option>{['Morning','Day','Other'].map((option) => <option key={option}>{option}</option>)}</select></label></div>
      <div className="parent-options-heading"><h3>Available options</h3><button className="text-link" onClick={refresh}>Refresh classes</button></div>
      {filtered.length ? <div className="parent-class-grid">{filtered.map((item) => <AdmissionClassCard key={item.id} admissionClass={item} />)}</div>
        : <div className="soft-card parent-panel"><h3>{classes.length ? 'No classes match these filters' : 'No admission classes yet'}</h3><p>Please try other filters or check again later.</p></div>}
    </>}</div>
  </>
}
