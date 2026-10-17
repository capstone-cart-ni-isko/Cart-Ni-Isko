import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import QRScanner from '../../components/ui/QRScanner.jsx'
import BackButton from '../../components/ui/BackButton.jsx'
import { useToast } from '../../hooks/useToast.js'
import { useAdmin } from '../../hooks/useAdmin.js'
import { empIsStaff, empHomePath } from '../../components/admin/schema.js'
import { scanQr } from '../../services/tracking.js'

/**
 * FLOW-EMP_HOME-07 — the "QR" icon in the navigation ribbon opens the
 * "QR scanner" focused page.
 *
 * System Rule 65: The elements of another page (homepage ribbon, admin topbar, sidebar)
 * must never show inside a focused page.
 * System Rule 68/69: Working "back" button at the top left.
 */
export default function AdminQr() {
  const { showToast } = useToast()
  const { currentAdminUser } = useAdmin()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [lastScan, setLastScan] = useState(null) // { ok, code, message }

  /** Back button / Esc: return to where the employee came from, else home. */
  const handleBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1)
    else navigate(empHomePath(currentAdminUser), { replace: true })
  }, [navigate, currentAdminUser])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') handleBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleBack])

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

  // Staff has no QR capability (rule 33/41): three layers redirect them away
  // from this screen - the hidden ribbon icon, the role guard on /admin/qr in
  // App.jsx, and this one. Staff land on their own home page. The guard runs
  // AFTER every hook so the hook order never changes between renders.
  if (empIsStaff(currentAdminUser)) {
    return <Navigate to={empHomePath(currentAdminUser)} replace />
  }

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/90 backdrop-blur-xl animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="QR scanner"
    >
        {/* Centered Large-Medium Modal Container */}
        <section className="relative w-full max-w-lg sm:max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-[var(--surface)] rounded-2xl border border-slate-200/90 dark:border-[var(--line)] shadow-2xl overflow-hidden animate-scale-in">
          {/* Header Bar with Back Button */}
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-[var(--line)] bg-slate-50/70 dark:bg-[var(--surface-2)] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <BackButton
                id="admin-qr-back"
                onClick={handleBack}
              />

              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-[var(--ink)] truncate">QR Code Scanner</h2>
                <p className="text-[11px] text-slate-500 dark:text-[var(--muted)] truncate">
                  {busy ? 'Verifying QR code…' : 'Center the QR code in the viewfinder'}
                </p>
              </div>
            </div>

            <span
              className={`text-2xs font-bold px-2.5 py-1 rounded-full border shrink-0 transition-colors ${
                lastScan?.ok
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                  : lastScan
                    ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800'
                    : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-[var(--surface-3)] dark:text-[var(--muted)] dark:border-[var(--line)]'
              }`}
            >
              {lastScan ? (lastScan.ok ? 'Verified' : 'Invalid Code') : 'Ready'}
            </span>
          </div>

          {/* Scanner Body: Large-Medium centered square camera viewfinder */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col items-center">
            <div className="w-full max-w-md">
              <QRScanner onScan={handleScan} className="aspect-square w-full shadow-inner" />
            </div>

            {lastScan && (
              <div
                className={`w-full max-w-md mt-3.5 rounded-xl border px-3.5 py-3 text-xs font-medium animate-fade-in ${
                  lastScan.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="font-bold text-sm shrink-0">
                    {lastScan.ok ? '✓' : '⚠'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{lastScan.message}</p>
                    <p className="mt-1 text-[11px] opacity-80 break-all font-mono">
                      {lastScan.code}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
    </div>
  )
}
