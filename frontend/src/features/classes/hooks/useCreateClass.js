import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { createClass } from '../services/classService.js'
import { validateClassForm } from '../helpers/className.js'

export function useCreateClass() {
  const [values, setValues] = useState({ classLevel: '', shift: '', totalSeats: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const request = useRef(null)
  const mounted = useRef(false)
  const shouldBlock = useCallback(() => Boolean(request.current), [])
  const blocker = useBlocker(shouldBlock)
  useEffect(() => { if (blocker.state === 'blocked') blocker.reset() }, [blocker])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; request.current?.abort() }
  }, [])

  function update(field, value) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
    setError('')
  }

  async function submit() {
    if (request.current) return null
    const validated = validateClassForm(values)
    setErrors(validated.errors)
    setError('')
    if (!validated.payload) return null
    const controller = new AbortController()
    request.current = controller
    setSubmitting(true)
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const created = await createClass(validated.payload, { signal: controller.signal })
      return mounted.current ? created : null
    } catch (failure) {
      if (mounted.current) {
        const seatErrors = Object.entries(failure.fields ?? {}).find(([key]) => key.toLowerCase() === 'totalseats')?.[1]
        if (Array.isArray(seatErrors)) setErrors({ totalSeats: seatErrors.join(' ') })
        const nameErrors = Object.entries(failure.fields ?? {}).find(([key]) => key.toLowerCase() === 'name')?.[1]
        setError(failure.status === 400 || failure.status === 409
          ? [failure.message, ...(Array.isArray(nameErrors) ? nameErrors : [])].join(' ')
          : 'Could not confirm creation. Refresh the class list before retrying, as the request may have reached the server.')
      }
      return null
    } finally {
      clearTimeout(timeout)
      request.current = null
      if (mounted.current) setSubmitting(false)
    }
  }
  return { values, errors, error, isSubmitting, update, submit }
}
