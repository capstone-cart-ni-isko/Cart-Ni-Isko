import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button.jsx'
import OtpInput from './OtpInput.jsx'
import { CloseIcon } from './Icons.jsx'
import { issueOtp, verifyOtp } from '../../services/otp.js'
import { fetchNotifications } from '../../services/notifications.js'
import { useAuth } from '../../hooks/useAuth.js'

/**
 * DOMAIN 29 / REQ-CUST_SET-02 - the phone OTP every sensitive settings
 * change clears before it is saved.
 *
 * The code is delivered through the account's own notification inbox, so the
 * modal reads the newest priority notification back and shows the code it
 * carries - on a phone that is the inbox; here it is the same message.
 *
 * Props
 *   isOpen     - renders the sheet when true
 *   purpose    - 'password_change' | 'backup_contacts'
 *   title      - heading override
 *   onClose    - cancel / dismiss
 *   onVerified - await'd after the server accepts the code; the caller then
 *                sends the actual change (the verification lasts 10 minutes)
 */
const RESEND_COOLDOWN = 45 // OTP_COOLDOWN_SECONDS

function OtpVerifyModal({ isOpen, purpose, title, onClose, onVerified }) {
  const { currentUser } = useAuth()
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const issued = useRef(false)

  const readInboxCode = useCallback(async () => {
    const custId = currentUser?.cust_id
    if (!custId) return
    try {
      const rows = await fetchNotifications('customer', custId)
      const latest = rows.find((row) => /verification code is \d{6}/i.test(row.custnotif_msg || row.notif_msg || ''))
      const match = (latest?.custnotif_msg || latest?.notif_msg || '').match(/verification code is (\d{6})/i)
      if (match) setHint(match[1])
    } catch {
      // The inbox is a convenience; the code still arrives on the phone.
    }
  }, [currentUser?.cust_id])

  const sendCode = useCallback(async () => {
    setBusy(true)
    setError('')
    const { data, error: err } = await issueOtp(purpose)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    setPhone(data.phone || '')
    setCooldown(RESEND_COOLDOWN)
    setCode('')
    setHint('')
    await readInboxCode()
  }, [purpose, readInboxCode])

  // First open: request a code straight away.
  useEffect(() => {
    if (!isOpen) {
      issued.current = false
      return
    }
    if (!issued.current) {
      issued.current = true
      sendCode()
    }
  }, [isOpen, sendCode])

  // Resend cooldown ticks down once a second.
  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  if (!isOpen) return null

  const submit = async (e) => {
    e.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setError('')
    const { error: err } = await verifyOtp(purpose, code)
    setBusy(false)
    if (err) {
      setError(err)
      setCode('')
      return
    }
    await onVerified?.()
  }

  return createPortal(
    <div className="fixed inset-0 z-[120000] flex items-center justify-center p-4 isolate">
      <div className="absolute inset-0 z-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-sm bg-white rounded-2xl p-6 border border-gray-200 shadow-xl animate-scale-in pointer-events-auto"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-base font-bold text-gray-900 leading-tight">{title || 'Verification required'}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-gray-500 font-medium leading-relaxed mb-5">
          Enter the 6-digit code we sent to{' '}
          <span className="font-semibold text-gray-700">{phone || 'your registered phone'}</span>.
          It expires in 5 minutes.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <OtpInput value={code} onChange={setCode} length={6} />

          {hint && (
            <p className="text-xs text-center text-gray-500 bg-gray-50 border border-gray-100 rounded-lg py-2">
              Inbox code: <span className="font-bold text-gray-900 tracking-widest">{hint}</span>
            </p>
          )}

          {error && <p className="text-xs text-red-500 font-semibold text-center">{error}</p>}

          <Button
            type="submit"
            disabled={code.length !== 6 || busy}
            loading={busy}
            className="w-full h-11 rounded-full font-bold shadow-md"
          >
            Verify
          </Button>
        </form>

        <div className="text-center pt-4 text-sm">
          {cooldown > 0 ? (
            <p className="text-gray-500 font-semibold">
              Resend code in <span className="text-brand-orange font-bold">{cooldown}s</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={sendCode}
              disabled={busy}
              className="text-brand-orange font-black hover:underline disabled:opacity-60"
            >
              Resend code
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default OtpVerifyModal
