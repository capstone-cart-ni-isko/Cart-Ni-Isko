import { useState, useEffect } from 'react'
import Button from './Button.jsx'
import logo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

export function triggerPwaInstall() {
  const promptEvent = window.__pwaDeferredPrompt
  if (promptEvent) {
    promptEvent.prompt()
    promptEvent.userChoice.then(({ outcome }) => {
      if (outcome === 'accepted') {
        window.__pwaDeferredPrompt = null
      }
    })
  } else {
    window.dispatchEvent(new CustomEvent('open-pwa-prompt'))
  }
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(window.__pwaDeferredPrompt || null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [guideMessage, setGuideMessage] = useState('')

  useEffect(() => {
    // Check standalone mode (already installed & running as PWA)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    setIsStandalone(standalone)

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent)
    setIsIos(isIosDevice)

    if (standalone) return

    // Sync deferred prompt if already available globally
    if (window.__pwaDeferredPrompt) {
      setDeferredPrompt(window.__pwaDeferredPrompt)
    }

    const handlePromptAvailable = () => {
      setDeferredPrompt(window.__pwaDeferredPrompt)
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      window.__pwaDeferredPrompt = e
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      setIsStandalone(true)
      setShowPrompt(false)
      setDeferredPrompt(null)
      window.__pwaDeferredPrompt = null
    }

    // Listener for manual trigger from Settings / Menu
    const handleManualTrigger = () => {
      const activePrompt = window.__pwaDeferredPrompt || deferredPrompt
      if (activePrompt) {
        activePrompt.prompt()
        activePrompt.userChoice.then(({ outcome }) => {
          if (outcome === 'accepted') {
            setShowPrompt(false)
            setDeferredPrompt(null)
            window.__pwaDeferredPrompt = null
          }
        })
      } else {
        if (isIosDevice) {
          setGuideMessage('Tap the Share button in Safari (icon at the bottom), then select "Add to Home Screen".')
        } else {
          setGuideMessage('Click the Install icon in your browser address bar or open the browser menu (⋮) and select "Install Tindahan ni Isko".')
        }
        setShowPrompt(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('pwa-prompt-available', handlePromptAvailable)
    window.addEventListener('appinstalled', handleAppInstalled)
    window.addEventListener('open-pwa-prompt', handleManualTrigger)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('pwa-prompt-available', handlePromptAvailable)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('open-pwa-prompt', handleManualTrigger)
    }
  }, [deferredPrompt])

  const handleInstallClick = async () => {
    const activePrompt = window.__pwaDeferredPrompt || deferredPrompt
    if (!activePrompt) {
      if (isIos) {
        setGuideMessage('Tap the Share button in Safari, then select "Add to Home Screen".')
      } else {
        setGuideMessage('Use the Install icon in your browser address bar or open the browser menu (⋮) and select "Install Tindahan ni Isko".')
      }
      return
    }

    activePrompt.prompt()
    const { outcome } = await activePrompt.userChoice
    if (outcome === 'accepted') {
      setShowPrompt(false)
      setDeferredPrompt(null)
      window.__pwaDeferredPrompt = null
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    setGuideMessage('')
    sessionStorage.setItem('pwa_prompt_dismissed', 'true')
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-20 right-4 left-4 sm:left-auto sm:right-6 sm:bottom-6 w-auto sm:w-96 bg-white border border-gray-200 rounded-2xl p-4 shadow-2xl z-[9999] animate-slide-up transition-all">
      <div className="flex items-start gap-3.5">
        {/* App Icon */}
        <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100 p-1.5 shadow-xs">
          <img src={logo} alt="Tindahan ni Isko" className="w-full h-full object-contain" />
        </div>

        {/* Text Details */}
        <div className="flex-1 min-w-0 pr-1">
          <h4 className="text-sm font-bold text-gray-900 leading-snug">
            Install Tindahan ni Isko
          </h4>
          <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed">
            {isStandalone
              ? 'App is already installed on your device.'
              : guideMessage
              ? guideMessage
              : isIos
              ? 'Tap Share in Safari, then select "Add to Home Screen".'
              : 'Install our app for quick access and offline shopping.'}
          </p>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1 -mt-1 -mr-1 rounded-full transition-colors shrink-0 cursor-pointer"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Actions */}
      {!isStandalone && (deferredPrompt || window.__pwaDeferredPrompt) && (
        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            Not now
          </button>
          <Button
            onClick={handleInstallClick}
            className="h-8 px-3.5 text-xs font-bold rounded-lg text-white bg-brand-orange hover:bg-brand-orange-dark shadow-sm cursor-pointer"
          >
            Install App
          </Button>
        </div>
      )}
    </div>
  )
}
