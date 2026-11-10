import { ArrowLeft, Construction } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function MilestonePlaceholder({ title, milestone, description, backToClasses = false }) {
  return (
    <>
      {backToClasses && (
        <Link className="text-link back-link" to="/admin/classes">
          <ArrowLeft size={16} aria-hidden="true" /> Back to classes
        </Link>
      )}
      <section className="soft-card placeholder" aria-labelledby="placeholder-title">
        <span className="placeholder-icon"><Construction size={22} aria-hidden="true" /></span>
        <p className="eyebrow">Coming in {milestone}</p>
        <h2 id="placeholder-title">{title}</h2>
        <p className="placeholder-description">{description}</p>
      </section>
    </>
  )
}
