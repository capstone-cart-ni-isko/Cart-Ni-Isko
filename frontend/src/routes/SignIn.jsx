import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useApiWarmup } from '../hooks/useApi.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import BackButton from '../components/ui/BackButton.jsx'

/**
 * Shown the instant Login is clicked, before the response lands. Keeps the
 * button's own space so the layout never jumps while the request is in flight.
 */
function AuthenticatingSkeleton() {
  return (
    <span className="flex items-center justify-center gap-2" role="status" aria-live="polite">
      <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
      Authenticating…
    </span>
  )
}

/** FLOW-CUST_LOGIN-04: the typed identifier is remembered for this session. */
const DRAFT_KEY = 'isko_login_draft'

function readDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
    return { identifier: draft?.identifier || '', password: '' }
  } catch {
    return { identifier: '', password: '' }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function SignIn() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { showToast } = useToast()
  // Fires on the first field focus: DNS + TCP + TLS to the API and the public
  // catalog read are done before the customer can possibly submit.
  const warmApi = useApiWarmup()

  // FLOW-CUST_LOGIN-04 / REQ-CUST_LOGIN-02: what was typed survives a
  // reload, a tab switch and a rejected attempt - only the password is kept
  // in React state, never written to storage.
  const [form, setForm] = useState(readDraft)
  const [touched, setTouched] = useState({})
  const [serverError, setServerError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ identifier: form.identifier }))
    } catch {
      // A blocked storage only costs the draft, never the screen.
    }
  }, [form.identifier])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    // REQ-CUST_LOGIN-03: an error is dropped the moment the field is fixed.
    setServerError('')
  }

  /**
   * FLOW-CUST_LOGIN-05 / REQ-CUST_LOGIN-05: specific feedback per field, and
   * only once the customer has actually been in that field.
   */
  function fieldError(name) {
    if (!touched[name]) return ''
    const value = String(form[name] || '').trim()

    if (name === 'identifier') {
      if (!value) return 'Enter your email address.'
      if (value.includes('@')) {
        if (!EMAIL_RE.test(value)) return 'Enter a valid email address.'
      } else if (value.replace(/\D/g, '').length < 10) {
        return 'Enter a valid phone number.'
      }
      return ''
    }

    if (name === 'password') {
      if (!value) return 'Enter your password.'
      if (value.length < 8) return 'Password must be at least 8 characters.'
    }

    return ''
  }

  const identifierError = fieldError('identifier')
  const passwordError = fieldError('password')
  const identifierOk =
    form.identifier.trim().length > 0 && !identifierError && touched.identifier
  const formValid =
    Boolean(!identifierError && !passwordError && form.identifier.trim() && form.password)

  async function handleSubmit(e) {
    e.preventDefault()

    // Never submit blind: mark every field so each problem is on screen.
    setTouched({ identifier: true, password: true })
    if (identifierError || passwordError || !form.identifier.trim() || !form.password) return

    setIsSubmitting(true)
    const result = await login(form.identifier.trim(), form.password)
    setIsSubmitting(false)

    // FLOW-CUST_LOGIN-02: the password was right but the OTP gate opened.
    // The form keeps everything typed (REQ-CUST_LOGIN-02) and the challenge
    // is carried to the verification screen.
    if (result.requiresOtp) {
      showToast('A verification code was sent to your notification inbox.')
      navigate('/verify-otp', {
        state: {
          challenge: result.challenge,
          phone: result.phone,
          purpose: result.purpose,
          fromSignIn: true,
        },
      })
      return
    }

    if (result.error || !result.user) {
      // REQ-CUST_LOGIN-02: the form is neither refreshed nor emptied.
      setServerError(result.error || 'Unable to connect to server')
      showToast(result.error || 'Unable to connect to server', 'error')
      return
    }

    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      /* nothing to clean up */
    }
    showToast('Signed in successfully!')
    // FLOW-CUST_LOGIN-03: straight to the storefront, no further login.
    navigate('/home')
  }

  const emailField = (idPrefix, inputClassName, errorClassName) => (
    <div>
      <label
        htmlFor={`${idPrefix}-identifier`}
        className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 md:text-sm md:text-gray-700 md:normal-case md:tracking-normal"
      >
        Email Address
      </label>
      <div className="relative">
        <input
          id={`${idPrefix}-identifier`}
          type="email"
          name="identifier"
          autoComplete="username"
          placeholder="you@bicol-u.edu.ph"
          value={form.identifier}
          onChange={handleChange}
          onFocus={() => {
            warmApi()
            setTouched((prev) => (prev.identifier ? prev : { ...prev, identifier: true }))
          }}
          onBlur={() => setTouched((prev) => ({ ...prev, identifier: true }))}
          className={`${inputClassName} ${
            identifierError
              ? 'border-red-400'
              : identifierOk
                ? 'border-green-500'
                : 'border-gray-200'
          }`}
        />
        {identifierOk && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#16A34A] text-white text-xs font-black animate-scale-in">
            ✓
          </span>
        )}
      </div>
      {identifierError && <p className={errorClassName}>{identifierError}</p>}
      {!identifierError && (
        <p className="text-xs text-gray-400 mt-1 font-medium md:block hidden">
          Your registered phone number works here too.
        </p>
      )}
    </div>
  )

  const passwordField = (idPrefix, inputClassName) => (
    <div>
      <label
        htmlFor={`${idPrefix}-password`}
        className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 md:text-sm md:text-gray-700 md:normal-case md:tracking-normal"
      >
        Password
      </label>
      <div className="relative">
        <input
          id={`${idPrefix}-password`}
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          placeholder="Enter password"
          value={form.password}
          onChange={handleChange}
          onFocus={() => {
            warmApi()
            setTouched((prev) => (prev.password ? prev : { ...prev, password: true }))
          }}
          onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
          className={`${inputClassName} pr-12 ${
            passwordError || (form.password.length > 0 && form.password.length < 8)
              ? 'border-red-400 focus:ring-red-250 focus:border-red-500'
              : 'focus:ring-brand-orange/40 focus:border-brand-orange'
          }`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-450 hover:text-brand-orange transition-colors"
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>
      {passwordError && (
        <p className="text-red-500 text-xs mt-1 font-semibold">{passwordError}</p>
      )}
    </div>
  )

  return (
    <AppShell showNav={false} showHeader={false} showBottomNav={false}>
      {/* MOBILE LOGIN LAYOUT */}
      <div className="flex flex-col justify-between min-h-[580px] p-8 md:hidden animate-fade-in">
        <div>
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Sign In</h1>
            <BackButton to="/home" label="Back to Homepage" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {emailField(
              'mobile',
              'w-full h-12 px-4 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 transition-all',
              'text-red-500 text-xs mt-1 font-semibold'
            )}

            {passwordField(
              'mobile',
              'w-full h-12 px-4 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 transition-all'
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-gray-400 font-medium"></span>
              <Link
                to="/forgot-password"
                className="text-sm text-gray-400 hover:text-brand-orange font-bold transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {serverError && (
              <p className="text-red-500 text-sm font-semibold" role="alert">
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={!formValid || isSubmitting}
              className={`w-full h-12 text-white font-bold rounded-full transition-all shadow-md hover:shadow-lg active:scale-98 mt-6 ${
                formValid
                  ? 'bg-brand-orange hover:bg-brand-orange-dark cursor-pointer'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
              }`}
            >
              {isSubmitting ? <AuthenticatingSkeleton /> : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400 font-semibold pt-6">
          Don't have an account?{' '}
          <Link to="/signup/role" className="text-brand-orange font-bold hover:underline">
            Sign up
          </Link>
        </p>
      </div>

      {/* DESKTOP LOGIN LAYOUT (Image 3 Wireframe) */}
      <div className="hidden md:flex flex-col justify-between min-h-[460px] p-10 animate-fade-in bg-white">
        <div>
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-gray-900 leading-tight">Log In</h1>
              <p className="text-sm text-gray-500 font-medium mt-2 leading-relaxed">
                Access your orders, cart, and favorite products anytime, anywhere.
              </p>
            </div>
            <BackButton to="/home" label="Back to Homepage" className="shrink-0 mt-1" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {emailField(
              'desktop',
              'w-full h-12 px-4 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white transition-all',
              'text-red-500 text-xs mt-1.5 font-semibold'
            )}

            {passwordField(
              'desktop',
              'w-full h-12 px-4 border rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 bg-white transition-all'
            )}

            {serverError && (
              <p className="text-red-500 text-sm font-semibold" role="alert">
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={!formValid || isSubmitting}
              className={`w-full h-12 text-white font-bold rounded-lg transition-all shadow-md active:scale-98 mt-6 cursor-pointer ${
                formValid
                  ? 'bg-brand-orange hover:bg-brand-orange-dark'
                  : 'bg-brand-orange opacity-90'
              }`}
            >
              {isSubmitting ? <AuthenticatingSkeleton /> : 'Log In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 font-semibold pt-8">
          Don't have an account?{' '}
          <Link to="/signup/role" className="text-brand-orange font-bold hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </AppShell>
  )
}

export default SignIn
