import { useState, useEffect } from 'react'
import BottomNav from './BottomNav.jsx'
import DesktopHeader from './DesktopHeader.jsx'
import DesktopFooter from './DesktopFooter.jsx'
import DesktopAccountSidebar from './DesktopAccountSidebar.jsx'
import PwaInstallPrompt from '../ui/PwaInstallPrompt.jsx'

/**
 * Shared shell for every account page (Profile, Orders, Order Details, Settings, ...).
 * Keeps the account sidebar visible on desktop (lg+) and the bottom nav visible on mobile.
 */
function AccountLayout({ children, className = '' }) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col w-full customer-desktop-scale">
      <DesktopHeader />

      <main className="flex-1 flex flex-col w-full min-h-[calc(100vh-80px)]">
        <div
          className={`app-container relative flex-1 w-full bg-[#F8F9FA] max-w-7xl mx-auto px-4 md:px-6 lg:px-8 md:py-6 lg:flex lg:items-start lg:gap-6 ${className}`}
        >
          {/* Sidebar stays visible while navigating between account pages (desktop only) */}
          <div className="hidden lg:block w-64 shrink-0 sticky top-18 self-start">
            <DesktopAccountSidebar />
          </div>

          <div className="flex-1 min-w-0">
            {isOffline && (
              <div className="bg-amber-500 text-white text-xs font-bold py-2 px-4 text-center sticky top-0 z-[99999]">
                You are currently offline. Browsing in cached mode.
              </div>
            )}
            {children}
          </div>
        </div>
      </main>

      <DesktopFooter />
      <BottomNav />
      <PwaInstallPrompt />
    </div>
  )
}

export default AccountLayout