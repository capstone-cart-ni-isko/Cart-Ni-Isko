import { useCallback, useEffect, useRef, useState } from 'react'
import Button from './Button.jsx'
import Modal from './Modal.jsx'
import OtpInput from './OtpInput.jsx'
import { issueOtp, verifyOtp, fetchAutoFilledCode } from '../../services/otp.js'

/**
 * DOMAIN 29 / REQ-CUST_SET-02 - the phone OTP every sensitive settings
 * change clears before it is saved.
 *
 * The code is delivered to the account's own channel (in-app notification
 * inbox for a customer, the Bicol University mailbox for an employee); it is
 * never echoed back into the UI, so the customer must read it where it was
 * sent.
 *
 * The AUTO-FILL feature (both portals) additionally loads the just-delivered
 * code and places it in the input on its own, so the user does not have to
 * type the six digits. Manual entry always stays available, and the call is
 * best effort: it simply has nothing to offer once real email and phone
 * delivery is connected.
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
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  // Which channel the server used: customers are reached by phone, the admin
  // side by the employee's Bicol University mailbox.
  const [channel, setChannel] = useState('phone')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const issued = useRef(false)

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

    // AUTO-FILL: the delivered code is placed in the input on its own, so
    // the user does not have to type it. When there is nothing to fill (for
    // example once real email and phone delivery is connected), the manual
    // entry the user types stays exactly as before.
    const filled = await fetchAutoFilledCode()
    if (!filled.error && filled.data?.code) {
      setCode((current) => (current === '' ? filled.data.code : current))
    }
  }, [purpose])

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
