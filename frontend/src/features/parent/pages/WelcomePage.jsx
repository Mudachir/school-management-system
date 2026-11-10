import { Link, useNavigate } from 'react-router-dom'
import ParentIntro from '../components/ParentIntro.jsx'
import StudentIdForm from '../components/StudentIdForm.jsx'
import { useStudent } from '../hooks/useStudent.js'

export default function WelcomePage() {
  const { studentId } = useStudent()
  const navigate = useNavigate()
  return <>
    <ParentIntro eyebrow="Welcome" title="A simpler start to their next chapter.">Browse available classes and manage admission requests in one place. You can explore classes before selecting a student.</ParentIntro>
    <div className="parent-welcome-grid">
      <section className="soft-card parent-panel"><h3>Select a student</h3><p>Enter the student’s Birth Registration Number to hold a seat or view applications.</p>
        <StudentIdForm onSelected={() => navigate('/parent/classes')} />
        {studentId && <p className="parent-active-student">Active student: <strong>{studentId}</strong></p>}
      </section>
      <aside className="soft-card parent-panel"><span className="parent-aside-icon" aria-hidden="true">✦</span><h3>Find the right class</h3><p>Compare Morning and Day shifts, see seat availability, and choose when you’re ready.</p><Link className="button button-secondary" to="/parent/classes">Browse classes</Link></aside>
    </div>
  </>
}
