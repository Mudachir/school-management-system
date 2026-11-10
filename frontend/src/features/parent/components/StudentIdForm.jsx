import { useStudentSelection } from '../hooks/useStudentSelection.js'
import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'

export default function StudentIdForm({ onSelected }) {
  const { value, error, update, submit } = useStudentSelection()
  return <>
    <form className="parent-student-form" noValidate onSubmit={(event) => { event.preventDefault(); if (submit()) onSelected() }}>
      <label htmlFor="student-number">Student Birth Registration Number</label>
      <div className="parent-student-input-row"><input id="student-number" type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{17}" maxLength={17} value={value} placeholder="17-digit Birth Registration Number" required
        aria-invalid={Boolean(error)} aria-describedby={error ? 'student-number-error student-number-help' : 'student-number-help'} onChange={(event) => update(event.target.value)} />
        <button className="button button-primary" type="submit">Continue</button></div>
      <small id="student-number-help">Use exactly 17 digits. This selects a student for this browser tab; it does not verify identity.</small>
      {error && <p id="student-number-error" className="parent-form-error">{error}</p>}
    </form>
    <LiveAnnouncement message={error} />
  </>
}
