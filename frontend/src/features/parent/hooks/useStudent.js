import { useContext } from 'react'
import { StudentContext } from '../context/StudentContext.js'

export function useStudent() { return useContext(StudentContext) }
