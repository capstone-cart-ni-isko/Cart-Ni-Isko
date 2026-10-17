import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useApiWarmup } from '../hooks/useApi.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import BackButton from '../components/ui/BackButton.jsx'
import brandLogo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

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
      if (!value) return 'Enter your phone number.'
      if (value.replace(/\D/g, '').length < 10) {
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
      showToast('Unable to connect to server.', 'error')
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

  const phoneField = (idPrefix) => (
    <div>
      <label
        htmlFor={`${idPrefix}-identifier`}
        className="field-label"
      >
        Phone Number
      </label>
      <div className="relative">
        <input
          id={`${idPrefix}-identifier`}
          type="tel"
          name="identifier"
          autoComplete="tel"
          inputMode="tel"
          placeholder="09XX XXX XXXX"
          value={form.identifier}
          onChange={handleChange}
          onFocus={() => {
            warmApi()
            setTouched((prev) => (prev.identifier ? prev : { ...prev, identifier: true }))
          }}
          onBlur={() => setTouched((prev) => ({ ...prev, identifier: true }))}
          aria-invalid={identifierError ? 'true' : undefined}
          className={`field-input field-input--lg pr-10 ${
            identifierError ? 'field-input--error' : ''
          }`}
        />
        {identifierOk && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#16A34A] text-white text-xs font-semibold animate-scale-in">
            ✓
          </span>
        )}
      </div>
      {identifierError && <p className="field-error">{identifierError}</p>}
      {!identifierError && (
        <p className="field-hint">
          Enter the phone number registered to your account.
        </p>
      )}
    </div>
  )

  const passwordField = (idPrefix) => (
    <div>
      <label
        htmlFor={`${idPrefix}-password`}
        className="field-label"
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
          aria-invalid={passwordError ? 'true' : undefined}
          className="field-input field-input--lg pr-20"
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500 hover:text-brand-orange transition-colors"
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>
      {passwordError && <p className="field-error">{passwordError}</p>}
    </div>
  )

  return (
    <AppShell showNav={false} showHeader={false} showBottomNav={false}>
      {/* MOBILE LOGIN LAYOUT */}
      <div className="flex flex-col justify-between min-h-[580px] px-4 py-8 md:hidden animate-fade-in">
        <div>
          <div className="flex items-center gap-3 mb-8">
            {/* Rule 69: a "back" button sits at the TOP LEFT. */}
            <BackButton to="/home" className="shrink-0" />
          </div>

          <div className="flex flex-col items-center text-center gap-3 mb-8">
            <img
              src={brandLogo}
              alt="Tindahan ni Isko"
              className="h-14 w-auto object-contain"
            />
            <div>
              <h1 className="page-title text-gray-900 dark:text-[var(--ink)]">Sign In</h1>
              <p className="text-sm text-gray-500 dark:text-[var(--muted)] font-medium mt-1">
                Access your orders, bag, and favorite products anytime, anywhere.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-[var(--surface)] rounded-2xl border border-slate-200 dark:border-[var(--line)] shadow-sm p-6 space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4.5" noValidate>
              {phoneField(
                'mobile'
              )}

              {passwordField(
                'mobile'
              )}

              <div className="flex items-center justify-end pt-0.5">
                <Link
                  to="/forgot-password?type=customer"
                  className="text-xs font-semibold text-brand-orange hover:text-brand-orange-dark hover:underline transition-colors cursor-pointer"
                >
                  Forgot password?
                </Link>
              </div>

              {serverError && (
                <p className="field-error" role="alert">
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={!formValid || isSubmitting}
                className={`btn btn--lg btn--block rounded-xl ${
                  formValid && !isSubmitting
                    ? 'btn--primary text-white cursor-pointer btn-press'
                    : 'btn--secondary cursor-not-allowed opacity-60'
                }`}
              >
                {isSubmitting ? <AuthenticatingSkeleton /> : 'Sign In'}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-[var(--muted)] font-semibold pt-6">
          Don&apos;t have an account?{' '}
          <Link to="/signup/role" className="text-brand-orange font-semibold hover:underline">
            Sign up
          </Link>
        </p>
      </div>

      {/* DESKTOP LOGIN LAYOUT (Image 3 Wireframe) */}
      <div className="hidden md:flex flex-col justify-center min-h-[460px] px-4 py-10 animate-fade-in">
        <div className="w-full max-w-md mx-auto bg-white dark:bg-[var(--surface)] rounded-2xl border border-slate-200 dark:border-[var(--line)] shadow-sm p-6 sm:p-8 space-y-6">
          {/* Rule 69: the "back" button sits at the TOP LEFT of the container,
              before the branding, not stranded mid-card. */}
          <div className="flex justify-start">
            <BackButton to="/home" />
          </div>

          <div className="space-y-3 text-center">
            <img
              src={brandLogo}
              alt="Tindahan ni Isko"
              className="h-16 w-auto object-contain mx-auto"
            />
            <div>
              <h1 className="page-title text-gray-900 dark:text-[var(--ink)]">Sign In</h1>
              <p className="text-sm text-gray-500 dark:text-[var(--muted)] font-medium mt-1 leading-relaxed">
                Access your orders, bag, and favorite products anytime, anywhere.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4.5" noValidate>
            {phoneField('desktop')}
            {passwordField('desktop')}

            <div className="flex items-center justify-end pt-0.5">
              <Link
                to="/forgot-password?type=customer"
                className="text-xs font-semibold text-brand-orange hover:text-brand-orange-dark hover:underline transition-colors cursor-pointer"
              >
                Forgot password?
              </Link>
            </div>

            {serverError && (
              <p className="field-error" role="alert">
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={!formValid || isSubmitting}
              className={`btn btn--lg btn--block rounded-xl ${
                formValid && !isSubmitting
                  ? 'btn--primary text-white cursor-pointer btn-press'
                  : 'btn--secondary cursor-not-allowed opacity-60'
              }`}
            >
              {isSubmitting ? <AuthenticatingSkeleton /> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 dark:text-[var(--muted)] font-semibold pt-1 border-t border-slate-100 dark:border-[var(--line)]">
            Don&apos;t have an account?{' '}
            <Link to="/signup/role" className="text-brand-orange font-semibold hover:underline">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </AppShell>
  )
}

export default SignIn
