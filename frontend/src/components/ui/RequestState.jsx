import { CircleAlert, LoaderCircle } from 'lucide-react'

export default function RequestState({ status, error, onRetry, subject = 'admission classes', title }) {
  const isError = status === 'error'
  return (
    <div className="soft-card dashboard-state">
      {isError ? <CircleAlert size={28} aria-hidden="true" /> : <LoaderCircle className="dashboard-spinner" size={28} aria-hidden="true" />}
      <h3>{title ?? (isError ? `Unable to load ${subject}` : `Loading ${subject}…`)}</h3>
      <p>{isError ? (error?.message ?? error ?? 'Check your connection and try again.') : 'Retrieving the latest class capacity and admission totals.'}</p>
      {isError && onRetry && <button type="button" className="button button-primary" onClick={onRetry}>Retry</button>}
    </div>
  )
}
