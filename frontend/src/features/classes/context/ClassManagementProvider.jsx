import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ClassDataContext } from './ClassDataContext.js'
import { CreateClassContext } from './CreateClassContext.js'
import CreateClassModal from '../components/CreateClassModal.jsx'
import '../classes.css'

export default function ClassManagementProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const isOpen = new URLSearchParams(location.search).get('create') === 'class'
  function openCreate() {
    if (isOpen) return
    setNotice('')
    const search = new URLSearchParams(location.search)
    search.set('create', 'class')
    navigate({ pathname: location.pathname, search: search.toString() }, { state: { createModalEntry: true } })
  }
  function closeCreate() {
    if (location.state?.createModalEntry) navigate(-1)
    else {
      const search = new URLSearchParams(location.search)
      search.delete('create')
      navigate({ pathname: location.pathname, search: search.toString() }, { replace: true })
    }
  }
  function created(item) {
    setRevision((value) => value + 1)
    setNotice(`Created ${item.name} with ${item.totalSeats.toLocaleString('en')} seats.`)
    navigate('/admin/classes', { replace: true })
  }
  return (
    <ClassDataContext.Provider value={revision}>
      <CreateClassContext.Provider value={{ isOpen, openCreate, notice }}>
        {children}
        {isOpen && <CreateClassModal onClose={closeCreate} onCreated={created} />}
      </CreateClassContext.Provider>
    </ClassDataContext.Provider>
  )
}
