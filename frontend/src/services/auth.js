import { apiPost, apiPut } from './api.js'

/**
 * The academic category behind a signup role. The new schema stores
 * `cust_categ` ∈ student | alumni | faculty (null for guests); the
 * legacy forms still send `role` = 'Student' | 'Alumni' | 'Faculty' |
 * 'Guest'.
 */
function resolveCateg(details) {
  const explicit = details.cust_categ || details.categ || details.categ === ''
    ? details.cust_categ || details.categ
    : ''
  const raw = String(explicit || details.role || details.cust_type || '').trim().toLowerCase()
  if (['student', 'alumni', 'faculty'].includes(raw)) return raw
  if (raw === 'guest') return null
  // 'Student' -> 'student', 'Alumni' -> 'alumni', 'Faculty' -> 'faculty'
  const normalized = raw.replace(/[^a-z]/g, '')
  return ['student', 'alumni', 'faculty'].includes(normalized) ? normalized : null
}

/** True when the signup declares a guest account. */
function isGuestRole(details) {
  const raw = String(
    details.cust_type || details.type || details.role || resolveCateg(details) || ''
  ).trim().toLowerCase()
  return raw === 'guest' || raw === 'walk-in'
}

/**
 * Split a display name into the new givname / surname pair. A single
 * word is the surname (the backend does the same on its side).
 */
function splitFullName(fullName) {
  const text = String(fullName || '').trim().replace(/\s+/, ' ')
  if (!text) return { givname: '', surname: '' }
  const space = text.indexOf(' ')
  if (space === -1) return { givname: '', surname: text }
  return { givname: text.slice(0, space), surname: text.slice(space + 1) }
}

export async function signUpUser(details) {
  // The name travels under the new `givname` / `surname` keys first;
  // the legacy `nickname` key is still sent because the current
  // backend reads it (spec section 6: input accepts the new name
  // first and falls back to the legacy alias).
  const nameSource = details.givname || details.surname
    ? { givname: details.givname || '', surname: details.surname || '' }
    : splitFullName(details.fullName || details.nickname || details.username || '')
  const fullName = `${nameSource.givname} ${nameSource.surname}`.trim()
    || details.fullName
    || details.nickname
    || ''
  const guest = isGuestRole(details)
  const categ = guest ? null : resolveCateg(details)
  const role = guest ? 'Guest' : 'Student'
  const custType = guest ? 'guest' : 'bueño'

  // The four legacy address parts fold into the single `address`
  // column; both spellings are sent so either backend generation
  // understands the payload.
  const address = details.address || details.cust_address
    || [details.brgy, details.city, details.province, details.country]
        .map((part) => String(part || '').trim())
        .filter((part) => part && part.toUpperCase() !== 'N/A')
        .join(', ')

  const birthday = details.birthday || details.bday || details.cust_bday || '2000-01-01'
  const backupPhone = details.backup_phone || details.cust_backup_phone
    || [details.backupcallcode, details.backupphone]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ')
  const backupEmail = details.backup_email || details.backupemail || ''

  try {
    const data = await apiPost('/auth/cust_signup', {
      // canonical (new schema) keys
      phone: details.phone,
      password: details.password,
      givname: nameSource.givname,
      surname: nameSource.surname,
      pronoun: details.pronoun || 'they/them',
      bday: birthday,
      address,
      callcode: details.callcode || '+63',
      email: details.email || '',
      cust_type: custType,
      categ,
      cust_categ: categ,
      cust_college: details.cust_college || details.college || '',
      cust_dept: details.cust_dept || details.dept || details.course || details.program || '',
      backup_phone: backupPhone,
      backup_email: backupEmail,
      // legacy aliases (the current backend reads these)
      nickname: fullName,
      birthday,
      brgy: details.brgy || '',
      city: details.city || '',
      province: details.province || '',
      country: details.country || 'PH',
      backupcallcode: details.backupcallcode || '',
      backupphone: details.backupphone || '',
      backupemail: backupEmail,
      type: role,
      college: details.college || '',
      course: details.course || '',
      campus: details.campus || '',
      year_level: details.yearLevel || details.year || '',
      ...(details.username ? { username: details.username } : {}),
    })
    // data.data carries the account; data.data.token is the bearer token.
    return { user: data.data, error: null }
  } catch (err) {
    return { user: null, error: err.message || 'Signup failed' }
  }
}

export async function signInUser(credentials) {
  // Login accepts email OR phone (D17/D18): the identifier travels
  // under both keys so either backend generation resolves it.
  const identifier = credentials.phone || credentials.email || credentials.identifier || ''
  const body = {
    password: credentials.password,
    phone: credentials.phone || identifier,
  }
  if (credentials.email || (!credentials.phone && identifier.includes('@'))) {
    body.email = credentials.email || identifier
  }
  try {
    const data = await apiPost('/auth/cust_login', body)
    // data.data carries the account; data.data.token is the bearer token.
    return { user: data.data, error: null }
  } catch (err) {
    return { user: null, error: err.message || 'Login failed' }
  }
}

/** POST /auth/recover_credentials - start password recovery for an account. */
export async function recoverCredentials(identifier, accountType = 'customer') {
  try {
    const data = await apiPost('/auth/recover_credentials', {
      identifier,
      account_type: accountType,
    })
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err.message || 'Unable to start password recovery' }
  }
}

/** PUT /auth/update_credentials - set the new password for an account. */
export async function updateCredentials(payload) {
  try {
    const data = await apiPut('/auth/update_credentials', payload)
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err.message || 'Unable to update password' }
  }
}

export function logoutSession() {
  return apiPost('/auth/logout', {})
}

export async function employeeLogin(email, password) {
  const data = await apiPost('/auth/emp_login', {
    email: email,
    password: password,
  })
  return data.data
}

export function mapEmployee(employeeData) {
  if (!employeeData) return null
  const firstName = employeeData.emp_givname || ''
  const surname = employeeData.emp_surname || ''
  const email = employeeData.emp_email || ''
  const name = `${firstName} ${surname}`.trim() || email || 'Staff Member'
  const initials =
    [firstName, surname]
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'ST'

  // Resolve staff role from the backend emp_categ (legacy alias
  // emp_type) into the admin-UI role model. Both spellings carry
  // 'staff' | 'admin' | 'super admin' in any case.
  const rawType = String(
    employeeData.emp_categ || employeeData.emp_type || ''
  ).trim()
  let role = 'Staff Member'
  let roleKey = 'STAFF'
  let permissions = 'Fulfillment, Orders, POS'
  let modules = ['orders']
  if (/super\s*admin|root/i.test(rawType)) {
    role = 'Super Admin'
    roleKey = 'SUPER_ADMIN'
    permissions = 'Full System Access'
    modules = ['products', 'orders', 'analytics', 'content', 'settings']
  } else if (/admin|manager|officer/i.test(rawType)) {
    role = 'Store Administrator'
    roleKey = 'ADMIN'
    permissions = 'Products, Orders, Inventory, Schedule'
    modules = ['products', 'orders', 'analytics']
  }

  return {
    id: employeeData.emp_id,
    name,
    firstName,
    lastName: surname,
    surname,
    email,
    phone: employeeData.emp_phone || '',
    type: rawType || 'Staff',
    // emp_present (legacy alias emp_instore)
    instore: employeeData.emp_present ?? employeeData.emp_instore ?? false,
    role,
    roleKey,
    permissions,
    modules,
    avatar: initials,
    avatarBg: 'blue',
    // emp_avatar (legacy alias emp_photo)
    avatarImage: employeeData.emp_avatar || employeeData.emp_photo || '',
    // emp_suspended (legacy alias emp_disabled)
    status: (employeeData.emp_suspended ?? employeeData.emp_disabled) ? 'Disabled' : 'Active',
    mustChangePassword: Boolean(employeeData.must_change_password),
    dateAdded: employeeData.emp_created
      ? new Date(employeeData.emp_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Now',
  }
}

export async function employeeSignUp(details) {
  // Enrolment keeps the legacy onboarding keys (studnum, college,
  // program, year, bloc, type) because the current backend still
  // requires them, and adds the new `categ` key the migrated
  // endpoint reads. `type` is the uppercased legacy spelling of
  // `categ` ('STAFF' | 'ADMIN' | 'SUPER ADMIN').
  const categ = String(
    details.categ || details.emp_categ || details.type || 'staff'
  ).trim().toLowerCase()
  const normalized = categ === 'super admin' || categ === 'superadmin'
    ? 'super admin'
    : ['admin', 'staff'].includes(categ)
      ? categ
      : 'staff'

  try {
    const data = await apiPost('/auth/emp_signup', {
      // canonical (new schema) keys
      givname: details.givname || '',
      surname: details.surname || '',
      email: details.email,
      phone: details.phone || '',
      callcode: details.callcode || '+63',
      pronoun: details.pronoun || '',
      categ: normalized,
      // legacy keys the enrolment form still supplies (the backend
      // keeps accepting them so the form is unchanged)
      midname: details.midname || '',
      suffix: details.suffix || '',
      studnum: details.studnum || details.studentNumber || '',
      college: details.college || '',
      program: details.program || details.course || '',
      year: details.year || details.yearLevel || '',
      bloc: details.bloc || '',
      birthday: details.birthday || details.bday || '',
      brgy: details.brgy || '',
      city: details.city || '',
      province: details.province || '',
      country: details.country || '',
      type: normalized.toUpperCase(),
      instore: details.instore ?? true,
    })
    return { user: data.data, error: null }
  } catch (err) {
    return { user: null, error: err.message || 'Employee signup failed' }
  }
}
