import { Armchair, BadgeCheck, Clock3, Layers3 } from 'lucide-react'
import DashboardIntro from './components/DashboardIntro.jsx'
import DashboardState from './components/DashboardState.jsx'
import MetricCard from './components/MetricCard.jsx'
import SeatOccupancy from './components/SeatOccupancy.jsx'
import DashboardClassTable from './components/DashboardClassTable.jsx'
import DashboardAnnouncement from './components/DashboardAnnouncement.jsx'
import { useDashboardClasses } from './hooks/useDashboardClasses.js'
import { summarizeClasses } from './model/dashboardSummary.js'
import './dashboard.css'

export default function DashboardPage() {
  const { classes, status, error, refresh, isLoading } = useDashboardClasses()
  const summary = status === 'success' ? summarizeClasses(classes) : null

  return (
    <section className="dashboard" aria-labelledby="dashboard-heading">
      <DashboardIntro onRefresh={refresh} isLoading={isLoading} />
      <DashboardAnnouncement status={status} classCount={classes?.length ?? 0} />
      <div aria-busy={isLoading}>
        {summary ? (
          <>
            <div className="dashboard-metrics">
              <MetricCard label="Total Admission Classes" value={summary.classCount}
                caption="Active class / shift groups" icon={Layers3} />
              <MetricCard label="Total Seats" value={summary.totalSeats}
                caption="Across all admission classes" icon={Armchair} tone="seats" />
              <MetricCard label="Held Seats" value={summary.heldSeats}
                caption="Seats currently reserved" icon={Clock3} tone="held" />
              <MetricCard label="Confirmed Admissions" value={summary.confirmedSeats}
                caption="Seats with confirmed admission" icon={BadgeCheck} tone="confirmed" />
            </div>
            <SeatOccupancy summary={summary} />
            <DashboardClassTable classes={classes} />
          </>
        ) : (
          <DashboardState status={status} error={error} onRetry={refresh} />
        )}
      </div>
    </section>
  )
}
