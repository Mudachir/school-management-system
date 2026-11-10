import { Link } from 'react-router-dom'
import { classMetadata } from '../helpers/classFilters.js'
import { formatCount } from '../../dashboard/model/formatCount.js'

export default function AdmissionClassCard({ admissionClass: item }) {
  const metadata = classMetadata(item.name)
  return <article className="soft-card parent-class-card">
    <header><h3>{metadata.level === 'Other' ? item.name : metadata.level}</h3><span className="parent-shift">{metadata.shift}</span></header>
    <p className="parent-class-counts">Total {formatCount(item.totalSeats)} · Held {formatCount(item.heldSeats)} · Confirmed {formatCount(item.confirmedSeats)}</p>
    <p className={`parent-available${item.availableSeats > 0 ? '' : ' is-full'}`}>{item.availableSeats > 0 ? `${formatCount(item.availableSeats)} seats available` : 'Full — no seats available'}</p>
    <Link className="button button-secondary" to={`/parent/classes/${item.id}`} aria-label={`View class details for ${item.name}`}>View class details</Link>
  </article>
}
