import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import OtpInput from '../components/ui/OtpInput.jsx'
import Button from '../components/ui/Button.jsx'
import backIcon from '../assets/icons/common/back.svg'

function VerifyOtp() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser } = useAuth()
  const { showToast } = useToast()

  const state = location.state || {}
  const phone = state.phone || '+63 9** *** **99'
  const fromSignIn = state.fromSignIn || false

  const [otp, setOtp] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [timer, setTimer] = useState(59)

  useEffect(() => {
    if (timer <= 0) return
    const interval = setInterval(() => {
      setTimer((t) => t - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [timer])

  async function handleSubmit(e) {
    e.preventDefault()
    if (otp.length < 6) return

    setIsSubmitting(true)
    await new Promise((r) => setTimeout(r, 800))
    setIsSubmitting(false)

    // Simulate OTP validation
    if (otp === '123456' || otp.length === 6) {
      showToast('OTP verified successfully!')
      localStorage.setItem('isko_device_verified', 'true')
      
      if (fromSignIn) {
        navigate('/home')
      } else {
        // Fallback or backup
        navigate('/home')
      }
    } else {
      showToast('Invalid verification code. Try again.', 'error')
    }
  }

  function handleResend() {
    setTimer(59)
    setOtp('')
    showToast('A new verification code has been sent!')
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Centered OTP Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl border border-gray-100 shadow-xl p-8 flex flex-col justify-between min-h-[580px] z-10 animate-fade-in">
        <div>
          {/* Header row with back button */}
          <div className="flex items-center mb-6">
            <button
              type="button"
              onClick={() => navigate('/signin')}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <img src={backIcon} alt="Back" className="w-5 h-5" />
            </button>
          </div>

          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Verify Device</h1>
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mt-4 mb-2">
            Check your messages
          </h2>
          <p className="text-sm text-gray-500 mb-8 leading-relaxed">
            We've sent a 6-digit verification code to <span className="font-semibold text-gray-700">{phone}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            <OtpInput value={otp} onChange={setOtp} length={6} />

            <Button
              type="submit"
              disabled={otp.length < 6 || isSubmitting}
              className="w-full h-12 rounded-full shadow-md font-bold"
            >
              {isSubmitting ? 'Verifying...' : 'Verify'}
            </Button>
          </form>
        </div>

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
                className="text-brand-orange font-black hover:underline focus:outline-none"
              >
                Resend code
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default VerifyOtp
