import { useCallback, useEffect, useRef, useState } from 'react'
import Button from './Button.jsx'
import Modal from './Modal.jsx'
import OtpInput from './OtpInput.jsx'
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
  // Which channel the server used: customers are reached by phone, the admin
  // side by the employee's Bicol University mailbox.
  const [channel, setChannel] = useState('phone')
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
    setChannel(data.channel || (data.email ? 'email' : 'phone'))
    setPhone(data.email || data.phone || '')
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || 'Verification required'}
      footer={
        <Button
          type="submit"
          form="otp-verify-form"
          disabled={code.length !== 6 || busy}
          loading={busy}
          className="w-full"
        >
          Verify
        </Button>
      }
    >
      <p className="text-sm text-gray-500 font-medium leading-relaxed">
        Enter the 6-digit code we sent to your{' '}
        <span className="font-semibold text-gray-700">
          {channel === 'email' ? 'Bicol University email' : 'registered phone'}
        </span>
        {phone ? (
          <>
            {' '}at <span className="font-semibold text-gray-700">{phone}</span>
          </>
        ) : null}
        . It expires in 5 minutes.
      </p>

      <form id="otp-verify-form" onSubmit={submit} className="space-y-4">
        <OtpInput value={code} onChange={setCode} length={6} />

        {hint && (
          <p className="text-xs text-center text-gray-500 bg-gray-50 border border-gray-100 rounded-md py-2">
            Inbox code: <span className="font-bold text-gray-900 tracking-widest">{hint}</span>
          </p>
        )}

        {error && <p className="field-error text-center">{error}</p>}
      </form>

      <div className="text-center text-sm">
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
    </Modal>
  )
}

export default OtpVerifyModal
