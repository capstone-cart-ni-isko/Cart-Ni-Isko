import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// Automatically register the service worker
registerSW({ immediate: true })

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