import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'
import { getDashboardAnnouncement } from '../model/dashboardAnnouncement.js'

export default function DashboardAnnouncement({ status, classCount }) {
  return <LiveAnnouncement message={getDashboardAnnouncement(status, classCount)} />
}
