import { Plus } from 'lucide-react'
import { useClassManagement } from '../hooks/useClassManagement.js'

export default function CreateClassButton({ className = '' }) {
  const { openCreate, isOpen } = useClassManagement()
  return <button type="button" className={`button button-primary ${className}`} onClick={openCreate} aria-haspopup="dialog" aria-expanded={isOpen}>
    <Plus size={16} aria-hidden="true" /> Create Admission Class
  </button>
}
