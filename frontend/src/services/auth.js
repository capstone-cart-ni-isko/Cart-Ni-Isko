import { supabase } from '../lib/supabase.js'

/**
 * Sign up a new user with Supabase Auth
 */
export async function signUpUser({ firstName, lastName, phone, email, username, password }) {
  try {
    // If no email is provided, generate a fallback email based on phone or username
    const userEmail = email || `${(username || phone || 'user').replace(/[^a-zA-Z0-9]/g, '')}@cartniisko.local`

    const { data, error } = await supabase.auth.signUp({
      email: userEmail,
      password,
      options: {
        data: {
          first_name: firstName || '',
          last_name: lastName || '',
          full_name: `${firstName || ''} ${lastName || ''}`.trim() || username || 'User',
          phone: phone || '',
          username: username || '',
        },
      },
    })

    if (error) {
      return { user: null, error: error.message }
    }

    return {
      user: data.user,
      session: data.session,
      error: null,
    }
  } catch (err) {
    return {
      user: null,
      error: err.message || 'An error occurred during registration',
    }
  }
}

/**
 * Sign in a user with Supabase Auth
 */
export async function signInUser({ phone, email, password }) {
  try {
    const loginIdentifier = email || (phone && phone.includes('@') ? phone : null)

    if (loginIdentifier) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginIdentifier,
        password,
      })

      if (error) {
        return { user: null, error: error.message }
      }

      return {
        user: data.user,
        session: data.session,
        error: null,
      }
    }

    // Attempt sign in with phone or generate fallback identifier
    if (phone) {
      const candidateEmail = `${phone.replace(/[^a-zA-Z0-9]/g, '')}@cartniisko.local`
      const { data, error } = await supabase.auth.signInWithPassword({
        email: candidateEmail,
        password,
      })

      if (error) {
        return { user: null, error: error.message }
      }

      return {
        user: data.user,
        session: data.session,
        error: null,
      }
    }

    return { user: null, error: 'Phone or email is required' }
  } catch (err) {
    return {
      user: null,
      error: err.message || 'An error occurred during sign in',
    }
  }
}

/**
 * Sign out current user
 */
export async function signOutUser() {
  try {
    const { error } = await supabase.auth.signOut()
    return { error: error ? error.message : null }
  } catch (err) {
    return { error: err.message }
  }
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) return null
    return user
  } catch {
    return null
  }
}