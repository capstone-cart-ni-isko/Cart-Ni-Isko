import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import BackButton from '../components/ui/BackButton.jsx'
import { recoverCredentials, resetCredentials } from '../services/auth.js'
import { passwordProblem, meetsPasswordStandard, PASSWORD_HINT } from '../utils/passwordRules.js'

/*
  Password recovery. There is no SMS gateway, and a code sent to the in-app
  inbox cannot reach someone who is signed out, so ownership is proved with
  the one-time recovery code the account holder saved from Account Settings.
  Step 0: identifier + recovery code. Step 2: new password.
*/
function ForgotPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()

  const [step, setStep] = useState(0) // 0: Identifier + recovery code, 2: Reset
  const [identifier, setIdentifier] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [challenge, setChallenge] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [userType, setUserType] = useState(() => {
    const fromQuery = searchParams.get('type')
    if (fromQuery === 'employee' || fromQuery === 'admin') return 'employee'
    return 'customer'
  })

  useEffect(() => {
    const fromQuery = searchParams.get('type')
    if (fromQuery === 'employee' || fromQuery === 'admin') {
      setUserType('employee')
      return
    }
    const saved = localStorage.getItem('isko_forgot_type')
    if (saved === 'customer' || saved === 'employee') {
      setUserType(saved)
    }
  }, [searchParams])

  useEffect(() => {
    try {
      localStorage.setItem('isko_forgot_type', userType)
    } catch {
      // Storage can be unavailable - the flow still works.
    }
  }, [userType])

  const recoveryCodeValid = recoveryCode.replace(/[^A-Za-z0-9]/g, '').length === 12

  const handleIdentifierSubmit = async (e) => {
    e.preventDefault()
    const identifierVal = identifier.trim()
    if (userType === 'customer') {
      if (identifierVal.length < 5) return
    } else {
      if (!identifierVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifierVal)) return
    }
    if (!recoveryCodeValid) return

    setIsSubmitting(true)
    setRecoveryError('')
    const { data, error } = await recoverCredentials(identifierVal, userType, recoveryCode.trim())
    setIsSubmitting(false)

    if (error || !data?.data?.challenge) {
      setRecoveryError(error || 'The account details or recovery code are incorrect.')
      return
    }

    setChallenge(data.data.challenge)
    setStep(2)
    showToast(data.message || 'Recovery code accepted. Set your new password.')
  }

  const handleResetSubmit = async (e) => {
    e.preventDefault()
    if (!meetsPasswordStandard(password) || password !== confirmPassword) return

    setIsSubmitting(true)
    const { error, code } = await resetCredentials({
      challenge,
      new_password: password,
      new_password_confirmation: confirmPassword,
    })
    setIsSubmitting(false)
    if (error) {
      if (code === 'OTP_REQUIRED' || code === 'CHALLENGE_EXPIRED') {
        // The recovery code is single-use and already spent, so the
        // account holder has to contact the store if the session lapsed.
        showToast('The recovery session expired. Please contact the store to reset your password.', 'error')
        setStep(0)
        setChallenge('')
        return
      }
      showToast(error, 'error')
      return
    }
    showToast('Password reset. Sign in, then generate a new recovery code in Account Settings.')
    if (userType === 'employee') {
      navigate('/admin/login')
    } else {
      navigate('/signin')
    }
  }

  const prevStep = () => {
    if (step > 0) {
      setStep(0)
    } else {
      if (userType === 'employee') {
        navigate('/admin/login')
      } else {
        navigate('/signin')
      }
    }
  }

  const recoveryCodeField = (id) => (
    <div>
      <label htmlFor={id} className="field-label">
        Recovery Code
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXX-XXXX-XXXX"
        value={recoveryCode}
        onChange={(e) => {
          setRecoveryCode(e.target.value.toUpperCase())
          if (recoveryError) setRecoveryError('')
        }}
        className="field-input field-input--lg rounded-xl font-mono tracking-widest"
      />
      <p className="field-hint mt-1.5">
        The 12-character code you saved from Account Settings. No code? Contact the store to reset your password.
      </p>
      {recoveryError && <p className="field-error mt-1">{recoveryError}</p>}
    </div>
  )

  const isCustomer = userType === 'customer'

  const passwordsMatch = password.length > 0 && password === confirmPassword
  const passwordLengthValid = meetsPasswordStandard(password)
  const resetValid = passwordLengthValid && passwordsMatch

  // Dedicated Admin layout matching AdminLogin.jsx and Admin theme
  if (!isCustomer) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center p-4 font-sans bg-slate-50 dark:bg-[var(--surface-2)]">
        <div className="w-full max-w-md bg-white dark:bg-[var(--surface)] rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-[var(--line)] shadow-sm space-y-6 animate-fade-in relative">
          {/* Rule 69: Top-left back button */}
          <div className="flex justify-between items-center">
            <BackButton onClick={prevStep} />
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              Staff &amp; Admin Recovery
            </span>
          </div>

          {/* Admin Brand Header */}
          <div className="text-center space-y-2">
            <h1 className="page-title text-xl sm:text-2xl font-bold text-gray-900 dark:text-[var(--ink)]">
              {step === 0 && 'Reset Staff Credentials'}
              {step === 2 && 'Set New Password'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-[var(--muted)] font-medium">
              {step === 0 && 'Enter your university email and the recovery code you saved.'}
              {step === 2 && `Create a new password. ${PASSWORD_HINT}`}
            </p>
          </div>

          {/* Step 0: BU Email Identifier */}
          {step === 0 && (
            <form onSubmit={handleIdentifierSubmit} className="space-y-4.5" noValidate>
              <div>
                <label htmlFor="admin-recover-email" className="field-label">
                  BU Email
                </label>
                <div className="relative">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <input
                    id="admin-recover-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="superadmin@bicol-u.edu.ph"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="field-input field-input--lg !pl-10.5 rounded-xl font-medium"
                  />
                </div>
                <p className="field-hint mt-1.5">
                  Must be your registered Bicol University administrative account email.
                </p>
              </div>

              {recoveryCodeField('admin-recovery-code')}

              <button
                type="submit"
                disabled={!identifier.trim() || !recoveryCodeValid || isSubmitting}
                className={`btn btn--lg btn--block rounded-xl ${
                  identifier.trim() && recoveryCodeValid && !isSubmitting
                    ? 'btn--primary text-white cursor-pointer btn-press'
                    : 'btn--secondary cursor-not-allowed opacity-70'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2" role="status" aria-live="polite">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Checking account…
                  </span>
                ) : (
                  <span>Verify Recovery Code</span>
                )}
              </button>
            </form>
          )}

          {/* Step 2: New Password Form */}
          {step === 2 && (
            <form onSubmit={handleResetSubmit} className="space-y-4.5" noValidate>
              <div>
                <label className="field-label" htmlFor="admin-new-password">
                  New Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="admin-new-password"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field-input field-input--lg pr-16 rounded-xl font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500 hover:text-brand-orange"
                  >
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="admin-confirm-password">
                  Confirm Password <span className="text-rose-500">*</span>
                </label>
                <input
                  id="admin-confirm-password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="field-input field-input--lg rounded-xl font-medium"
                />
                {confirmPassword && !passwordsMatch && (
                  <p className="field-error mt-1">Passwords do not match.</p>
                )}
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                <p className="font-semibold text-gray-700 dark:text-gray-200">Password requirement:</p>
                <p>{PASSWORD_HINT} Choose a unique password you do not use elsewhere.</p>
              </div>

              <button
                type="submit"
                disabled={!resetValid || isSubmitting}
                className={`btn btn--lg btn--block rounded-xl ${
                  resetValid && !isSubmitting
                    ? 'btn--primary text-white cursor-pointer btn-press'
                    : 'btn--secondary cursor-not-allowed opacity-70'
                }`}
              >
                {isSubmitting ? 'Updating Password…' : 'Reset Password'}
              </button>
            </form>
          )}

          {/* Footer security note */}
          <div className="text-center pt-2 border-t border-slate-100 dark:border-[var(--line)]">
            <p className="text-xs text-gray-400 dark:text-[var(--muted)]">
              Protected by Bicol University Student Council IAM System
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Dedicated Customer Storefront Recovery Layout (Mobile PWA & Desktop Web)
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--surface-2)] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      <div className="w-full max-w-md bg-white dark:bg-[var(--surface)] rounded-2xl border border-slate-200 dark:border-[var(--line)] shadow-sm p-6 sm:p-8 space-y-6 animate-fade-in relative">
        {/* Rule 69: Top-left back button */}
        <div className="flex justify-between items-center">
          <BackButton onClick={prevStep} />
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-brand-orange">
            Customer Account
          </span>
        </div>

        {/* Customer Header */}
        <div className="text-center space-y-2">
          <h1 className="page-title text-xl sm:text-2xl font-bold text-gray-900 dark:text-[var(--ink)]">
            {step === 0 && 'Forgot Password'}
            {step === 2 && 'Set New Password'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-[var(--muted)] font-medium leading-relaxed">
            {step === 0 && 'Enter your registered phone number or email and the recovery code you saved.'}
            {step === 2 && `Create a secure password. ${PASSWORD_HINT}`}
          </p>
        </div>

        {/* Step 0: Customer Phone / Email */}
        {step === 0 && (
          <form onSubmit={handleIdentifierSubmit} className="space-y-4.5" noValidate>
            <div>
              <label htmlFor="customer-identifier" className="field-label">
                Mobile Number or Email
              </label>
              <div className="relative">
                <input
                  id="customer-identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="09XXXXXXXXX or student@bicol-u.edu.ph"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="field-input field-input--lg rounded-xl font-medium"
                />
              </div>
              <p className="field-hint mt-1.5">
                Enter the phone number or university email registered to your customer account.
              </p>
            </div>

            {recoveryCodeField('customer-recovery-code')}

            <button
              type="submit"
              disabled={identifier.trim().length < 5 || !recoveryCodeValid || isSubmitting}
              className={`btn btn--lg btn--block rounded-xl ${
                identifier.trim().length >= 5 && recoveryCodeValid && !isSubmitting
                  ? 'btn--primary text-white cursor-pointer btn-press'
                  : 'btn--secondary cursor-not-allowed opacity-70'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2" role="status" aria-live="polite">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Finding account…
                </span>
              ) : (
                <span>Continue</span>
              )}
            </button>
          </form>
        )}

        {/* Step 2: New Password Form */}
        {step === 2 && (
          <form onSubmit={handleResetSubmit} className="space-y-4.5" noValidate>
            <div>
              <label className="field-label" htmlFor="customer-new-password">
                New Password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="customer-new-password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field-input field-input--lg pr-16 rounded-xl font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500 hover:text-brand-orange"
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
              {password.length > 0 && !passwordLengthValid && (
                <p className="field-error mt-1">{passwordProblem(password)}</p>
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="customer-confirm-password">
                Confirm Password <span className="text-rose-500">*</span>
              </label>
              <input
                id="customer-confirm-password"
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="field-input field-input--lg rounded-xl font-medium"
              />
              {confirmPassword && !passwordsMatch && (
                <p className="field-error mt-1">Passwords do not match.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!resetValid || isSubmitting}
              className={`btn btn--lg btn--block rounded-xl ${
                resetValid && !isSubmitting
                  ? 'btn--primary text-white cursor-pointer btn-press'
                  : 'btn--secondary cursor-not-allowed opacity-70'
              }`}
            >
              {isSubmitting ? 'Resetting Password…' : 'Set New Password'}
            </button>
          </form>
        )}

        <div className="text-center pt-2 border-t border-slate-100 dark:border-[var(--line)]">
          <p className="text-xs text-gray-400 dark:text-[var(--muted)]">
            Tindahan ni Isko · Bicol University Student Storefront
          </p>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword