import { useEffect, useState } from 'react'

export default function LiveAnnouncement({ message }) {
  const [isReady, setIsReady] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  return <p className="dashboard-sr-only" role="status" aria-live="polite" aria-atomic="true">{isReady ? message : ''}</p>
}
