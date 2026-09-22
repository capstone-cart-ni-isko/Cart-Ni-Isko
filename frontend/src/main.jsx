import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

if (import.meta.env.PROD) {
  // Production PWA: register the service worker.
  registerSW({ immediate: true })
} else {
  // Dev: never cache. A stale dev service worker kept serving an old bundle
  // after code changes, which made live edits look like they "did nothing".
  // Unregister anything left over from a previous run and clear its caches.
  navigator.serviceWorker?.getRegistrations?.().then((regs) => {
    regs.forEach((reg) => reg.unregister())
  })
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)))
  }
}

// Capture the PWA install prompt globally so it is never missed
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__pwaDeferredPrompt = e
  window.dispatchEvent(new CustomEvent('pwa-prompt-available'))
})

window.addEventListener('appinstalled', () => {
  window.__pwaDeferredPrompt = null
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)