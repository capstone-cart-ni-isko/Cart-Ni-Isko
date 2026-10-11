/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiToken, setApiToken } from '../services/api.js'
import { clearSession, loadSession, saveSession } from '../services/session.js'
import { logoutSession, signInUser, signUpUser } from '../services/auth.js'
import { redeemOtpChallenge } from '../services/otp.js'
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
 * Customer session. The signed-in account (user + bearer token) lives in the
 * shared slot in services/session.js: it is written to `sessionStorage`, so it
 * survives a reload and every client-side navigation (FLOW-CUST_LOGIN-03) but
 * is gone once the browser closes - which is where REQ-CUST_LOGIN-01 asks for
 * a fresh login. A 401 from the API still ends the session immediately.
 */
export function AuthProvider({ children }) {
  const navigate = useNavigate()

  // Restores the session that survived the reload (FLOW-CUST_LOGIN-01: a
  // previously signed-in customer lands on /home), or starts signed out when
  // the browser was closed and sessionStorage went with it.
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = loadSession('customer')
    // Explicit kind: on a reload of /admin/* the URL default is 'staff', and
    // this provider must never install a customer bearer in the staff slot.
    if (saved) setApiToken(saved.token, 'customer')
    return saved?.user ?? null
  })

  const [addresses, setAddresses] = useState(DEFAULT_ADDRESSES)

  // Mirror every user change (login, edit, logout) into the shared slot.
  useEffect(() => {
    if (currentUser) saveSession('customer', getApiToken('customer'), currentUser)
    else clearSession('customer')
  }, [currentUser])

  // Token rejected server-side: drop the in-memory user too.
  useEffect(() => {
    // Rule 71: only the CUSTOMER portal's expiry may end a customer session -
    // the staff portal dispatches the same event for its own 401s.
    const handleExpired = (event) => {
      if (event?.detail?.kind && event.detail.kind !== 'customer') return
      setCurrentUser(null)
    }
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
    // The new schema stores the name split in two; `cust_nickname` is the
    // legacy single-line spelling still carried by older rows.
    const composed = [account?.cust_givname, account?.cust_surname]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ')
    const fullName = composed || account?.cust_nickname || extras.fullName || 'User'
    const [firstName = '', ...rest] = fullName.split(' ')
    const shaped = {
      ...DEFAULT_USER,
      ...extras,
      ...(account || {}),
      cust_id: account?.cust_id ?? account?.id ?? extras.cust_id,
      givname: account?.cust_givname || extras.firstName || firstName,
      surname: account?.cust_surname || extras.lastName || rest.join(' '),
      phone,
      fullName,
      firstName: extras.firstName || firstName,
      lastName: extras.lastName || account?.cust_surname || rest.join(' '),
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

    // The API answers carry the whole row, password hash included; the
    // session slot must never hold a credential (it is written to
    // sessionStorage on every login).
    delete shaped.password
    delete shaped.cust_password
    delete shaped.token

    return shaped
  }

  /**
   * FLOW-CUST_LOGIN-02: credentials are checked first; when the account is
   * more than fifteen days past its last logout (or its signup never
   * finished) the answer is a signed `challenge` and no session - the caller
   * routes to the OTP screen with it.
   */
  const login = async (identifier, password) => {
    const result = await signInUser({ identifier, password })

    if (result.requiresOtp) {
      return {
        user: null,
        error: null,
        requiresOtp: true,
        challenge: result.challenge,
        phone: result.phone,
        purpose: result.purpose,
      }
    }

    const account = result.user
    if (result.error || !account) {
      return { user: null, error: result.error || 'Unable to connect to server', requiresOtp: false }
    }

    if (account.token) setApiToken(account.token, 'customer')
    // Carry the schema-less signup fields across the signup -> signin hop,
    // but only when it is the same account.
    const prior = currentUser?.phone === (account.cust_phone || identifier) ? currentUser : {}
    const user = buildUser(account, {
      username: prior.username,
      yearLevel: prior.yearLevel,
      campus: prior.campus,
      college: prior.college,
      course: prior.course,
      studentId: prior.studentId,
      phone: identifier,
      fullName: prior.fullName,
    })
    setCurrentUser(user)
    return { user, error: null, requiresOtp: false }
  }

  const register = async (details) => {
    const fullName =
      `${details.firstName || ''} ${details.lastName || ''}`.trim() ||
      details.username ||
      'User'
    const result = await signUpUser({
      ...details,
      fullName,
      role: details.role || 'Student',
    })

    // FLOW-CUST_SIGNUP-05: the row exists but the account is NOT final - the
    // answer carries the signed challenge the phone OTP has to clear first.
    if (result.requiresOtp) {
      return {
        user: null,
        error: null,
        requiresOtp: true,
        challenge: result.challenge,
        phone: result.phone,
        purpose: result.purpose,
        custId: result.custId,
      }
    }

    const account = result.user
    if (result.error || !account) {
      return { user: null, error: result.error || 'Unable to connect to server', requiresOtp: false }
    }
    if (account.token) setApiToken(account.token, 'customer')
    // cust_id is the key every backend endpoint keys off - it must come from
    // the API response, never from the signup form. The password is stripped
    // so it is never written to the persisted session slot.
    const { password, ...profile } = details
    void password
    const user = buildUser(account, { ...profile, fullName })
    setCurrentUser(user)
    return { user, error: null, requiresOtp: false }
  }

  /**
   * Redeems the phone OTP the signup / stale login challenged for. The answer
   * is the finalized account plus its bearer, so this is the call that opens
   * the session (FLOW-CUST_SIGNUP-05 / FLOW-CUST_LOGIN-02).
   */
  const verifyOtpChallenge = async (challenge, purpose, code) => {
    const { data, error } = await redeemOtpChallenge(challenge, purpose, code)
    if (error || !data?.token) {
      return { user: null, error: error || 'Unable to verify the code' }
    }

    setApiToken(data.token, 'customer')
    const { password, token, ...account } = data
    void password
    void token
    const user = buildUser(account, {})
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
   * Ends the session and always lands on the login form (FLOW-CUST_LOGOUT-05).
   * The redirect lives here so every logout entry point - the menu drawer, the
   * account pages, the profile menu, the password change - behaves the same.
   * `replace` keeps Back from re-entering an authenticated page.
   */
  const logout = async () => {
    const revocation = logoutSession().catch(() => null)
    clearSession('customer')
    setApiToken(null, 'customer')
    setCurrentUser(null)
    await revocation
    navigate('/login', { replace: true })
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
        verifyOtpChallenge,
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
