import { ArrowRight, Layers3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import ClassesTable from '../../classes/components/ClassesTable.jsx'

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
        <ClassesTable classes={classes} labelledBy="dashboard-classes-heading" />
      )}
    </section>
  )
}
