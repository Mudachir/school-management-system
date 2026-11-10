import { getSeatDistribution } from '../model/dashboardSummary.js'
import { formatCount } from '../model/formatCount.js'

export default function SeatOccupancy({ summary }) {
  const distribution = getSeatDistribution(summary)
  const segments = [
    { key: 'confirmed', label: 'Confirmed', count: summary.confirmedSeats },
    { key: 'held', label: 'Held', count: summary.heldSeats },
    { key: 'available', label: 'Available', count: summary.availableSeats },
  ]

  return (
    <section className="soft-card dashboard-occupancy" aria-labelledby="occupancy-heading">
      <div className="dashboard-occupancy-heading">
        <div>
          <h3 id="occupancy-heading">Seat occupancy overview</h3>
          <p>Distribution of all admission seats</p>
        </div>
        <span className="dashboard-occupancy-percent">{summary.occupiedPercentage}% occupied</span>
      </div>
      <div className="dashboard-occupancy-bar" role="img"
        aria-label={`${formatCount(summary.totalSeats)} total seats: ${segments.map((segment) => `${formatCount(segment.count)} ${segment.label.toLowerCase()}`).join(', ')}. ${summary.occupiedPercentage}% occupied.`}>
        {segments.map(({ key }) => (
          <span key={key} className={`dashboard-bar-${key}`} style={{ width: `${distribution[key]}%` }} />
        ))}
      </div>
      {summary.totalSeats === 0 && <p className="dashboard-zero-capacity">No seat capacity to display.</p>}
      <dl className="dashboard-occupancy-legend">
        {segments.map(({ key, label, count }) => (
          <div key={key}>
            <dt className={`dashboard-seat-label dashboard-seat-${key}`}>{label}</dt>
            <dd>{formatCount(count)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
