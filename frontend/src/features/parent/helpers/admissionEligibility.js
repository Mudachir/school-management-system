import { isStudentId } from './student.js'

export function admissionEligibility({ studentId, status, applications }) {
  if (!isStudentId(studentId)) return { allowed: false, message: 'Enter a valid 17-digit Student Birth Registration Number on Welcome to hold a seat.' }
  if (status === 'loading' || status === 'idle') return { allowed: false, message: 'Checking existing applications…' }
  if (status !== 'success' || !Array.isArray(applications) || applications.some((item) => !item || !['HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED'].includes(item.status))) return { allowed: false, message: 'Application status could not be verified. Retry the status check before proceeding.' }
  const confirmed = applications.find((item) => item.status === 'CONFIRMED')
  return confirmed
    ? { allowed: false, confirmed, message: `Admission already confirmed for ${confirmed.className}.` }
    : { allowed: true, message: '' }
}
