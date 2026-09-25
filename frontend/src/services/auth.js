import { apiPost, apiPut } from './api.js'

export async function signUpUser(details) {
  try {
    const data = await apiPost('/auth/cust_signup', {
      phone: details.phone,
      password: details.password,
      nickname: details.fullName || details.username || '',
      pronoun: details.pronoun || 'they/them',
      birthday: details.birthday || '2000-01-01',
      brgy: details.brgy || '',
      city: details.city || '',
      province: details.province || '',
      country: details.country || 'PH',
      callcode: details.callcode || '+63',
      backupcallcode: details.backupcallcode || '',
      backupphone: details.backupphone || '',
      backupemail: details.backupemail || '',
      email: details.email || '',
      type: details.role || 'Student',
      ...(details.username ? { username: details.username } : {}),
      ...(details.role === 'Student'
        ? {
            campus: details.campus || '',
            college: details.college || '',
            course: details.course || '',
            year_level: details.yearLevel || '',
          }
        : {}),
    })
    // data.data carries the account; data.data.token is the bearer token.
    return { user: data.data, error: null }
  } catch (err) {
    return { user: null, error: err.message || 'Signup failed' }
  }
}

export async function signInUser(credentials) {
  try {
    const data = await apiPost('/auth/cust_login', {
      phone: credentials.phone,
      password: credentials.password,
    })
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

  // Resolve staff role from the backend emp_type into the admin-UI role model
  const rawType = String(employeeData.emp_type || '').trim()
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
    instore: employeeData.emp_instore || false,
    role,
    roleKey,
    permissions,
    modules,
    avatar: initials,
    avatarBg: 'blue',
    avatarImage: employeeData.emp_photo || '',
    status: employeeData.emp_disabled ? 'Disabled' : 'Active',
    mustChangePassword: Boolean(employeeData.must_change_password),
    dateAdded: employeeData.emp_created
      ? new Date(employeeData.emp_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Now',
  }
}

export async function employeeSignUp(details) {
  try {
    const data = await apiPost('/auth/emp_signup', {
      email: details.email,
      surname: details.surname || '',
      givname: details.givname || '',
      midname: details.midname || '',
      suffix: details.suffix || '',
      studnum: details.studnum || details.studentNumber || '',
      college: details.college || '',
      program: details.program || details.course || '',
      year: details.year || details.yearLevel || '',
      bloc: details.bloc || '',
      pronoun: details.pronoun || '',
      phone: details.phone || '',
      callcode: details.callcode || '+63',
      type: String(details.type || 'Staff').toUpperCase(),
      instore: details.instore ?? false,
    })
    return { user: data.data, error: null }
  } catch (err) {
    return { user: null, error: err.message || 'Employee signup failed' }
  }
}
