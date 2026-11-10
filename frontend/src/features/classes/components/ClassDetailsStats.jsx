import MetricCard from '../../dashboard/components/MetricCard.jsx'

export default function ClassDetailsStats({ admissionClass }) {
  return (
    <div className="dashboard-metrics class-details-stats">
      <MetricCard label="Total Seat Capacity" value={admissionClass.totalSeats} />
      <MetricCard label="Held Seats" value={admissionClass.heldSeats} className="class-details-held" />
      <MetricCard label="Confirmed Seats" value={admissionClass.confirmedSeats} className="class-details-confirmed" />
      <MetricCard label="Available Seats" value={admissionClass.availableSeats} className="class-details-available" />
    </div>
  )
}
