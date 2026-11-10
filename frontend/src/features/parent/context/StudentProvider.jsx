import { useCallback, useRef, useState } from 'react'
import { StudentContext } from './StudentContext.js'
import { isStudentId, readStudent, saveStudent } from '../helpers/student.js'

function sessionStorageOrNull() {
  try { return window.sessionStorage } catch { return null }
}

export default function StudentProvider({ children }) {
  const [session, setSession] = useState(() => ({ studentId: readStudent(sessionStorageOrNull()), version: 0 }))
  const current = useRef(session)
  const requests = useRef(new Set())
  const registerRequest = useCallback((controller) => {
    requests.current.add(controller)
    return () => requests.current.delete(controller)
  }, [])
  const isCurrent = useCallback(() => current.current === session, [session])
  function selectStudent(studentId) {
    if (studentId !== '' && !isStudentId(studentId)) return false
    for (const controller of requests.current) controller.abort()
    requests.current.clear()
    const next = { studentId, version: current.current.version + 1 }
    current.current = next
    saveStudent(sessionStorageOrNull(), studentId)
    setSession(next)
    return true
  }
  return <StudentContext.Provider value={{ ...session, selectStudent, registerRequest, isCurrent }}>{children}</StudentContext.Provider>
}
