import { useState, useEffect } from 'react'
import Button from './Button.jsx'

export function triggerPwaInstall() {
  window.dispatchEvent(new CustomEvent('open-pwa-prompt'))
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check standalone mode
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    setIsStandalone(standalone)

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent)
    setIsIos(isIosDevice)

    if (standalone) return

    // Check if dismissed in session
    const isDismissed = sessionStorage.getItem('pwa_prompt_dismissed') === 'true'

    if (isIosDevice && !isDismissed) {
      setShowPrompt(true)
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      if (!isDismissed) {
        setShowPrompt(true)
      }
    }

    // Listener for manual trigger from Settings / Menu
    const handleManualTrigger = () => {
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('open-pwa-prompt', handleManualTrigger)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('open-pwa-prompt', handleManualTrigger)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Fallback if browser doesn't expose deferredPrompt directly
      alert('To install, use your browser options (e.g., Chrome address bar "Install" icon or menu "Add to Home Screen").')
      return
    }

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
    <>
      {/* Backdrop overlay if manually triggered or floating card */}
      <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-96 bg-white border border-orange-200/80 rounded-3xl p-4 shadow-2xl z-[9999] animate-slide-up transition-all">
        <div className="flex items-start gap-3.5">
          {/* App Icon */}
          <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shrink-0 shadow-md font-black text-xl">
            T
          </div>

          {/* Text Details */}
          <div className="flex-1 min-w-0 pr-2">
            <h4 className="text-sm font-black text-gray-900 leading-snug">
              Install Tindahan ni Isko
            </h4>
            <p className="text-xs text-gray-500 font-medium mt-0.5 leading-relaxed">
              {isStandalone
                ? 'App is already installed on your device!'
                : isIos
                ? 'Tap the Share button in Safari, then select "Add to Home Screen".'
                : 'Add to home screen for fast access, full-screen mode & offline shopping.'}
            </p>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 p-1 -mt-1 -mr-1 rounded-full transition-colors shrink-0"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Actions */}
        {!isStandalone && !isIos && (
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
    </>
  )
}
