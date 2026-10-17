import { useEffect, useRef, useState, useCallback } from 'react'
import { useToast } from '../../hooks/useToast.js'
import { scanQr } from '../../services/tracking.js'
import Modal from './Modal.jsx'
import Button from './Button.jsx'

/**
 * QRScanner - Camera-based QR code scanner using html5-qrcode
 * Props:
 *   onScan: (code: string) => void - Callback when QR code is scanned
 *   onError: (error: string) => void - Callback when error occurs
 *   className: string - Additional CSS classes
 *   style: React.CSSProperties - Inline styles
 */
export default function QRScanner({ onScan, onError, className = 'aspect-video', style }) {
  const scannerRef = useRef(null)
  // html5-qrcode addresses its mount point by element id, not by DOM node.
  const [elementId] = useState(() => `qr-reader-${Math.random().toString(36).slice(2, 9)}`)
  const [hasPermission, setHasPermission] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [cameraError, setCameraError] = useState('')
  // Set when the employee pressed "Stop", so the stage idles with a Start
  // button instead of showing the "Starting camera..." overlay forever.
  const [manuallyStopped, setManuallyStopped] = useState(false)
  // Set by the Retry button on the permission screen: the scanner DOM node is
  // only rendered again on the next paint, so the restart waits for it.
  const [pendingStart, setPendingStart] = useState(false)
  const [manualCode, setManualCode] = useState('')
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
    if (scannerInstance.current || !scannerRef.current) return

    let instance = null
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      // Unmounted (or already started elsewhere) while the module loaded.
      if (scannerInstance.current || !scannerRef.current) return

      instance = new Html5Qrcode(elementId)
      scannerInstance.current = instance

      await instance.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (width, height) => {
            const edge = Math.floor(Math.min(width, height) * 0.7)
            return { width: edge, height: edge }
          },
          aspectRatio: 1.0,
        },
        handleScanSuccess,
        handleScanFailure
      )

      // Stopped or unmounted while the camera was opening: release it now.
      if (scannerInstance.current !== instance) {
        try { await instance.stop() } catch { /* already stopped */ }
        try { instance.clear() } catch { /* nothing to clear */ }
        return
      }
      setIsScanning(true)
      setHasPermission(true)
    } catch (err) {
      const errorMsg = (typeof err === 'string' ? err : err?.message) || 'Failed to start camera'
      console.error('QR Scanner error:', err)
      // A failed instance is never reused - Retry builds a fresh one in place.
      if (scannerInstance.current === instance) scannerInstance.current = null
      setCameraError(errorMsg)
      setManuallyStopped(true)

      if (err?.name === 'NotAllowedError' || /permission|denied/i.test(errorMsg)) {
        setHasPermission(false)
        onError?.('Camera permission denied. Please allow camera access in your browser settings.')
      } else {
        onError?.(errorMsg)
      }
      setIsScanning(false)
    }
  }, [elementId, handleScanSuccess, handleScanFailure, onError])

  const stopScanner = useCallback(async () => {
    const instance = scannerInstance.current
    if (!instance) return
    scannerInstance.current = null

    try {
      if (instance.isScanning) await instance.stop()
    } catch (err) {
      console.error('Error stopping scanner:', err)
    }
    try {
      instance.clear()
    } catch {
      /* nothing to clear */
    }
    setIsScanning(false)
  }, [])

  // The camera starts once on mount and stops on unmount ONLY.
  //
  // These callbacks change identity on every `isScanning` flip, so keeping
  // them in the dependency list made the effect re-run whenever the scanner
  // stopped - which called startScanner() again and restarted the camera in a
  // loop. The first effect keeps the latest callbacks in refs (written inside
  // an effect, never during render) while the second runs exactly once; from
  // here on the camera is started and stopped only by the Start / Stop /
  // Retry buttons below.
  const startScannerRef = useRef(startScanner)
  const stopScannerRef = useRef(stopScanner)

  useEffect(() => {
    startScannerRef.current = startScanner
    stopScannerRef.current = stopScanner
  })

  useEffect(() => {
    startScannerRef.current()
    return () => stopScannerRef.current()
  }, [])

  // Retry after a permission/camera failure: re-init in place, no page reload.
  useEffect(() => {
    if (!pendingStart) return undefined
    if (!scannerRef.current || isScanning) {
      setPendingStart(false)
      return undefined
    }
    setPendingStart(false)
    startScanner()
  }, [pendingStart, isScanning, startScanner])

  const handleStart = () => {
    setCameraError('')
    setManuallyStopped(false)
    startScanner()
  }

  const handleStop = () => {
    setManuallyStopped(true)
    stopScanner()
  }

  /** Re-init in place instead of reloading the whole page (P0). */
  const handleRetry = () => {
    setCameraError('')
    setHasPermission(null)
    setManuallyStopped(false)
    setPendingStart(true)
  }

  /** Manual code entry uses the very same on-result handler as the camera. */
  const submitManualCode = (e) => {
    e.preventDefault()
    const value = manualCode.trim()
    if (!value) return
    handleScanSuccess(value)
    setManualCode('')
  }

  // Handle permission changes
  useEffect(() => {
    if (hasPermission === false) {
      stopScanner()
    }
  }, [hasPermission, stopScanner])

  if (hasPermission === false) {
    return (
      <div className={`w-full aspect-video bg-slate-100 dark:bg-[var(--surface-3)] rounded-xl flex flex-col items-center justify-center p-4 ${className}`} style={style}>
        <div className="w-16 h-16 bg-rose-100 dark:bg-[var(--tint-danger-bg)] rounded-full flex items-center justify-center mb-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-rose-600 dark:text-[var(--tint-danger-fg)]">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="9" x2="12.01" y2="9" />
          </svg>
        </div>
        <p className="text-center text-slate-700 dark:text-[var(--ink)] font-medium mb-1">Camera Access Required</p>
        <p className="text-center text-sm text-slate-500 dark:text-[var(--muted)] mb-4 max-w-xs">
          Please allow camera access in your browser settings to scan QR codes.
        </p>
        <button type="button" onClick={handleRetry} className="btn btn--primary">
          Retry
        </button>
        <p className="field-error text-center mt-3 max-w-xs" role="alert">
          {cameraError || 'The camera could not be started.'}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full">
    <div className={`relative w-full bg-[var(--surface-4)] rounded-xl overflow-hidden ${className}`} style={style}>
      <div id={elementId} ref={scannerRef} className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />
      
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

      {/* Loading state - only while the camera is genuinely starting up */}
      {!isScanning && hasPermission !== false && !manuallyStopped && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-4)] z-10">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-[var(--ink)] text-sm">Starting camera...</p>
          </div>
        </div>
      )}

    </div>

      {/* Start / Stop control plus the manual code fallback - a phone camera
          cannot always focus, so the code can be typed in instead. */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={isScanning ? handleStop : handleStart}
          aria-label={isScanning ? 'Stop scanner' : 'Start scanner'}
          aria-pressed={isScanning}
          className="btn btn--secondary shrink-0"
        >
          {isScanning ? 'Stop Scanner' : 'Start Scanner'}
        </button>
        <form onSubmit={submitManualCode} className="flex items-center gap-2 flex-1 min-w-0">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Enter code manually"
            aria-label="QR code"
            className="field-input h-8 text-xs flex-1 min-w-0"
          />
          <button type="submit" className="btn btn--secondary shrink-0">
            Submit
          </button>
        </form>
      </div>

      {cameraError && hasPermission !== false && (
        <p className="field-error mt-2 text-center" role="alert">
          {cameraError} Press Start Scanner to try again.
        </p>
      )}
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
    <Modal
      isOpen={open}
      onClose={() => onClose?.()}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          {fallbackCode ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => submit(fallbackCode)}
              className="mr-auto border border-brand-orange text-brand-orange hover:bg-orange-50"
            >
              {fallbackLabel}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="secondary" onClick={() => onClose?.()}>
            {busy ? 'Verifying…' : 'Close'}
          </Button>
        </>
      }
    >
      <QRScanner
        onScan={(code) => submit(code)}
        onError={(scanError) => setError(scanError)}
        className="w-full aspect-video"
      />
      {error && <p className="field-error text-center">{error}</p>}
    </Modal>
  )
}