import { admissionEligibility } from '../helpers/admissionEligibility.js'
import { isStudentId } from '../helpers/student.js'
import { isClassId } from '../../classes/services/classService.js'
import { createHold, confirmHold, cancelHold, getMyApplications, getHold, HoldApiError } from './holdService.js'

function checkSignal(signal) { signal?.throwIfAborted() }

async function checkedApplications(studentId, options) {
  if (!isStudentId(studentId)) throw new HoldApiError(400, 'Enter a valid 17-digit Student Birth Registration Number on Welcome.')
  checkSignal(options.signal)
  const applications = await (options.readApplications ? options.readApplications({ fresh: true }) : getMyApplications(studentId, options))
  checkSignal(options.signal)
  if (!Array.isArray(applications)) throw new Error('Application status could not be verified. Please retry.')
  return applications
}

function requireEligibility(studentId, applications) {
  const eligibility = admissionEligibility({ studentId, status: 'success', applications })
  if (!eligibility.allowed) throw new HoldApiError(409, `${eligibility.message} View My Applications to manage your admission.`)
}

function ownedApplication(applications, holdId) {
  const item = applications.find((entry) => entry.holdId.toLowerCase() === holdId.toLowerCase())
  if (!item) throw new HoldApiError(404, 'This application was not found for the selected student. Check My Applications or change the student on Welcome.')
  return item
}

export async function createAdmissionHold(classId, studentId, options = {}) {
  const applications = await checkedApplications(studentId, options)
  requireEligibility(studentId, applications)
  return createHold(classId, studentId, options)
}

export async function getOwnedHold(holdId, studentId, options = {}) {
  if (!isClassId(holdId)) throw new HoldApiError(400, 'The Hold ID is not a valid UUID.')
  const applications = await checkedApplications(studentId, options)
  const application = ownedApplication(applications, holdId)
  const hold = await getHold(holdId, options)
  checkSignal(options.signal)
  if (hold.classId !== application.classId) throw new Error('Application details could not be verified. Please refresh.')
  return { ...hold, className: application.className }
}

export async function confirmAdmission(holdId, studentId, options = {}) {
  const applications = await checkedApplications(studentId, options)
  const application = ownedApplication(applications, holdId)
  if (application.status === 'CONFIRMED') return { holdId: application.holdId, status: 'CONFIRMED' }
  requireEligibility(studentId, applications)
  if (application.status !== 'HELD' || Date.parse(application.expiresAt) <= Date.now()) throw new HoldApiError(409, 'Only an unexpired held seat can be confirmed. Refresh My Applications.')
  return confirmHold(holdId, studentId, options)
}

export async function cancelAdmission(holdId, studentId, options = {}) {
  const applications = await checkedApplications(studentId, options)
  const application = ownedApplication(applications, holdId)
  if (application.status === 'CANCELLED') return
  if (!['HELD', 'CONFIRMED'].includes(application.status)) throw new HoldApiError(409, 'Expired applications cannot be cancelled. Refresh My Applications.')
  return cancelHold(holdId, studentId, options)
}
