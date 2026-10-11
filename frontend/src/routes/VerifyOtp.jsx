import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { startOtpChallenge, readChallengeInbox } from '../services/otp.js'
import OtpInput from '../components/ui/OtpInput.jsx'
import Button from '../components/ui/Button.jsx'
import BackButton from '../components/ui/BackButton.jsx'

/**
 * DOMAIN 17 / DOMAIN 18 - the phone OTP gate.
 *
 * Reached from a signup (FLOW-CUST_SIGNUP-05) or from a login taken more
 * than fifteen days after the last logout (FLOW-CUST_LOGIN-02). The caller
 * owns no session yet, so the screen works through the signed `challenge`
 * carried in the navigation state; the six-digit code itself is read back
 * from the account's own notification inbox (REQ-CUST_SIGNUP-04 allows
 * in-app delivery, and this page is shown before any session exists).
 */
function VerifyOtp() {
  const navigate = useNavigate()
  const location = useLocation()
  const { verifyOtpChallenge } = useAuth()
  const { showToast } = useToast()

  const state = location.state || {}
  const challenge = state.challenge || ''
  const purpose = state.purpose || 'login'
  const phone = state.phone || 'your registered number'

  const [otp, setOtp] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [timer, setTimer] = useState(59)
  const [inboxCode, setInboxCode] = useState('')
  const [inboxError, setInboxError] = useState('')
  const [copied, setCopied] = useState(false)

  /** REQ-CUST_SIGNUP-04: the code is delivered to the account's inbox. */
  const loadInbox = useCallback(async () => {
    if (!challenge) return
    const { data, error } = await readChallengeInbox(challenge, purpose)
    if (error) {
      setInboxError(error)
      return
    }
    setInboxError('')
    setInboxCode(data?.code || '')
  }, [challenge, purpose])

  useEffect(() => {
    loadInbox()
  }, [loadInbox])

  useEffect(() => {
    if (timer <= 0) return
    const interval = setInterval(() => {
      setTimer((t) => t - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [timer])

  async function handleSubmit(e) {
    e.preventDefault()
    if (otp.length < 6 || isSubmitting) return

    setIsSubmitting(true)
    const { user, error } = await verifyOtpChallenge(challenge, purpose, otp)
    setIsSubmitting(false)

    if (error || !user) {
      // REQ-CUST_LOGIN-02's sibling rule: a rejected code never empties the
      // field the customer just typed - only the message changes.
      setServerError(error || 'Unable to verify the code')
      showToast(error || 'Unable to verify the code', 'error')
      return
    }

    setServerError('')
    showToast(
      purpose === 'signup'
        ? 'Phone number verified. Your account is ready!'
        : 'Verified successfully!'
    )
    // FLOW-CUST_LOGIN-03 / FLOW-CUST_SIGNUP-05: the session is open now.
    navigate('/home', { replace: true })
  }

  async function handleResend() {
    if (!challenge) return
    const { error } = await startOtpChallenge(challenge, purpose)
    if (error) {
      showToast(error, 'error')
      return
    }
    setTimer(59)
    setOtp('')
    setServerError('')
    setCopied(false)
    showToast('A new verification code has been sent to your notification inbox!')
    await loadInbox()
  }

  async function handleCopy() {
    if (!inboxCode) return
    try {
      await navigator.clipboard.writeText(inboxCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be blocked; the code stays visible on screen anyway.
    }
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // A refresh (or a deep link without state) leaves no challenge to redeem:
  // send the customer back to where the code can be requested again.
  if (!challenge) {
    return (
      <div className="min-h-dvh bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-3xl border border-gray-100 shadow-xl p-8 text-center space-y-5 animate-fade-in">
          <h1 className="text-2xl font-extrabold text-gray-900">Verification session expired</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Please sign in or sign up again to request a new verification code.
          </p>
          <Button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full h-12 rounded-full font-bold shadow-md"
          >
            Back to Login
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Centered OTP Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl border border-gray-100 shadow-xl p-8 flex flex-col justify-between min-h-[580px] z-10 animate-fade-in">
        <div>
          {/* Header row with back button */}
          <div className="flex items-center mb-6">
            <BackButton
              to={state.fromSignIn ? '/login' : '/signup/role'}
              label={state.fromSignIn ? 'Back to Login' : 'Back to Sign Up'}
            />
          </div>

          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Verify Phone</h1>
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mt-4 mb-2">
            Check your notification inbox
          </h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            We&apos;ve sent a 6-digit verification code to{' '}
            <span className="font-semibold text-gray-700">{phone}</span>
          </p>

          {/* REQ-CUST_SIGNUP-04: in-app delivery - the code is readable here. */}
          <div className="mb-6 rounded-2xl border border-brand-orange/30 bg-brand-orange/5 p-4">
            {inboxCode ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Your code
                  </p>
                  <p className="text-xl font-black text-gray-900 tracking-[0.3em]">{inboxCode}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-xs font-black text-brand-orange hover:underline focus:outline-none"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ) : (
              <p className="text-xs font-semibold text-gray-500">
                {inboxError ||
                  'The code is delivered to your in-app notifications. It will appear here.'}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <OtpInput value={otp} onChange={setOtp} length={6} />

            {serverError && (
              <p className="text-red-500 text-sm font-semibold text-center" role="alert">
                {serverError}
              </p>
            )}

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
              Didn&apos;t receive a code?{' '}
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
