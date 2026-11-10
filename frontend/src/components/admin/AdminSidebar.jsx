import { GraduationCap, Layers3, LayoutDashboard, SquarePlus } from 'lucide-react'
import { NavLink, useMatch } from 'react-router-dom'
import { useClassManagement } from '../../features/classes/hooks/useClassManagement.js'

export default function AdminSidebar() {
  const { openCreate, isOpen } = useClassManagement()
  const isCreateRoute = Boolean(useMatch('/admin/classes/new'))
  const isClassDetailsRoute = Boolean(useMatch('/admin/classes/:classId')) && !isCreateRoute

  return (
    <aside className="admin-sidebar" aria-label="Admin workspace">
      <div className="sidebar-brand">
        <span className="brand-icon"><GraduationCap size={23} aria-hidden="true" /></span>
        <div>
          <p className="brand-name">School Admission</p>
          <p className="brand-subtitle">SYSTEM / ADMIN</p>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Admin navigation">
        <NavLink to="/admin" end className="sidebar-link">
          <LayoutDashboard aria-hidden="true" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/admin/classes" end={!isClassDetailsRoute} className="sidebar-link">
          <Layers3 aria-hidden="true" />
          <span>Admission Classes</span>
        </NavLink>
        <button type="button" onClick={openCreate} className="sidebar-link sidebar-create" aria-haspopup="dialog" aria-expanded={isOpen}>
          <SquarePlus aria-hidden="true" />
          <span>Create Class</span>
        </button>
      </nav>

      <p className="sidebar-footer">ADMISSIONS WORKSPACE</p>
    </aside>
  )
}
