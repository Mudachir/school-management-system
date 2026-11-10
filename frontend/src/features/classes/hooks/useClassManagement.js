import { useContext } from 'react'
import { CreateClassContext } from '../context/CreateClassContext.js'

export function useClassManagement() {
  return useContext(CreateClassContext)
}
