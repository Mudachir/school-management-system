import { useEffect, useRef } from 'react'
import { LoaderCircle, SquarePlus, X } from 'lucide-react'
import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'
import { useCreateClass } from '../hooks/useCreateClass.js'
import { CLASS_LEVELS, SHIFTS, MAX_SEATS, generatedClassName } from '../helpers/className.js'

export default function CreateClassModal({ onClose, onCreated }) {
  const dialog = useRef(null)
  const firstField = useRef(null)
  const { values, errors, error, isSubmitting, update, submit } = useCreateClass()
  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const element = dialog.current
    element.showModal()
    firstField.current.focus()
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
      requestAnimationFrame(() => {
        if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus()
        else document.getElementById('main-content')?.focus()
      })
    }
  }, [])
  useEffect(() => { if (isSubmitting) dialog.current.focus() }, [isSubmitting])

  async function handleSubmit(event) {
    event.preventDefault()
    const created = await submit()
    if (created) onCreated(created)
    else requestAnimationFrame(() => dialog.current?.querySelector('[aria-invalid="true"]')?.focus())
  }

  return (
    <dialog ref={dialog} className="create-class-dialog soft-card" aria-modal="true" aria-labelledby="create-class-title" aria-describedby="create-class-description" tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (!isSubmitting) onClose()
          return
        }
        if (event.key !== 'Tab') return
        const controls = [...event.currentTarget.querySelectorAll('button, select, input')].filter((element) => !element.matches(':disabled'))
        const first = controls[0]
        const last = controls.at(-1)
        if (!first) { event.preventDefault(); event.currentTarget.focus() }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}
      onCancel={(event) => { event.preventDefault(); if (!isSubmitting) onClose() }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.target === event.currentTarget && !isSubmitting && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose()
      }}>
      <button type="button" className="dialog-close" aria-label="Close create class form" onClick={onClose} disabled={isSubmitting}><X size={19} aria-hidden="true" /></button>
      <span className="placeholder-icon"><SquarePlus size={22} aria-hidden="true" /></span>
      <h2 id="create-class-title">Create Admission Class</h2>
      <p id="create-class-description" className="dashboard-subtitle">Set up a class or shift and define its seat capacity.</p>
      <LiveAnnouncement message={isSubmitting ? 'Creating admission class. Please wait.' : error || (Object.values(errors).some(Boolean) ? 'Check the highlighted fields.' : '')} />
      <form noValidate onSubmit={handleSubmit} aria-busy={isSubmitting}>
        <fieldset disabled={isSubmitting}>
          <div className="class-form-field"><label htmlFor="class-level">Class</label>
            <select ref={firstField} id="class-level" value={values.classLevel} onChange={(event) => update('classLevel', event.target.value)} required aria-invalid={Boolean(errors.classLevel)} aria-describedby={errors.classLevel ? 'class-level-error' : undefined}>
              <option value="">Select class</option>{CLASS_LEVELS.map((level) => <option key={level}>{level}</option>)}
            </select>{errors.classLevel && <p className="class-form-error" id="class-level-error">{errors.classLevel}</p>}</div>
          <div className="class-form-field"><label htmlFor="class-shift">Shift</label>
            <select id="class-shift" value={values.shift} onChange={(event) => update('shift', event.target.value)} required aria-invalid={Boolean(errors.shift)} aria-describedby={errors.shift ? 'class-shift-error' : undefined}>
              <option value="">Select shift</option>{SHIFTS.map((shift) => <option key={shift}>{shift}</option>)}
            </select>{errors.shift && <p className="class-form-error" id="class-shift-error">{errors.shift}</p>}</div>
          <div className="class-form-field"><label htmlFor="class-total-seats">Total Seats</label>
            <input id="class-total-seats" type="number" min="1" max={MAX_SEATS} step="1" inputMode="numeric" value={values.totalSeats} onChange={(event) => update('totalSeats', event.target.value)} required aria-invalid={Boolean(errors.totalSeats)} aria-describedby={errors.totalSeats ? 'class-seats-error' : undefined} />
            {errors.totalSeats && <p className="class-form-error" id="class-seats-error">{errors.totalSeats}</p>}</div>
        </fieldset>
        {generatedClassName(values.classLevel, values.shift) && <p className="class-name-preview">Class name: <strong>{generatedClassName(values.classLevel, values.shift)}</strong></p>}
        {error && <p className="class-form-error class-submit-error">{error}</p>}
        <div className="class-form-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={isSubmitting}>{isSubmitting && <LoaderCircle size={16} className="dashboard-spinner" aria-hidden="true" />}{isSubmitting ? 'Creating…' : 'Create Class'}</button>
        </div>
      </form>
    </dialog>
  )
}
