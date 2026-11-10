import { apiClient } from '../../../api/client.js'
import { isClassId } from '../../classes/services/classService.js'
import { isStudentId } from '../helpers/student.js'

export const HOLD_STATUSES = ['HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED']
export class HoldApiError extends Error {
  constructor(status, message) { super(message); this.name = 'HoldApiError'; this.status = status }
}
const validHold = (item) => item && isClassId(item.holdId) && isClassId(item.classId) && HOLD_STATUSES.includes(item.status) && Number.isFinite(Date.parse(item.expiresAt))

export async function holdRequest(path, { studentId, method = 'GET', signal } = {}) {
  if (studentId !== undefined && !isStudentId(studentId)) throw new HoldApiError(400, 'Enter a valid 17-digit Student Birth Registration Number.')
  const response = await apiClient(path, {
    method, signal, cache: 'no-store',
    headers: studentId === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'X-Student-Id': studentId },
  })
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new HoldApiError(response.status, problem?.title || `The admission request failed (HTTP ${response.status}).`)
  }
  return response
}

export async function getMyApplications(studentId, { signal } = {}) {
  const response = await holdRequest('/me/holds', { studentId, signal })
  const items = await response.json()
  if (!Array.isArray(items) || items.some((item) => !validHold(item) || typeof item.className !== 'string')) {
    throw new Error('Application status could not be verified. Please try again.')
  }
  return items
}

export async function getHold(holdId, { signal } = {}) {
  if (!isClassId(holdId)) throw new HoldApiError(400, 'The Hold ID is not a valid UUID.')
  const item = await (await holdRequest(`/holds/${holdId}`, { signal })).json()
  if (!validHold(item) || item.holdId.toLowerCase() !== holdId.toLowerCase()) throw new Error('The admission service returned invalid reservation data.')
  return item
}

export async function createHold(classId, studentId, { signal } = {}) {
  if (!isClassId(classId)) throw new HoldApiError(400, 'The class ID is not a valid UUID.')
  const response = await holdRequest(`/classes/${classId}/holds`, { method: 'POST', studentId, signal })
  const item = await response.json()
  if (response.status !== 201 || !validHold(item) || item.classId.toLowerCase() !== classId.toLowerCase() || item.studentId !== studentId || item.status !== 'HELD') throw new Error('The hold response could not be verified. Check My Applications before retrying.')
  return item
}

export async function confirmHold(holdId, studentId, { signal } = {}) {
  if (!isClassId(holdId)) throw new HoldApiError(400, 'The Hold ID is not a valid UUID.')
  const response = await holdRequest(`/holds/${holdId}/confirm`, { method: 'POST', studentId, signal })
  const item = await response.json()
  if (item?.holdId?.toLowerCase() !== holdId.toLowerCase() || item.status !== 'CONFIRMED') throw new Error('The confirmation response could not be verified. Check My Applications before retrying.')
  return item
}

export async function cancelHold(holdId, studentId, { signal } = {}) {
  if (!isClassId(holdId)) throw new HoldApiError(400, 'The Hold ID is not a valid UUID.')
  const response = await holdRequest(`/holds/${holdId}`, { method: 'DELETE', studentId, signal })
  if (response.status !== 204) throw new Error('The cancellation response could not be verified. Refresh My Applications.')
}
