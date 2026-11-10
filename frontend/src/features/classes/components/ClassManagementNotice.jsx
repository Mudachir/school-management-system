import { useClassManagement } from '../hooks/useClassManagement.js'

export default function ClassManagementNotice() {
  const { notice } = useClassManagement()
  return <p className={notice ? 'classes-notice' : 'dashboard-sr-only'} role="status" aria-live="polite" aria-atomic="true">{notice}</p>
}
