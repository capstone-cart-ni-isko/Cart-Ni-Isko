import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { prefetch } from './services/api.js'
import { ApiErrorBoundary } from './components/ui/ApiErrorBoundary.jsx'
import './index.css'
import App from './App.jsx'

// Apply the stored light/dark preference before the first paint.
if (localStorage.getItem('isko_theme') === 'dark') {
  document.documentElement.classList.add('dark')
}

// Warm the API socket and cache public catalog data immediately on boot.
// Runs silently so it never raises the global progress bar.
prefetch('/products/filter', { status: 'active' }).catch(() => null)

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

// The boundary sits OUTSIDE the router and every provider on purpose: it is the
// only guard that also catches a crash inside ToastProvider/AuthProvider/AdminProvider
// and the router itself. The one inside <App/> cannot see those, which is how a
// provider crash used to leave a completely blank white screen.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApiErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ApiErrorBoundary>
  </StrictMode>,
)