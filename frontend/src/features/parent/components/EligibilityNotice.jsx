import { Link } from 'react-router-dom'
import { useParentData } from '../hooks/useParentData.js'

export default function EligibilityNotice() {
  const { eligibility, status, verify } = useParentData()
  if (eligibility.allowed) return null
  return <div className="parent-notice"><p>{eligibility.message}</p>
    {eligibility.confirmed && <Link className="text-link" to="/parent/applications">My Applications</Link>}
    {status === 'error' && <button className="button button-secondary" onClick={() => verify().catch(() => {})}>Retry status check</button>}
    {status === 'idle' && <Link className="text-link" to="/parent">Enter student number</Link>}
  </div>
}
