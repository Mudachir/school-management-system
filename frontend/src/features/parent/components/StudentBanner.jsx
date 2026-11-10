import { Link } from 'react-router-dom'
import { useStudent } from '../hooks/useStudent.js'

export default function StudentBanner() {
  const { studentId } = useStudent()
  return <div className="soft-card parent-student-banner">{studentId ? <><p>Student Birth Registration Number</p><strong>{studentId}</strong></>
    : <p>Select a student on <Link className="text-link" to="/parent">Welcome</Link> to view or manage applications.</p>}</div>
}
