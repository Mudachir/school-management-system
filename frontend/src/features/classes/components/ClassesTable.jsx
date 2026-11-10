import { Link } from 'react-router-dom'
import { formatCount } from '../../dashboard/model/formatCount.js'
import '../classes.css'

export default function ClassesTable({ classes, labelledBy }) {
  return (
    <div className="dashboard-table-scroll" role="region" aria-labelledby={labelledBy} tabIndex={0}>
      <table className="dashboard-class-table">
        <caption className="dashboard-sr-only">Seat capacity and current admissions for all classes</caption>
        <thead><tr>
          <th scope="col">Class / Shift Name</th><th scope="col">Total Seats</th>
          <th scope="col">Held Seats</th><th scope="col">Confirmed Seats</th>
          <th scope="col">Available Seats</th><th scope="col">Actions</th>
        </tr></thead>
        <tbody>{classes.map((item) => (
          <tr key={item.id}>
            <th scope="row">{item.name}</th><td>{formatCount(item.totalSeats)}</td>
            <td><span className="dashboard-seat-label dashboard-seat-held">{formatCount(item.heldSeats)}</span></td>
            <td><span className="dashboard-seat-label dashboard-seat-confirmed">{formatCount(item.confirmedSeats)}</span></td>
            <td><span className="dashboard-seat-label dashboard-seat-available">{formatCount(item.availableSeats)}</span></td>
            <td><Link className="dashboard-details-link" to={`/admin/classes/${encodeURIComponent(item.id)}`}
              aria-label={`View details for ${item.name}`}>View Details</Link></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
