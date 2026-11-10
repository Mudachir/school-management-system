import { useEffect, useRef } from 'react'
import LiveAnnouncement from '../../../components/ui/LiveAnnouncement.jsx'

export default function CancelApplicationDialog({ application, isPending, error, onClose, onConfirm }) {
  const dialog = useRef(null)
  const keepButton = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const previousOverflow = document.body.style.overflow
    const element = dialog.current
    document.body.style.overflow = 'hidden'
    element.showModal(); keepButton.current.focus()
    return () => {
      element.close(); document.body.style.overflow = previousOverflow
      requestAnimationFrame(() => { if (previous?.isConnected && !previous.disabled) previous.focus(); else document.getElementById('parent-content')?.focus() })
    }
  }, [])
  useEffect(() => { if (isPending) dialog.current.focus() }, [isPending])
  return <dialog ref={dialog} className="soft-card parent-dialog" tabIndex={-1} aria-modal="true" aria-labelledby="cancel-application-title" aria-describedby="cancel-application-description"
    onCancel={(event) => { event.preventDefault(); if (!isPending) onClose() }}
    onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!isPending) onClose(); return }
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
      const first = controls[0], last = controls.at(-1)
      if (!first) { event.preventDefault(); event.currentTarget.focus() }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus() }
    }}>
    <h2 id="cancel-application-title">Cancel this application?</h2>
    <p id="cancel-application-description">This will release the seat for {application.className}, including an already confirmed seat. You can browse classes again afterwards.</p>
    <LiveAnnouncement message={isPending ? 'Cancelling application.' : error} />
    {error && <p className="parent-form-error">{error}</p>}
    <div className="parent-actions" aria-busy={isPending}><button ref={keepButton} className="button button-secondary" onClick={onClose} disabled={isPending}>Keep application</button><button className="button button-primary" onClick={onConfirm} disabled={isPending}>{isPending ? 'Cancelling…' : 'Cancel application'}</button></div>
  </dialog>
}
