import { RefreshCw } from 'lucide-react'
import CreateClassButton from '../../classes/components/CreateClassButton.jsx'

export default function DashboardIntro({ onRefresh, isLoading }) {
  return (
    <div className="dashboard-intro">
      <div>
        <p className="eyebrow">Admission overview</p>
        <h2 id="dashboard-heading">A clear view of every seat.</h2>
        <p className="dashboard-subtitle">Monitor class capacity and admissions at a glance.</p>
      </div>
      <div className="dashboard-actions">
        <button type="button" className="button dashboard-refresh" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </button>
        <CreateClassButton className="dashboard-create" />
      </div>
    </div>
  )
}
