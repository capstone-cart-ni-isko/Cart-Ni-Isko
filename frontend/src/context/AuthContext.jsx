import { createContext, useState, useEffect } from 'react'

export const AuthContext = createContext(null)

const DEFAULT_USER = {
  firstName: '',
  lastName: '',
  fullName: '',
  email: '',
  phone: '',
  username: '',
  studentId: '',
  yearLevel: '',
  campus: '',
  college: '',
  course: '',
  bio: '',
  role: '',
  avatar: null,
  preferredContact: '',
}

const DEFAULT_ADDRESSES = []

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('isko_session')
    if (!saved) return null
    try {
      const session = JSON.parse(saved)
      // Self-heal: sessions created by the old mock/local login carry no
      // cust_id, so every backend call (wishlist, orders) would fail. Drop them
      // and force a real sign-in against the API.
      if (!session || session.cust_id === undefined || session.cust_id === null) {
        localStorage.removeItem('isko_session')
        return null
      }
      return session
    } catch {
      localStorage.removeItem('isko_session')
      return null
    }
  })

  const [addresses, setAddresses] = useState(() => {
    const saved = localStorage.getItem('isko_addresses')
    return saved ? JSON.parse(saved) : DEFAULT_ADDRESSES
  })

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('isko_session', JSON.stringify(currentUser))
    } else {
      localStorage.removeItem('isko_session')
    }
  }, [currentUser])

  useEffect(() => {
    localStorage.setItem('isko_addresses', JSON.stringify(addresses))
  }, [addresses])

  const login = async (phone, password) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'}/auth/cust_login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const user = {
          ...DEFAULT_USER,
          ...data.data,
          phone: data.data.cust_phone || phone,
          fullName: data.data.cust_nickname || 'User',
          email: data.data.cust_email || `${phone}@bicol-u.edu.ph`,
          role: data.data.cust_type || 'Student',
        }
        setCurrentUser(user)
        return { user, error: null }
      } else if (data.message) {
        return { user: null, error: data.message }
      }
    } catch (err) {
      console.error('Backend login failed:', err.message)
      return { user: null, error: 'Unable to connect to server' }
    }
  }

  const register = async (details) => {
    const fullName = `${details.firstName || ''} ${details.lastName || ''}`.trim() || details.username || 'User'
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'}/auth/cust_signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: details.phone,
          password: details.password,
          nickname: fullName,
          email: details.email,
          type: details.role || 'Student',
          city: details.campus || '',
          province: details.college || '',
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const user = {
          ...DEFAULT_USER,
          ...details,
          // cust_id is the key every backend endpoint keys off - it must come
          // from the API response, never from the signup form.
          ...data.data,
          cust_id: data.data?.cust_id,
          fullName,
          phone: data.data?.cust_phone || details.phone,
          email: data.data?.cust_email || details.email,
          role: data.data?.cust_type || details.role || 'Student',
        }
        setCurrentUser(user)
        return { user, error: null }
      } else if (data.message) {
        return { user: null, error: data.message }
      }
    } catch (err) {
      console.error('Backend registration failed:', err.message)
      return { user: null, error: 'Unable to connect to server' }
    }
  }

  const updateProfile = (details) => {
    setCurrentUser((prev) => {
      if (!prev) return null
      const updated = {
        ...prev,
        ...details,
        fullName: details.firstName && details.lastName ? `${details.firstName} ${details.lastName}` : prev.fullName,
      }
      return updated
    })
  }

  const logout = () => {
    setCurrentUser(null)
  }

  const addAddress = (address) => {
    setAddresses((prev) => {
      const newAddress = {
        ...address,
        id: Date.now(),
        isDefault: prev.length === 0 ? true : address.isDefault,
      }
      let next = [...prev]
      if (newAddress.isDefault) {
        next = next.map((a) => ({ ...a, isDefault: false }))
      }
      return [...next, newAddress]
    })
  }

  const updateAddress = (id, updatedFields) => {
    setAddresses((prev) => {
      let next = prev.map((a) => (a.id === id ? { ...a, ...updatedFields } : a))
      if (updatedFields.isDefault) {
        next = next.map((a) => (a.id === id ? a : { ...a, isDefault: false }))
      }
      return next
    })
  }

  const deleteAddress = (id) => {
    setAddresses((prev) => {
      const filtered = prev.filter((a) => a.id !== id)
      if (filtered.length > 0 && !filtered.some((a) => a.isDefault)) {
        filtered[0].isDefault = true
      }
      return filtered
    })
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        addresses,
        login,
        register,
        updateProfile,
        logout,
        addAddress,
        updateAddress,
        deleteAddress,
        setCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
