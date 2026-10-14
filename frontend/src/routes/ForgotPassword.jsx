import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import Button from '../components/ui/Button.jsx'
import OtpInput from '../components/ui/OtpInput.jsx'
import BackButton from '../components/ui/BackButton.jsx'
import { recoverCredentials, updateCredentials } from '../services/auth.js'
import { verifyOtp } from '../services/otp.js'

function ForgotPassword() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [step, setStep] = useState(0) // 0: Identifier, 1: OTP, 2: Reset
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [timer, setTimer] = useState(59)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [userType, setUserType] = useState('customer')

  useEffect(() => {
    const saved = localStorage.getItem('isko_forgot_type')
    if (saved === 'customer' || saved === 'employee') {
      setUserType(saved)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('isko_forgot_type', userType)
    } catch {
      // Storage can be unavailable (private mode, quota) - the flow still works.
    }
  }, [userType])

  const handleIdentifierSubmit = async (e) => {
    e.preventDefault()
    const identifierVal = identifier.trim()
    if (userType === 'customer') {
      if (identifierVal.length < 10) return
    } else {
      if (!identifierVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifierVal)) return
    }
    setIsSubmitting(true)
    const { error } = await recoverCredentials(identifierVal, userType)
    setIsSubmitting(false)
    if (error) {
      showToast(error, 'error')
      return
    }
    setStep(1)
    setTimer(59)
    showToast('Verification code sent!')
    localStorage.setItem('isko_forgot_type', userType)
  }

  const handleOtpSubmit = async (e) => {
    e.preventDefault()
    if (otp.length < 4 || isSubmitting) return
    setIsSubmitting(true)
    setOtpError('')
    // The code is cleared against the real OTP verify flow (services/otp.js)
    // instead of being accepted blindly, so a wrong code never advances.
    const { error } = await verifyOtp('password_change', otp)
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
    const { error } = await updateCredentials({
      identifier: identifier.trim(),
      password,
    })
    setIsSubmitting(false)
    if (error) {
      showToast(error, 'error')
      return
    }
    showToast('Password reset successfully. Please sign in.')
    navigate('/signin')
  }

  // FLOW: "Resend" re-runs the SAME send path as the identifier step instead of
  // only resetting the timer, so a real code is actually re-issued.
  const handleResend = async () => {
    const identifierVal = identifier.trim()
    setIsSubmitting(true)
    const { error } = await recoverCredentials(identifierVal, userType)
    setIsSubmitting(false)
    if (error) {
      showToast(error, 'error')
      return
    }
    setTimer(59)
    setOtp('')
    setOtpError('')
    showToast('A new verification code has been sent!')
  }

  const prevStep = () => {
    if (step > 0) {
      setStep((s) => s - 1)
    } else {
      navigate('/signin')
    }
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const passwordsMatch = password.length > 0 && password === confirmPassword
  const passwordLengthValid = password.length >= 8
  const resetValid = passwordLengthValid && passwordsMatch

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Centered Forgot Password Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl border border-gray-100 shadow-xl p-8 flex flex-col justify-between min-h-[580px] z-10 animate-fade-in">
        <div>
          {/* Header Row */}
          <div className="flex items-center mb-4">
            <BackButton onClick={prevStep} label="Back" />
            <div className="ml-4">
              <div className="flex gap-2">
                <button
                  key="customer"
                  type="button"
                  onClick={() => setUserType('customer')}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                    userType === 'customer'
                      ? 'bg-brand-orange text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Customer
                </button>
                <button
                  key="employee"
                  type="button"
                  onClick={() => setUserType('employee')}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                    userType === 'employee'
                      ? 'bg-brand-orange text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Employee
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Select account type</p>
            </div>
          </div>

          {step === 0 && (
            <div className="animate-fade-in">
              <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Confirm it's you</h1>
              <p className="text-sm text-gray-500 font-semibold mb-8 leading-relaxed">
                {userType === 'customer'
                  ? 'Enter the phone number associated with your account.'
                  : 'Enter your university email address.'}
              </p>

              <form onSubmit={handleIdentifierSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    {userType === 'customer' ? 'Phone Number' : 'Email Address'}
                  </label>
                  <input
                    type="tel"
                    placeholder={userType === 'customer' ? 'Enter phone number' : 'you@bicol-u.edu.ph'}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full h-12 px-4 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all"
                  />

                  <Button
                    type="submit"
                    disabled={identifier.trim().length < (userType === 'customer' ? 10 : undefined) || isSubmitting}
                    className="w-full h-12 rounded-full font-bold shadow-md"
                  >
                    {isSubmitting ? 'Sending...' : 'Continue'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {step === 1 && (
            <div className="animate-fade-in">
              <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Verify Code</h1>
              <p className="text-sm text-gray-500 font-semibold mb-8 leading-relaxed">
                Enter the 4-digit code sent to <span className="font-semibold text-gray-700">{identifier}</span>
              </p>

              <form onSubmit={handleOtpSubmit} className="space-y-6">
                <OtpInput
                  value={otp}
                  onChange={(v) => {
                    setOtp(v)
                    if (otpError) setOtpError('')
                  }}
                  length={4}
                />

                {otpError && (
                  <p className="field-error" role="alert">
                    {otpError}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={otp.length < 4 || isSubmitting}
                  className="w-full h-12 rounded-full font-bold shadow-md"
                >
                  {isSubmitting ? 'Verifying...' : 'Continue'}
                </Button>
              </form>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in">
              <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Reset Password</h1>
              <p className="text-sm text-gray-500 font-semibold mb-8 leading-relaxed">
                Set a strong and secure password for your student storefront account.
              </p>

              <form onSubmit={handleResetSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-12 px-4 pr-12 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-450 hover:text-brand-orange transition-colors"
                    >
                      {showPass ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {password.length > 0 && !passwordLengthValid && (
                    <p className="text-red-500 text-xs mt-1 font-semibold">
                      Your password must be at least 8 characters.
                    </p>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full h-12 px-4 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all"
                    />
                    {confirmPassword.length > 0 && !passwordsMatch && (
                      <p className="text-red-500 text-xs mt-1 font-semibold">
                        Passwords do not match.
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={!resetValid || isSubmitting}
                  className="w-full h-12 rounded-full font-bold shadow-md mt-4"
                >
                  {isSubmitting ? 'Resetting...' : 'Reset'}
                </Button>
              </form>
            </div>
          )}

          {step === 1 && (
            <div className="text-center pt-6">
              {timer > 0 ? (
                <p className="text-sm text-gray-400 font-semibold">
                  Resend code in <span className="text-brand-orange font-bold">{formatTime(timer)}</span>
                </p>
              ) : (
                <p className="text-sm text-gray-500 font-semibold">
                  Didn't receive a code?{' '}
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-brand-orange font-black hover:underline"
                  >
                    Resend
                  </button>
                </p>
              )}
            </div>
          )}

          <div />
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword