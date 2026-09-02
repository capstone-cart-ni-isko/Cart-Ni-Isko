import { useState, useEffect } from 'react'
import BottomNav from './BottomNav.jsx'
import SideNav from './SideNav.jsx'
import SidebarLayout from './SidebarLayout.jsx'
import DesktopHeader from './DesktopHeader.jsx'
import PwaInstallPrompt from '../ui/PwaInstallPrompt.jsx'

function AppShell({ children, showNav = true, showBottomNav = true, className = '' }) {
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

  // Auth/Onboarding pages (no bottom nav, no sidebar) — center card without black border/outline on desktop
  if (!showNav) {
    return (
      <div className="min-h-screen bg-white md:bg-[#F8F9FA] flex flex-col w-full">
        {isOffline && (
          <div className="bg-amber-500 text-white text-xs font-bold py-2 px-4 text-center sticky top-0 z-[99999] shadow-sm">
            You are currently offline. Browsing in cached mode.
          </div>
        )}

        {/* Desktop top header */}
        <DesktopHeader />
        
        {/* Card wrapper centered on desktop background */}
        <div className="flex-1 flex items-center justify-center p-4 pt-8 md:py-16">
          <div
            className={`app-container relative w-full bg-white md:max-w-lg md:rounded-3xl md:shadow-[0_20px_50px_rgba(0,0,0,0.08)] border-none overflow-hidden ${className}`}
          >
            {children}
          </div>
        </div>
        <PwaInstallPrompt />
      </div>
    )
  }

  // App pages with main layout
  return (
    <SidebarLayout
      sidebar={showNav ? <SideNav /> : null}
      bottomNav={showNav && showBottomNav ? <BottomNav /> : null}
      className={className}
    >
      {isOffline && (
        <div className="bg-amber-500 text-white text-xs font-bold py-2 px-4 text-center sticky top-0 z-[99999] shadow-sm">
          You are currently offline. Browsing in cached mode.
        </div>
      )}
      {children}
      <PwaInstallPrompt />
    </SidebarLayout>
  )
}

export default AppShell

