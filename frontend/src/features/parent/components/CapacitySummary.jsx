import { formatCount } from '../../dashboard/model/formatCount.js'

export default function CapacitySummary({ admissionClass }) {
  return <dl className="parent-capacity">{[['Total seats','totalSeats'],['Held','heldSeats'],['Confirmed','confirmedSeats'],['Available','availableSeats']].map(([label,field]) =>
    <div key={field}><dt>{label}</dt><dd>{formatCount(admissionClass[field])}</dd></div>)}</dl>
}
