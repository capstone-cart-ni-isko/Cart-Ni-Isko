//Mock data palang ito nhays/ will be replaced by supabase data mamaya

export async function signUpUser({ firstName, lastName, phone, email, username, password }) {
  await new Promise((resolve) => setTimeout(resolve, 600))
  console.log('Mock sign up:', { firstName, lastName, phone, email, username, password })
  return {
    user: { id: 'mock-user-id', email, username },
    error: null,
  }
}

export async function signInUser({ phone, password }) {
  await new Promise((resolve) => setTimeout(resolve, 600))
  console.log('Mock sign in:', { phone, password })
  return {
    user: { id: 'mock-user-id', phone },
    error: null,
  }
}