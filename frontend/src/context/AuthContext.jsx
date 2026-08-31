import { createContext, useState, useEffect } from 'react'

export const AuthContext = createContext(null)

const API_BASE_URL = 'http://127.0.0.1:8000/api'

const DEFAULT_USER = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  fullName: 'Juan Dela Cruz',
  email: 'jdcruz@student.u.edu.ph',
  phone: '+63 912 345 6789',
  username: 'juandc',
  studentId: '2020-1234-5678',
  yearLevel: '1st Year',
  campus: 'Main Campus',
  college: 'College of Engineering',
  course: 'Mechanical Engineering',
  bio: '1st Year Student at the College of Engineering, taking up Mechanical Engineering.',
  role: 'Student',
  avatar: null,
  preferredContact: 'Email',
}

const DEFAULT_ADDRESSES = [
  {
    id: 1,
    recipient: 'Juan Dela Cruz',
    phone: '09123456789',
    addressLine: 'Bicol University Main Campus, Rizal Street',
    barangay: 'Brgy. 14 - Centro Occidental',
    city: 'Legazpi City',
    province: 'Albay',
    postalCode: '4500',
    isDefault: true,
  },
]

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('isko_session')
    return saved ? JSON.parse(saved) : null
  })

  const [addresses, setAddresses] = useState(() => {
    const saved = localStorage.getItem('isko_addresses')
    return saved ? JSON.parse(saved) : DEFAULT_ADDRESSES
  })

  // Sync user changes to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('isko_session', JSON.stringify(currentUser))
    } else {
      localStorage.removeItem('isko_session')
    }
  }, [currentUser])

  // Sync addresses to localStorage
  useEffect(() => {
    localStorage.setItem('isko_addresses', JSON.stringify(addresses))
  }, [addresses])

  const login = async (phone, password) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/cust_login`, {
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
      console.warn('Backend server not reached (http://127.0.0.1:8000), using local authentication fallback:', err.message)
    }

    // Fallback local mock login if backend API server is offline
    const isEmail = (phone || '').includes('@')
    const user = {
      ...DEFAULT_USER,
      email: isEmail ? phone : DEFAULT_USER.email,
      phone: isEmail ? DEFAULT_USER.phone : phone,
    }
    setCurrentUser(user)
    return { user, error: null }
  }

  const register = async (details) => {
    const fullName = `${details.firstName || ''} ${details.lastName || ''}`.trim() || details.username || 'User'
    try {
      const res = await fetch(`${API_BASE_URL}/auth/cust_signup`, {
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
          fullName,
          phone: data.data?.cust_phone || details.phone,
          email: data.data?.cust_email || details.email,
        }
        return { user, error: null }
      } else if (data.message) {
        return { user: null, error: data.message }
      }
    } catch (err) {
      console.warn('Backend server not reached (http://127.0.0.1:8000), using local registration fallback:', err.message)
    }

    // Fallback local mock registration if backend API server is offline
    const user = {
      ...DEFAULT_USER,
      ...details,
      fullName,
    }
    return { user, error: null }
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
