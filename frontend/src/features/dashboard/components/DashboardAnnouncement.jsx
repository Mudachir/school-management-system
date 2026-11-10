import { useEffect, useState } from 'react'
import { getDashboardAnnouncement } from '../model/dashboardAnnouncement.js'

export default function DashboardAnnouncement({ status, classCount }) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Mount the empty live region before inserting its initial announcement.
    const frame = requestAnimationFrame(() => setIsReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <p className="dashboard-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {isReady ? getDashboardAnnouncement(status, classCount) : ''}
    </p>
  )
}
