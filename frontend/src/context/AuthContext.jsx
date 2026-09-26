/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiToken, setApiToken } from '../services/api.js'
import { clearSession, loadSession, saveSession } from '../services/session.js'
import { logoutSession, signInUser, signUpUser } from '../services/auth.js'

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

/**
 * Customer session. The last signed-in account (user + bearer token) is kept
 * in the shared `isko_session` slot (services/session.js), so a refresh or a
 * code reload restores it - REQ-ALR-01's "relogin on refresh" is intentionally
 * overridden here; a 401 from the API still ends the session immediately.
 */
export function AuthProvider({ children }) {
  const navigate = useNavigate()

  // Lazy restore so the token is back in place before the first API call.
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = loadSession('customer')
    if (saved) setApiToken(saved.token)
    return saved?.user ?? null
  })

  // Guarded like every other storage read in the app: this initializer runs
  // inside AuthProvider, which sits ABOVE the error boundary, so a single
  // unparsable value would throw during render and blank the whole page.
  const [addresses, setAddresses] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('isko_addresses'))
      return Array.isArray(saved) ? saved : DEFAULT_ADDRESSES
    } catch {
      return DEFAULT_ADDRESSES
    }
  })

  // Mirror every user change (login, edit, logout) into the shared slot.
  useEffect(() => {
    if (currentUser) saveSession('customer', getApiToken(), currentUser)
    else clearSession('customer')
  }, [currentUser])

  // Token rejected server-side: drop the in-memory user too.
  useEffect(() => {
    const handleExpired = () => setCurrentUser(null)
    window.addEventListener('auth-expired', handleExpired)
    return () => window.removeEventListener('auth-expired', handleExpired)
  }, [])

  useEffect(() => {
    localStorage.setItem('isko_addresses', JSON.stringify(addresses))
  }, [addresses])

  /** Shape the API account into the profile shape the UI consumes. */
  const buildUser = (account, extras = {}) => {
    const phone = account?.cust_phone || extras.phone || ''
    const fullName = account?.cust_nickname || extras.fullName || 'User'
    const [firstName = '', ...rest] = fullName.split(' ')
    return {
      ...DEFAULT_USER,
      ...extras,
      ...(account || {}),
      cust_id: account?.cust_id ?? account?.id ?? extras.cust_id,
      phone,
      fullName,
      firstName: extras.firstName || firstName,
      lastName: extras.lastName || rest.join(' '),
      email: account?.cust_email || extras.email || '',
      role: account?.cust_type || extras.role || 'Student',
      // Signup-only fields: form value first, then the stored copy, then the
      // spec default so an unfilled profile never renders as blank.
      username: extras.username || account?.cust_username || phone,
      yearLevel: extras.yearLevel || account?.cust_year || 'N/A',
      campus: extras.campus || account?.cust_campus || 'N/A',
      college: extras.college || account?.cust_college || 'N/A',
      course: extras.course || account?.cust_course || 'N/A',
      studentId: extras.studentId || 'N/A',
      // Real uploaded profile photo (URL served by the backend)
      avatarImage: account?.cust_photo || extras.avatarImage || '',
    }
  }

  const login = async (phone, password) => {
    const { user: account, error } = await signInUser({ phone, password })
    if (error || !account) {
      return { user: null, error: error || 'Unable to connect to server' }
    }
    if (account.token) setApiToken(account.token)
    // Carry the schema-less signup fields across the signup -> signin hop,
    // but only when it is the same phone number.
    const prior = currentUser?.phone === (account.cust_phone || phone) ? currentUser : {}
    const user = buildUser(account, {
      username: prior.username,
      yearLevel: prior.yearLevel,
      campus: prior.campus,
      college: prior.college,
      course: prior.course,
      studentId: prior.studentId,
      phone,
      fullName: account.cust_nickname || 'User',
    })
    setCurrentUser(user)
    return { user, error: null }
  }

  const register = async (details) => {
    const fullName =
      `${details.firstName || ''} ${details.lastName || ''}`.trim() ||
      details.username ||
      'User'
    const { user: account, error } = await signUpUser({
      ...details,
      fullName,
      role: details.role || 'Student',
    })
    if (error || !account) {
      return { user: null, error: error || 'Unable to connect to server' }
    }
    if (account.token) setApiToken(account.token)
    // cust_id is the key every backend endpoint keys off - it must come from
    // the API response, never from the signup form. The password is stripped
    // so it is never written to the persisted session slot.
    const { password, ...profile } = details
    void password
    const user = buildUser(account, { ...profile, fullName })
    setCurrentUser(user)
    return { user, error: null }
  }

  const updateProfile = (details) => {
    setCurrentUser((prev) => {
      if (!prev) return null
      const updated = {
        ...prev,
        ...details,
        fullName:
          details.firstName && details.lastName
            ? `${details.firstName} ${details.lastName}`
            : prev.fullName,
      }
      return updated
    })
  }

  /**
   * Ends the session and always lands on the login form (REQ-ALR-01). The
   * redirect lives here so every logout entry point - the menu drawer, the
   * account pages, the profile menu, the password change - behaves the same.
   * `replace` keeps Back from re-entering an authenticated page.
   */
  const logout = async () => {
    const revocation = logoutSession().catch(() => null)
    clearSession('customer')
    setApiToken(null)
    setCurrentUser(null)
    await revocation
    navigate('/signin', { replace: true })
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
