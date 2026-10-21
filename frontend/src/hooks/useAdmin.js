import { useContext } from 'react'
import { AdminContext } from '../context/AdminContext.jsx'

export function useAdmin() {
  const context = useContext(AdminContext)
  return context || null
}
