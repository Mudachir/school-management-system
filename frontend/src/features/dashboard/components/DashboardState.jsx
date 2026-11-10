import { CircleAlert, LoaderCircle } from 'lucide-react'

export default function DashboardState({ status, error, onRetry }) {
  const isError = status === 'error'

  return (
    <div className="soft-card dashboard-state">
      {isError ? <CircleAlert size={28} aria-hidden="true" /> : <LoaderCircle className="dashboard-spinner" size={28} aria-hidden="true" />}
      <h3>{isError ? 'Unable to load admission classes' : 'Loading admission classes…'}</h3>
      <p>{isError ? error : 'Retrieving the latest class capacity and admission totals.'}</p>
      {isError && <button type="button" className="button button-primary" onClick={onRetry}>Retry</button>}
    </div>
  )
}
