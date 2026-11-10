import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <section className="soft-card placeholder" aria-labelledby="not-found-title">
      <p className="eyebrow">404</p>
      <h2 id="not-found-title">Page not found</h2>
      <p className="placeholder-description">The page you requested could not be found.</p>
      <Link className="button button-primary" to="/admin">Back to Dashboard</Link>
    </section>
  )
}
