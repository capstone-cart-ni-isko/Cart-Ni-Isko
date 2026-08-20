import { useState, useEffect } from 'react'
import Button from './Button.jsx'

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    // Check if already running as standalone PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    if (isStandalone) {
      return
    }

    // Check if prompt was dismissed in current session
    if (sessionStorage.getItem('pwa_prompt_dismissed') === 'true') {
      return
    }

    // Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent)

    if (isIosDevice) {
      setIsIos(true)
      // Show iOS instruction prompt if not standalone and not dismissed
      setShowPrompt(true)
      return
    }

    // Standard PWA install prompt handler (Chrome, Edge, Android, Desktop)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowPrompt(false)
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    sessionStorage.setItem('pwa_prompt_dismissed', 'true')
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-96 bg-white border border-gray-100 rounded-3xl p-4 shadow-2xl z-[9999] animate-slide-up transition-all">
      <div className="flex items-start gap-3.5">
        {/* App Icon */}
        <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100 overflow-hidden shadow-xs">
          <img
            src="/pwa-192x192.png"
            alt="Tindahan ni Isko"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.onerror = null
              e.target.src = '/favicon.svg'
            }}
          />
        </div>

        {/* Text Details */}
        <div className="flex-1 min-w-0 pr-4">
          <h4 className="text-sm font-black text-gray-900 leading-snug">
            Install Tindahan ni Isko
          </h4>
          <p className="text-xs text-gray-500 font-medium mt-0.5 leading-relaxed">
            {isIos
              ? 'Tap the Share icon in Safari then select "Add to Home Screen" for quick access.'
              : 'Add to home screen for faster loading, full-screen mode & offline access.'}
          </p>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1 -mt-1 -mr-1 rounded-full transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Actions */}
      {!isIos && (
        <div className="flex items-center justify-end gap-2.5 mt-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs font-bold text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-xl transition-colors"
          >
            Not now
          </button>
          <Button
            onClick={handleInstallClick}
            className="h-9 px-4 text-xs font-bold rounded-xl text-white bg-brand-orange hover:bg-brand-orange-dark shadow-sm"
          >
            Install App
          </Button>
        </div>
      )}
    </div>
  )
}
