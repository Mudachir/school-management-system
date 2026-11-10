import { apiClient } from '../../../api/client.js'

const seatFields = ['totalSeats', 'heldSeats', 'confirmedSeats', 'availableSeats']
export const isClassId = (value) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value ?? '')

export class ClassApiError extends Error {
  constructor(status, message, fields = {}) {
    super(message)
    this.name = 'ClassApiError'
    this.status = status
    this.fields = fields
  }
}

function isSummary(item) {
  return item && typeof item.id === 'string' && item.id && typeof item.name === 'string' &&
    seatFields.every((field) => Number.isSafeInteger(item[field]) && item[field] >= 0)
}

async function readResponse(response, action) {
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new ClassApiError(response.status,
      problem?.title || `Unable to ${action} (HTTP ${response.status}).`, problem?.errors ?? {})
  }
  return response.json()
}

export async function getClasses({ signal } = {}) {
  const response = await apiClient('/classes', {
    method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal,
  })
  const classes = await readResponse(response, 'load admission classes')
  if (!Array.isArray(classes) || classes.some((item) => !isSummary(item))) {
    throw new Error('The admission service returned invalid class data.')
  }
  return classes
}

export async function getClassById(classId, { signal } = {}) {
  if (!isClassId(classId)) throw new ClassApiError(400, 'The class ID is not a valid UUID.')
  const response = await apiClient(`/classes/${encodeURIComponent(classId)}`, {
    method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal,
  })
  const item = await readResponse(response, 'load class details')
  if (!isSummary(item) || item.id.toLowerCase() !== classId.toLowerCase()) {
    throw new Error('The admission service returned invalid class details.')
  }
  return item
}

export async function createClass(payload, { signal } = {}) {
  const response = await apiClient('/classes', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal,
  })
  const item = await readResponse(response, 'create admission class')
  if (response.status !== 201 || !isClassId(item?.id) || item.name !== payload.name || item.totalSeats !== payload.totalSeats) {
    throw new Error('Could not confirm creation. Refresh the class list before retrying.')
  }
  return item
}
