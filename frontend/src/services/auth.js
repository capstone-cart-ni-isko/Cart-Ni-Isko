import { apiPost } from './api.js'

export async function signUpUser(details) {
  try {
    const data = await apiPost('/auth/cust_signup', {
      phone: details.phone,
      password: details.password,
      nickname: details.fullName || details.username || '',
      email: details.email || '',
      type: details.role || 'Student',
    })
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
    return { user: data.data, error: null }
  } catch (err) {
    return { user: null, error: err.message || 'Login failed' }
  }
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
    status: employeeData.emp_disabled ? 'Disabled' : 'Active',
    dateAdded: employeeData.emp_created
      ? new Date(employeeData.emp_created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Now',
  }
}

export async function employeeSignUp(details) {
  try {
    const data = await apiPost('/auth/emp_signup', {
      email: details.email,
      password: details.password,
      surname: details.surname || '',
      givname: details.givname || '',
      phone: details.phone || '',
      type: details.type || 'Staff',
    })
    return { user: data.data, error: null }
  } catch (err) {
    return { user: null, error: err.message || 'Employee signup failed' }
  }
}
