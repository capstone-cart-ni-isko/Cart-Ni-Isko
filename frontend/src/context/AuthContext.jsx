/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiToken, setApiToken } from '../services/api.js'
import { clearSession, loadSession, saveSession } from '../services/session.js'
import { logoutSession, signInUser, signUpUser } from '../services/auth.js'
import { fetchMyAccount, updateAccount } from '../services/accounts.js'

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
 * REQ-CUST_PROF-03 - the account keeps several delivery addresses, but the
 * schema holds them in the single `cust_address` column. One address is one
 * line ("House 1, Brgy San Jose, Cabanatuan, Nueva Ecija 4500") and the list
 * is stored through PUT /accounts/update, never in the browser.
 *
 * The first line of the list is the default address, so `isDefault` never
 * has to be stored - only the order.
 */
function serializeAddress(address) {
  return [
    address.addressLine,
    address.barangay,
    address.city,
    address.province,
    address.postalCode,
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ')
}

/** Rebuilds one address object from its stored line. */
function parseAddress(line) {
  const text = String(line || '').trim()
  if (!text) return null

  const segments = text.split(',').map((part) => part.trim()).filter(Boolean)
  let postalCode = ''
  if (segments.length > 1 && /^\d{4}$/.test(segments[segments.length - 1])) {
    postalCode = segments.pop()
  }
  const province = segments.pop() || ''
  const city = segments.pop() || ''
  const barangay = segments.pop() || ''
  const addressLine = segments.join(', ')

  return {
    id: text,
    addressLine,
    barangay,
    city,
    province,
    postalCode,
    isDefault: false,
  }
}

function linesToAddresses(lines) {
  return lines
    .map(parseAddress)
    .filter(Boolean)
    .map((address, index) => ({ ...address, isDefault: index === 0 }))
}

/**
 * Customer session. The signed-in account (user + bearer token) is held in the
 * shared in-memory slot (services/session.js), so it survives client-side
 * navigation but never a reload — REQ-ALR-01 requires a fresh login after a
 * logout, a refresh, a browser reopen, or a device restart. A 401 from the API
 * still ends the session immediately.
 */
export function AuthProvider({ children }) {
  const navigate = useNavigate()

  // Restores nothing on a cold start, which is exactly what REQ-ALR-01 wants.
  // The token is still in place for the rest of the tab after a login.
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = loadSession('customer')
    if (saved) setApiToken(saved.token)
    return saved?.user ?? null
  })

  const [addresses, setAddresses] = useState(DEFAULT_ADDRESSES)

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

  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  /**
   * Loads the saved addresses from the account row. Any list still sitting
   * in the old localStorage slot is migrated once (and the slot retired), so
   * nobody loses an address when the backend becomes the single source.
   */
  useEffect(() => {
    if (!custId) {
      setAddresses(DEFAULT_ADDRESSES)
      return undefined
    }
    let cancelled = false

    fetchMyAccount()
      .then(async (row) => {
        if (cancelled || !row) return
        const stored = Array.isArray(row.cust_addresses) ? row.cust_addresses : []

        if (stored.length > 0) {
          setAddresses(linesToAddresses(stored))
          return
        }

        let legacy = []
        try {
          const saved = JSON.parse(localStorage.getItem('isko_addresses'))
          if (Array.isArray(saved)) legacy = saved
        } catch {
          legacy = []
        }
        if (legacy.length === 0) return

        const lines = legacy.map(serializeAddress).filter(Boolean)
        await updateAccount('customer', custId, { cust_addresses: lines })
        localStorage.removeItem('isko_addresses')
        if (!cancelled) setAddresses(linesToAddresses(lines))
      })
      .catch(() => {
        // A failed read keeps whatever is already on screen.
      })

    return () => {
      cancelled = true
    }
  }, [custId])

  /** Writes the whole list back to the account row, then mirrors it here. */
  const saveAddresses = useCallback(
    async (next) => {
      const ordered = next.map((address, index) => ({ ...address, isDefault: index === 0 }))
      const lines = ordered.map(serializeAddress).filter(Boolean)

      if (custId) {
        await updateAccount('customer', custId, { cust_addresses: lines })
      }
      setAddresses(ordered)
      return ordered
    },
    [custId]
  )

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

  const addAddress = async (address) => {
    const newAddress = {
      ...address,
      id: address.id || Date.now().toString(),
    }
    const next = [...addresses]
    // The first slot is the default, so adding "default" swaps the head.
    if (newAddress.isDefault) {
      next.unshift({ ...newAddress, isDefault: true })
    } else {
      next.push({ ...newAddress, isDefault: next.length === 0 })
    }
    await saveAddresses(next)
  }

  const updateAddress = async (id, updatedFields) => {
    const next = addresses.map((a) => (a.id === id ? { ...a, ...updatedFields } : a))
    const target = next.find((a) => a.id === id)
    if (updatedFields.isDefault && target) {
      await saveAddresses([target, ...next.filter((a) => a.id !== id)])
      return
    }
    await saveAddresses(next)
  }

  const deleteAddress = async (id) => {
    const next = addresses.filter((a) => a.id !== id)
    await saveAddresses(next)
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
        saveAddresses,
        setCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
