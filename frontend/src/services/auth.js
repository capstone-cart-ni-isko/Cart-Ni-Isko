import { apiPost } from './api.js'

export async function signUpUser(details) {
  try {
    const data = await apiPost('/auth/cust_signup', {
      phone: details.phone,
      password: details.password,
      nickname: details.username || details.fullName || '',
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
  return {
    id: employeeData.emp_id,
    name: employeeData.emp_givname || '',
    firstName: employeeData.emp_givname || '',
    surname: employeeData.emp_surname || '',
    email: employeeData.emp_email || '',
    phone: employeeData.emp_phone || '',
    type: employeeData.emp_type || 'Staff',
    instore: employeeData.emp_instore || false,
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
