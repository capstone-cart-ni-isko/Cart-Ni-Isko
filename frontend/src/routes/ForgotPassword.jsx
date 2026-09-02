import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import Button from '../components/ui/Button.jsx'
import OtpInput from '../components/ui/OtpInput.jsx'
import backIcon from '../assets/icons/common/back.svg'

function ForgotPassword() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [step, setStep] = useState(0) // 0: Phone, 1: OTP, 2: Reset
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [timer, setTimer] = useState(59)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (step !== 1 || timer <= 0) return
    const interval = setInterval(() => {
      setTimer((t) => t - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [step, timer])

  const handlePhoneSubmit = (e) => {
    e.preventDefault()
    if (phone.trim().length < 10) return
    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      setStep(1)
      setTimer(59)
      showToast('Verification code sent!')
    }, 600)
  }

  const handleOtpSubmit = (e) => {
    e.preventDefault()
    if (otp.length < 4) return
    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      setStep(2)
      showToast('Code verified. Set your new password.')
    }, 600)
  }

  const handleResetSubmit = (e) => {
    e.preventDefault()
    if (password.length < 8 || password !== confirmPassword) return

    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      showToast('Password reset successfully. Please sign in.')
      navigate('/signin')
    }, 800)
  }

  const handleResend = () => {
    setTimer(59)
    setOtp('')
    showToast('A new 4-digit code has been sent!')
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
          <div className="flex items-center mb-8">
            <button
              type="button"
              onClick={prevStep}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <img src={backIcon} alt="Back" className="w-5 h-5" />
            </button>
          </div>

          {step === 0 && (
            <div className="animate-fade-in">
              <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Confirm it's you</h1>
              <p className="text-sm text-gray-500 font-semibold mb-8 leading-relaxed">
                Enter the phone number associated with your account.
              </p>

              <form onSubmit={handlePhoneSubmit} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="Enter phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full h-12 px-4 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={phone.trim().length < 10 || isSubmitting}
                  className="w-full h-12 rounded-full font-bold shadow-md"
                >
                  {isSubmitting ? 'Sending...' : 'Continue'}
                </Button>
              </form>
            </div>
          )}

          {step === 1 && (
            <div className="animate-fade-in">
              <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Verify Code</h1>
              <p className="text-sm text-gray-500 font-semibold mb-8 leading-relaxed">
                Enter the 4-digit code sent to <span className="font-semibold text-gray-700">{phone}</span>
              </p>

              <form onSubmit={handleOtpSubmit} className="space-y-6">
                <OtpInput value={otp} onChange={setOtp} length={4} />

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
                      onClick={() => setShowPass((s) => !s)}
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
                </div>

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
        </div>

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
  )
}

export default ForgotPassword
