import { Outlet, useMatches } from 'react-router-dom'
import AdminHeader from './AdminHeader.jsx'
import AdminSidebar from './AdminSidebar.jsx'
import './admin.css'
import ClassManagementProvider from '../../features/classes/context/ClassManagementProvider.jsx'
import ClassManagementNotice from '../../features/classes/components/ClassManagementNotice.jsx'

export default function AdminLayout() {
  return <ClassManagementProvider><AdminLayoutContent /></ClassManagementProvider>
}

function AdminLayoutContent() {
  const matches = useMatches()
  const title = matches.at(-1)?.handle?.title ?? 'School Admission'

  return (
    <div className="admin-layout">
      <title>{`${title} | School Admission System`}</title>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <AdminSidebar />
      <div className="admin-workspace">
        <AdminHeader title={title} />
        <main id="main-content" className="admin-content" tabIndex={-1}>
          <ClassManagementNotice />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
