import { useEffect, useRef, useState, useCallback } from 'react'
import { useToast } from '../../hooks/useToast.js'
import { scanQr } from '../../services/tracking.js'

/**
 * QRScanner - Camera-based QR code scanner using html5-qrcode
 * Props:
 *   onScan: (code: string) => void - Callback when QR code is scanned
 *   onError: (error: string) => void - Callback when error occurs
 *   className: string - Additional CSS classes
 *   style: React.CSSProperties - Inline styles
 */
export default function QRScanner({ onScan, onError, className = '', style }) {
  const scannerRef = useRef(null)
  const [hasPermission, setHasPermission] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const scannerInstance = useRef(null)
  const lastScannedCode = useRef(null)
  const scanCooldown = useRef(false)

  const handleScanSuccess = useCallback((decodedText) => {
    // Prevent duplicate scans within 2 seconds
    if (scanCooldown.current || lastScannedCode.current === decodedText) return
    
    lastScannedCode.current = decodedText
    scanCooldown.current = true
    
    onScan?.(decodedText)
    
    // Reset cooldown after 2 seconds
    setTimeout(() => {
      scanCooldown.current = false
      lastScannedCode.current = null
    }, 2000)
  }, [onScan])

  const handleScanFailure = useCallback((error) => {
    // html5-qrcode calls this frequently for failed scans - ignore
    // Only log actual errors, not "No QR code found" type messages
    if (error && !error.includes('No QR code found') && !error.includes('code not found')) {
      console.debug('QR scan failed:', error)
    }
  }, [])

  const startScanner = useCallback(async () => {
    if (isScanning || !scannerRef.current) return

    try {
      const { Html5QrcodeScanner } = await import('html5-qrcode')
      
      scannerInstance.current = new Html5QrcodeScanner(
        scannerRef.current,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          disableFlip: false,
          rememberLastUsedCamera: true,
        },
        false
      )

      await scannerInstance.current.render(handleScanSuccess, handleScanFailure)
      setIsScanning(true)
      setHasPermission(true)
    } catch (err) {
      const errorMsg = err?.message || 'Failed to start camera'
      console.error('QR Scanner error:', err)
      
      if (err?.name === 'NotAllowedError' || errorMsg.includes('permission')) {
        setHasPermission(false)
        onError?.('Camera permission denied. Please allow camera access in your browser settings.')
      } else {
        onError?.(errorMsg)
      }
      setIsScanning(false)
    }
  }, [isScanning, handleScanSuccess, handleScanFailure, onError])

  const stopScanner = useCallback(async () => {
    if (!isScanning || !scannerInstance.current) return
    
    try {
      await scannerInstance.current.clear()
      setIsScanning(false)
    } catch (err) {
      console.error('Error stopping scanner:', err)
    }
  }, [isScanning])

  // Start on mount, stop on unmount
  useEffect(() => {
    startScanner()
    return () => stopScanner()
  }, [startScanner, stopScanner])

  // Handle permission changes
  useEffect(() => {
    if (hasPermission === false) {
      stopScanner()
    }
  }, [hasPermission, stopScanner])

  if (hasPermission === false) {
    return (
      <div className={`w-full aspect-video bg-slate-100 rounded-xl flex flex-col items-center justify-center p-4 ${className}`} style={style}>
        <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-rose-600">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="9" x2="12.01" y2="9" />
          </svg>
        </div>
        <p className="text-center text-slate-700 font-medium mb-1">Camera Access Required</p>
        <p className="text-center text-sm text-slate-500 mb-4 max-w-xs">
          Please allow camera access in your browser settings to scan QR codes.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-brand-orange text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className={`relative w-full aspect-video bg-slate-900 rounded-xl overflow-hidden ${className}`} style={style}>
      <div ref={scannerRef} className="w-full h-full" />
      
      {/* Scanning overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {/* Corner brackets */}
        <div className="relative w-3/4 aspect-square max-w-[280px] max-h-[280px]">
          <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-brand-orange rounded-tl-lg" />
          <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-brand-orange rounded-tr-lg" />
          <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-brand-orange rounded-bl-lg" />
          <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-brand-orange rounded-br-lg" />
          
          {/* Center line animation */}
          <div className="absolute left-1/2 top-2 -translate-x-1/2 w-px h-3/4 bg-brand-orange/50 animate-pulse" />
        </div>
        
        <p className="mt-4 text-white/80 text-sm font-medium text-center px-4">
          Position QR code within the frame
        </p>
        <p className="text-white/50 text-xs text-center px-4 mt-1">
          The scanner will automatically detect the code
        </p>
      </div>

      {/* Loading state */}
      {!isScanning && hasPermission !== false && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-white text-sm">Starting camera...</p>
          </div>
        </div>
      )}

      {/* Manual input fallback */}
      <div className="absolute bottom-4 left-4 right-4">
        <button
          onClick={stopScanner}
          className="w-full sm:w-auto mx-auto sm:mx-0 px-4 py-2 bg-black/60 backdrop-blur-sm text-white text-sm font-medium rounded-lg hover:bg-black/70 transition-colors"
        >
          Stop Scanner
        </button>
      </div>
    </div>
  )
}

/**
 * Camera-scan modal used by the customer claiming flows.
 *
 * FLOW-ORD_CLAIM-01 (pickup: scan the order's `appoint_qr` from /orders or
 * /appointments) and FLOW-ORD_CLAIM-07 (delivery: scan the parcel's
 * `deliver_qr`). Whatever the camera reads is posted to `POST /tracking/scan`
 * as { code, scanned_by: 'customer' }; the server's message is surfaced and
 * `onSuccess` fires so the caller can re-fetch its order.
 *
 * `fallbackCode` offers a button with the code the order payload already
 * carries, because a phone camera cannot read the QR shown on its own screen.
 */
export function QrScanModal({
  open,
  title = 'Scan QR code',
  subtitle = 'Point the camera at the code on your order or parcel.',
  fallbackCode = null,
  fallbackLabel = "Use this order's code",
  onClose,
  onSuccess,
}) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) setError('')
  }, [open])

  const submit = useCallback(
    async (code) => {
      const value = String(code ?? '').trim()
      if (busy) return
      if (!value) {
        setError('No QR code detected. Please try again.')
        return
      }

      setBusy(true)
      setError('')
      try {
        const res = await scanQr(value, 'customer')
        showToast(res?.message || 'Order updated successfully.', 'success')
        onClose?.()
        onSuccess?.(res)
      } catch (err) {
        setError(err?.message || 'Scan failed. Please try again.')
      } finally {
        setBusy(false)
      }
    },
    [busy, onClose, onSuccess, showToast]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-md flex items-center justify-center px-4 animate-fade-in">
      <div className="bg-white rounded-xl border border-slate-200 w-full max-w-md shadow-xl animate-scale-in overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Close scanner"
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <QRScanner
            onScan={(code) => submit(code)}
            onError={(scanError) => setError(scanError)}
            className="w-full aspect-video"
          />
          {error && <p className="mt-2 text-center text-xs text-rose-600">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/40">
          {fallbackCode ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(fallbackCode)}
              className="h-8 px-3 rounded-md border border-brand-orange text-xs font-bold text-brand-orange hover:bg-orange-50 disabled:opacity-50 cursor-pointer"
            >
              {fallbackLabel}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => onClose?.()}
            className="h-8 px-3 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            {busy ? 'Verifying…' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}