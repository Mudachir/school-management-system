import { formatCount } from '../model/formatCount.js'

export default function MetricCard({ label, value, caption, icon: Icon, tone = 'classes', className = '' }) {
  return (
    <article className={`soft-card dashboard-metric ${className}`}>
      <div className="dashboard-metric-top">
        <h3>{label}</h3>
        {Icon && <span className={`dashboard-metric-icon dashboard-tone-${tone}`}>
          <Icon size={21} aria-hidden="true" />
        </span>}
      </div>
      <p className="dashboard-metric-value">{formatCount(value)}</p>
      {caption && <p className="dashboard-metric-caption">{caption}</p>}
    </article>
  )
}
