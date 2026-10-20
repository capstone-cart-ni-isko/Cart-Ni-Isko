import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Modal from '../ui/Modal.jsx'

/**
 * The customer's claim pass: the pickup `appoint_qr` rendered as a QR image
 * for store staff to scan at the counter. The customer never scans it
 * themselves - they only present it.
 */
export default function ClaimQrModal({ code, orderId, appointmentId, onClose }) {
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    let alive = true
    setDataUrl('')
    if (!code) return undefined
    QRCode.toDataURL(String(code), {
      margin: 1,
      width: 320,
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setDataUrl(url)
      })
      .catch((err) => console.warn('QR generation failed:', err?.message))
    return () => {
      alive = false
    }
  }, [code])

  return (
    <Modal
      isOpen={Boolean(code)}
      onClose={onClose}
      title={orderId ? `Claim QR · Order #${orderId}` : `Appointment #${appointmentId} QR`}
      subtitle="Show this to the staff at the pickup counter."
    >
      <div className="flex flex-col items-center gap-3 text-center">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Pickup claim QR code"
            className="w-60 h-60 max-w-full rounded-lg bg-white p-2 border border-slate-200"
          />
        ) : (
          <div className="w-60 h-60 max-w-full rounded-lg bg-white border border-slate-200 flex items-center justify-center text-xs text-gray-400">
            Generating QR…
          </div>
        )}
        <code className="text-xs font-mono font-semibold text-slate-700 break-all">{code}</code>
        <p className="text-xs text-slate-500 leading-relaxed">
          Store staff will scan this code together with your student ID to release your order.
          Turn up your screen brightness if it does not scan right away.
        </p>
      </div>
    </Modal>
  )
}
