export const STUDENT_STORAGE_KEY = 'school-admission.active-student'
export const isStudentId = (value) => typeof value === 'string' && /^\d{17}$/.test(value)

export function readStudent(storage) {
  try {
    const value = storage.getItem(STUDENT_STORAGE_KEY)
    return isStudentId(value) ? value : ''
  } catch { return '' }
}

export function saveStudent(storage, value) {
  try {
    if (isStudentId(value)) storage.setItem(STUDENT_STORAGE_KEY, value)
    else storage.removeItem(STUDENT_STORAGE_KEY)
    return true
  } catch { return false }
}
