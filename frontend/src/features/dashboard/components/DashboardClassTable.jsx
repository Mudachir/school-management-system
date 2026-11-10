import { ArrowRight, Layers3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCount } from '../model/formatCount.js'

export default function DashboardClassTable({ classes }) {
  return (
    <section className="dashboard-class-section" aria-labelledby="dashboard-classes-heading">
      <div className="dashboard-table-heading">
        <h2 id="dashboard-classes-heading">Admission classes</h2>
        <Link className="text-link" to="/admin/classes">
          View all classes <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {classes.length === 0 ? (
        <div className="soft-card dashboard-empty">
          <Layers3 size={28} aria-hidden="true" />
          <h3>No admission classes yet</h3>
          <p>Create an admission class to start tracking seats and admissions.</p>
        </div>
      ) : (
        <div className="dashboard-table-scroll" role="region" aria-labelledby="dashboard-classes-heading" tabIndex={0}>
          <table className="dashboard-class-table">
            <caption className="dashboard-sr-only">Seat capacity and current admissions for all classes</caption>
            <thead>
              <tr>
                <th scope="col">Class / Shift Name</th>
                <th scope="col">Total Seats</th>
                <th scope="col">Held Seats</th>
                <th scope="col">Confirmed Seats</th>
                <th scope="col">Available Seats</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.name}</th>
                  <td>{formatCount(item.totalSeats)}</td>
                  <td><span className="dashboard-seat-label dashboard-seat-held">{formatCount(item.heldSeats)}</span></td>
                  <td><span className="dashboard-seat-label dashboard-seat-confirmed">{formatCount(item.confirmedSeats)}</span></td>
                  <td><span className="dashboard-seat-label dashboard-seat-available">{formatCount(item.availableSeats)}</span></td>
                  <td>
                    <Link className="dashboard-details-link" to={`/admin/classes/${encodeURIComponent(item.id)}`}
                      aria-label={`View details for ${item.name}`}>View Details</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
