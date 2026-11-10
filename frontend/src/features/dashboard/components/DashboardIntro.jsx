import { Plus, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'

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
        <Link className="button button-primary dashboard-create" to="/admin/classes/new">
          <Plus size={16} aria-hidden="true" /> Create Admission Class
        </Link>
      </div>
    </div>
  )
}
