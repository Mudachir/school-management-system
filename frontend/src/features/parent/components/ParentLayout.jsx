import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import StudentProvider from '../context/StudentProvider.jsx'
import ParentDataProvider from '../context/ParentDataProvider.jsx'
import { useStudent } from '../hooks/useStudent.js'
import '../parent.css'

export default function ParentLayout() {
  return <StudentProvider><ParentSession /></StudentProvider>
}
function ParentSession() {
  const { version } = useStudent()
  return <ParentDataProvider key={version}><ParentShell /></ParentDataProvider>
}
function ParentShell() {
  const { studentId, selectStudent } = useStudent()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => { document.getElementById('parent-content')?.focus() }, [pathname])
  return <div className="parent-portal">
    <title>Parent Portal | School Admission System</title>
    <a className="skip-link" href="#parent-content">Skip to content</a>
    <aside className="parent-sidebar" aria-label="Parent portal">
      <div className="parent-brand"><span>S</span><div>School Admission<strong>Parent Portal</strong></div></div>
      <nav aria-label="Parent navigation">
        <NavLink to="/parent" end>Welcome</NavLink><NavLink to="/parent/classes">Browse Classes</NavLink><NavLink to="/parent/applications">My Applications</NavLink>
      </nav>
      <p className="parent-footer">Explore classes and manage admission requests.</p>
    </aside>
    <div className="parent-workspace">
      <header className="parent-header"><div><h1>Parent Portal</h1><p>School admission overview</p></div>
        <div className="parent-header-student"><span className="parent-student-pill">{studentId ? `Student •••••••••••••${studentId.slice(-4)}` : 'No student selected'}</span>
          {studentId && <button className="text-link" type="button" onClick={() => { selectStudent(''); navigate('/parent', { replace: true }) }}>Change Student</button>}</div>
      </header>
      <main id="parent-content" className="parent-content" tabIndex={-1}><Outlet /></main>
    </div>
  </div>
}
