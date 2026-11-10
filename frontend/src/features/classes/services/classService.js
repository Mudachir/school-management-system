import { apiClient } from '../../../api/client.js'

const seatFields = ['totalSeats', 'heldSeats', 'confirmedSeats', 'availableSeats']

export async function getClasses({ signal } = {}) {
  const response = await apiClient('/classes', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`Unable to load admission classes (HTTP ${response.status}).`)
  }

  const classes = await response.json()
  if (!Array.isArray(classes) || classes.some((item) => (
    !item || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' ||
    seatFields.some((field) => !Number.isSafeInteger(item[field]) || item[field] < 0)
  ))) {
    throw new Error('The admission service returned invalid class data.')
  }

  return classes
}
