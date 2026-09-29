import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * QRScanner — camera-based QR code scanner using html5-qrcode.
 *
 * Props:
 *   onScan  (code: string) => void   called once per unique code (2 s cooldown)
 *   onError (msg: string)  => void   called on hard errors
 */
export default function QRScanner({ onScan, onError }) {
  // html5-qrcode needs a stable *string* element ID, not a ref
  const uid = useId().replace(/:/g, '')
  const elementId = `qr-scanner-${uid}`

  const instanceRef = useRef(null)
  const cooldownRef = useRef(false)
  const lastCodeRef = useRef(null)
  const mountedRef = useRef(true)

  const [state, setState] = useState('idle') // idle | starting | scanning | denied | error
  const [errMsg, setErrMsg] = useState('')

  const stop = useCallback(async () => {
    if (!instanceRef.current) return
    try {
      await instanceRef.current.stop()
    } catch {
      // already stopped
    }
    try {
      instanceRef.current.clear()
    } catch {
      // ignore
    }
    instanceRef.current = null
  }, [])

  const start = useCallback(async () => {
    if (!mountedRef.current) return
    setState('starting')

    try {
      const { Html5Qrcode } = await import('html5-qrcode')

      // Ask permission explicitly first so the browser dialog appears
      await navigator.mediaDevices.getUserMedia({ video: true })

      if (!mountedRef.current) return

      const scanner = new Html5Qrcode(elementId)
      instanceRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (cooldownRef.current || lastCodeRef.current === decodedText) return
          lastCodeRef.current = decodedText
          cooldownRef.current = true
          onScan?.(decodedText)
          setTimeout(() => {
            cooldownRef.current = false
            lastCodeRef.current = null
          }, 2000)
        },
        () => {
          // frame-level failures are normal — ignore
        }
      )

      if (mountedRef.current) setState('scanning')
    } catch (err) {
      if (!mountedRef.current) return
      const msg = err?.message || String(err)
      if (
        err?.name === 'NotAllowedError' ||
        msg.toLowerCase().includes('permission') ||
        msg.toLowerCase().includes('denied')
      ) {
        setState('denied')
        onError?.('Camera permission denied. Please allow camera access in your browser settings.')
      } else {
        setState('error')
        setErrMsg(msg)
        onError?.(msg)
      }
    }
  }, [elementId, onScan, onError])

  useEffect(() => {
    mountedRef.current = true
    start()
    return () => {
      mountedRef.current = false
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Permission denied ── */
  if (state === 'denied') {
    return (
      <div className="w-full aspect-video bg-slate-100 rounded-xl flex flex-col items-center justify-center p-6 gap-3">
        <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7 text-rose-600">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
            <line x1="3" y1="3" x2="21" y2="21" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-700 text-center">Camera access denied</p>
        <p className="text-xs text-slate-500 text-center max-w-xs">
          Allow camera access in your browser's site settings, then reload.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-brand-orange text-white text-xs font-bold hover:bg-orange-600 transition-colors cursor-pointer"
        >
          Reload page
        </button>
      </div>
    )
  }

  /* ── Hard error ── */
  if (state === 'error') {
    return (
      <div className="w-full aspect-video bg-slate-100 rounded-xl flex flex-col items-center justify-center p-6 gap-3">
        <p className="text-sm font-semibold text-rose-600 text-center">Camera error</p>
        <p className="text-xs text-slate-500 text-center max-w-xs">{errMsg || 'Could not start camera.'}</p>
        <button
          type="button"
          onClick={() => { setState('idle'); start() }}
          className="px-4 py-2 rounded-lg bg-brand-orange text-white text-xs font-bold hover:bg-orange-600 transition-colors cursor-pointer"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="relative w-full aspect-video bg-slate-900 rounded-xl overflow-hidden">
      {/* html5-qrcode renders the <video> into this div by ID */}
      <div id={elementId} className="w-full h-full" />

      {/* Viewfinder overlay (pointer-events-none so html5-qrcode can still click) */}
      {state === 'scanning' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="relative w-3/4 aspect-square max-w-[260px]">
            <div className="absolute -top-2 -left-2 w-7 h-7 border-t-4 border-l-4 border-brand-orange rounded-tl-lg" />
            <div className="absolute -top-2 -right-2 w-7 h-7 border-t-4 border-r-4 border-brand-orange rounded-tr-lg" />
            <div className="absolute -bottom-2 -left-2 w-7 h-7 border-b-4 border-l-4 border-brand-orange rounded-bl-lg" />
            <div className="absolute -bottom-2 -right-2 w-7 h-7 border-b-4 border-r-4 border-brand-orange rounded-br-lg" />
            <div className="absolute inset-x-0 top-1/2 h-0.5 bg-brand-orange/60 animate-pulse" />
          </div>
          <p className="mt-4 text-white/80 text-xs font-medium text-center px-4">
            Position the QR code within the frame
          </p>
        </div>
      )}

      {/* Starting spinner */}
      {(state === 'idle' || state === 'starting') && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-brand-orange border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-white text-sm">Starting camera…</p>
          </div>
        </div>
      )}

      {/* Stop button */}
      <div className="absolute bottom-4 left-4">
        <button
          type="button"
          onClick={stop}
          className="px-4 py-2 bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-lg hover:bg-black/70 transition-colors cursor-pointer"
        >
          Stop Scanner
        </button>
      </div>
    </div>
  )
}