import { useCallback, useState } from 'react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import QRScanner from '../../components/ui/QRScanner.jsx'
import { useToast } from '../../hooks/useToast.js'
import { scanQr } from '../../services/tracking.js'

/**
 * FLOW-EMP_HOME-07 — the "QR" icon in the navigation ribbon opens the
 * "QR scanner" page.
 *
 * Every scan is handed to POST /tracking/scan (the same endpoint the pickup
 * and appointment claims use), so the result the employee sees is whatever
 * the backend decided - a claim, an appointment close, or a rejection - and
 * never a client-side guess.
 */
export default function AdminQr() {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [lastScan, setLastScan] = useState(null) // { ok, code, message }

  const handleScan = useCallback(
    async (code) => {
      if (busy) return
      setBusy(true)
      try {
        const res = await scanQr(code, 'employee')
        const message = res?.message || 'Code accepted.'
        setLastScan({ ok: true, code, message })
        showToast(message, 'success')
      } catch (err) {
        const message = err?.message || 'This code could not be processed.'
        setLastScan({ ok: false, code, message })
        showToast(message, 'error')
      } finally {
        setBusy(false)
      }
    },
    [busy, showToast]
  )

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="page-title text-slate-900">QR Scanner</h1>
          <p className="text-sm text-slate-500 font-normal mt-1">
            Point the camera at an appointment or pickup QR code to verify it.
          </p>
        </div>

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-brand-orange">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <path d="M14 14h3v3h-3z" />
                  <path d="M21 14v1" />
                  <path d="M21 21v-4" />
                  <path d="M14 21h1" />
                  <path d="M18 18h3v3h-3z" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Scan a code</h2>
                <p className="text-[11px] text-slate-400">
                  {busy ? 'Verifying…' : 'Waiting for a QR code'}
                </p>
              </div>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
                lastScan?.ok
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  : lastScan
                    ? 'bg-rose-50 text-rose-600 border-rose-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {lastScan ? (lastScan.ok ? 'Accepted' : 'Rejected') : 'Ready'}
            </span>
          </div>

          <div className="p-4">
            <QRScanner onScan={handleScan} className="w-full aspect-video" />
            {lastScan && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2.5 text-xs font-medium ${
                  lastScan.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                <p>{lastScan.message}</p>
                <p className="mt-0.5 opacity-70 break-all">Scanned: {lastScan.code}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  )
}
