export const CLASS_LEVELS = ['Play', 'Nursery', 'KG', ...Array.from({ length: 10 }, (_, index) => `Class ${index + 1}`)]
export const SHIFTS = ['Morning', 'Day']
export const MAX_SEATS = 2147483647

export function generatedClassName(classLevel, shift) {
  return CLASS_LEVELS.includes(classLevel) && SHIFTS.includes(shift) ? `${classLevel} - ${shift} Shift` : ''
}

export function validateClassForm({ classLevel, shift, totalSeats }) {
  const errors = {}
  if (!CLASS_LEVELS.includes(classLevel)) errors.classLevel = 'Select a class.'
  if (!SHIFTS.includes(shift)) errors.shift = 'Select a shift.'
  const seats = Number(String(totalSeats).trim())
  if (!String(totalSeats).trim() || !Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
    errors.totalSeats = `Enter a whole number of seats between 1 and ${MAX_SEATS.toLocaleString('en')}.`
  }
  return { errors, payload: Object.keys(errors).length ? null : { name: generatedClassName(classLevel, shift), totalSeats: seats } }
}
