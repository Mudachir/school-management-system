import { useStudent } from '../hooks/useStudent.js'
import { expiryLabel } from '../helpers/countdown.js'

export default function HoldSummary({ hold }) {
  const { studentId } = useStudent()
  return <dl className="parent-summary">
    <div><dt>Class</dt><dd>{hold.className}</dd></div>
    <div><dt>Student Birth Registration Number</dt><dd>{studentId}</dd></div>
    <div><dt>Hold ID</dt><dd>{hold.holdId}</dd></div>
    <div><dt>{hold.status === 'HELD' ? 'Hold expires' : 'Original hold expiry'}</dt><dd><time dateTime={hold.expiresAt}>{expiryLabel(hold.expiresAt)}</time></dd></div>
  </dl>
}
