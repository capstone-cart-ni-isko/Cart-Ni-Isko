import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import Button from '../components/ui/Button.jsx'
import OtpInput from '../components/ui/OtpInput.jsx'
import BackButton from '../components/ui/BackButton.jsx'
import { recoverCredentials, resetCredentials } from '../services/auth.js'
import { redeemOtpChallenge, startOtpChallenge, readChallengeInbox } from '../services/otp.js'

function ForgotPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()

  const [step, setStep] = useState(0) // 0: Identifier, 1: OTP, 2: Reset
  const [identifier, setIdentifier] = useState('')
  const [challenge, setChallenge] = useState('')
  const [maskedContact, setMaskedContact] = useState('')
  const [channel, setChannel] = useState('phone')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [timer, setTimer] = useState(59)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [otpError, setOtpError] = useState('')
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

  useEffect(() => {
    if (step !== 1 || timer <= 0) return
    const interval = setInterval(() => {
      setTimer((t) => t - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [step, timer])

  const loadInboxCode = useCallback(async (challengeToken) => {
    if (!challengeToken) return
    const { data } = await readChallengeInbox(challengeToken, 'recovery')
    if (data?.code) {
      setOtp((cur) => (cur === '' ? data.code : cur))
    }
  }, [])

  const handleIdentifierSubmit = async (e) => {
    e.preventDefault()
    const identifierVal = identifier.trim()
    if (userType === 'customer') {
      if (identifierVal.length < 10) return
    } else {
      if (!identifierVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifierVal)) return
    }

    setIsSubmitting(true)
    const { data, error } = await recoverCredentials(identifierVal, userType)
    setIsSubmitting(false)

    if (error || !data?.data?.challenge) {
      showToast(error || 'Could not verify account. Please try again.', 'error')
      return
    }

    const payload = data.data
    setChallenge(payload.challenge)
    setMaskedContact(payload.contact || identifierVal)
    setChannel(payload.channel || (userType === 'employee' ? 'email' : 'phone'))

    // The code is never echoed by the API - it is delivered through the
    // account's own inbox and read back with the signed challenge, so the
    // OTP input pre-fills from there.
    loadInboxCode(payload.challenge)

    setStep(1)
    setTimer(59)
    showToast(data.message || 'Verification code sent!')
    localStorage.setItem('isko_forgot_type', userType)
  }

  const handleOtpSubmit = async (e) => {
    e.preventDefault()
    if (otp.length < 6 || isSubmitting) return
    setIsSubmitting(true)
    setOtpError('')

    const { error } = await redeemOtpChallenge(challenge, 'recovery', otp)
    setIsSubmitting(false)
    if (error) {
      setOtpError(error || 'That code is not correct.')
      return
    }
    setStep(2)
    showToast('Code verified. Set your new password.')
  }

  const handleResetSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 8 || password !== confirmPassword) return

    setIsSubmitting(true)
    const { error, code } = await resetCredentials({
      challenge,
      new_password: password,
      new_password_confirmation: confirmPassword,
    })
    setIsSubmitting(false)
    if (error) {
      // Machine codes keep the flow moving instead of dead-ending: a stale
      // verification goes back to the OTP step, an expired challenge back to
      // the start.
      if (code === 'OTP_REQUIRED') {
        showToast('That code has expired. Please verify it once more.', 'error')
        setStep(1)
        setOtp('')
        setTimer(59)
        return
      }
      if (code === 'CHALLENGE_EXPIRED') {
        showToast('The recovery session expired. Please start again.', 'error')
        setStep(0)
        setChallenge('')
        return
      }
      showToast(error, 'error')
      return
    }
    showToast('Password reset successfully. Please sign in.')
    if (userType === 'employee') {
      navigate('/admin/login')
    } else {
      navigate('/signin')
    }
  }

  const handleResend = async () => {
    if (!challenge) {
      handleIdentifierSubmit({ preventDefault: () => {} })
      return
    }
    setIsSubmitting(true)
    const { error } = await startOtpChallenge(challenge, 'recovery')
    setIsSubmitting(false)
    if (error) {
      showToast(error, 'error')
      return
    }
    setTimer(59)
    setOtp('')
    setOtpError('')
    showToast('A new verification code has been sent!')
    loadInboxCode(challenge)
  }

  const prevStep = () => {
    if (step > 0) {
      setStep((s) => s - 1)
    } else {
      if (userType === 'employee') {
        navigate('/admin/login')
      } else {
        navigate('/signin')
      }
    }
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const isCustomer = userType === 'customer'

  const passwordsMatch = password.length > 0 && password === confirmPassword
  const passwordLengthValid = password.length >= (isCustomer ? 8 : 8)
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
              {step === 1 && 'Verify Identity'}
              {step === 2 && 'Set New Password'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-[var(--muted)] font-medium">
              {step === 0 && 'Enter your university email to receive a recovery verification code.'}
              {step === 1 && (
                <>
                  Enter the 6-digit verification code sent to{' '}
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{maskedContact || identifier}</span>
                </>
              )}
              {step === 2 && 'Create a new secure password for your administrative account.'}
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

              <button
                type="submit"
                disabled={!identifier.trim() || isSubmitting}
                className={`btn btn--lg btn--block rounded-xl ${
                  identifier.trim() && !isSubmitting
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
                  <span>Send Recovery Code</span>
                )}
              </button>
            </form>
          )}

          {/* Step 1: 6-Digit OTP */}
          {step === 1 && (
            <form onSubmit={handleOtpSubmit} className="space-y-5" noValidate>
              <div className="flex flex-col items-center">
                <OtpInput
                  value={otp}
                  onChange={(v) => {
                    setOtp(v)
                    if (otpError) setOtpError('')
                  }}
                  length={6}
                />
              </div>

              {otpError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium rounded-xl flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{otpError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={otp.length < 6 || isSubmitting}
                className={`btn btn--lg btn--block rounded-xl ${
                  otp.length === 6 && !isSubmitting
                    ? 'btn--primary text-white cursor-pointer btn-press'
                    : 'btn--secondary cursor-not-allowed opacity-70'
                }`}
              >
                {isSubmitting ? 'Verifying…' : 'Verify Code'}
              </button>

              <div className="text-center pt-2">
                {timer > 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    Resend code in <span className="text-brand-orange font-semibold">{formatTime(timer)}</span>
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 font-medium">
                    Didn't receive code?{' '}
                    <button
                      type="button"
                      onClick={handleResend}
                      className="text-brand-orange font-semibold hover:underline"
                    >
                      Resend
                    </button>
                  </p>
                )}
              </div>
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
                <p className="font-semibold text-gray-700 dark:text-gray-200">Password Requirements:</p>
                <p>• Standard accounts: Minimum 8 characters.</p>
                <p>• Super Admin accounts: Minimum 16 characters with uppercase, lowercase, number, and special character.</p>
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
            {step === 1 && 'Enter Verification Code'}
            {step === 2 && 'Set New Password'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-[var(--muted)] font-medium leading-relaxed">
            {step === 0 && 'Enter your registered phone number or email to receive a recovery code.'}
            {step === 1 && (
              <>
                Enter the 6-digit code sent to{' '}
                <span className="font-semibold text-gray-700 dark:text-gray-200">{maskedContact || identifier}</span>
              </>
            )}
            {step === 2 && 'Create a strong and secure password for your student storefront account.'}
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

            <button
              type="submit"
              disabled={identifier.trim().length < 5 || isSubmitting}
              className={`btn btn--lg btn--block rounded-xl ${
                identifier.trim().length >= 5 && !isSubmitting
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

        {/* Step 1: 6-Digit OTP */}
        {step === 1 && (
          <form onSubmit={handleOtpSubmit} className="space-y-5" noValidate>
            <div className="flex flex-col items-center">
              <OtpInput
                value={otp}
                onChange={(v) => {
                  setOtp(v)
                  if (otpError) setOtpError('')
                }}
                length={6}
              />
            </div>

            {otpError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium rounded-xl flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{otpError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={otp.length < 6 || isSubmitting}
              className={`btn btn--lg btn--block rounded-xl ${
                otp.length === 6 && !isSubmitting
                  ? 'btn--primary text-white cursor-pointer btn-press'
                  : 'btn--secondary cursor-not-allowed opacity-70'
              }`}
            >
              {isSubmitting ? 'Verifying…' : 'Verify Code'}
            </button>

            <div className="text-center pt-2">
              {timer > 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  Resend code in <span className="text-brand-orange font-semibold">{formatTime(timer)}</span>
                </p>
              ) : (
                <p className="text-xs text-gray-500 font-medium">
                  Didn't receive code?{' '}
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-brand-orange font-semibold hover:underline"
                  >
                    Resend
                  </button>
                </p>
              )}
            </div>
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
                <p className="field-error mt-1">Must be at least 8 characters.</p>
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