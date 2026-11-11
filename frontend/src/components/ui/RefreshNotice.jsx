import './refresh-notice.css'

export default function RefreshNotice({ error, onRetry }) {
  if (!error) return null
  return <div className="soft-card refresh-notice" role="status">
    <p>{error.message ?? error} Last loaded data is shown and may be out of date.</p>
    <button type="button" className="text-link" onClick={onRetry}>Retry refresh</button>
  </div>
}
