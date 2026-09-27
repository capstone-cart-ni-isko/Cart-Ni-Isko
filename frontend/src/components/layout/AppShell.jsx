import { useState, useEffect } from 'react'
import React from 'react'
import BottomNav from './BottomNav.jsx'
import MenuSidebar, { MenuProvider } from './MenuSidebar.jsx'
import SideNav from './SideNav.jsx'
import SidebarLayout from './SidebarLayout.jsx'
import DesktopHeader from './DesktopHeader.jsx'

/**
 * `showNav={false}` already hides the ribbon and side nav (auth/onboarding
 * pages). `showHeader={false}` additionally drops the desktop header and
 * `showBottomNav={false}` the menu drawer, so a step-by-step process such as
 * Login shows only its own form elements. `showSideNav={false}` drops the
 * docked left card (the homepage renders full-width without it).
 *
 * The drawer lives here, not inside the ribbon: `isMenuOpen` is owned by the
 * layout, so opening the menu never unmounts or re-renders BottomNav.
 */
function AppShell({ children, showNav = true, showBottomNav = true, showHeader = true, showSideNav = true, className = '' }) {
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
      <MenuProvider>
        <div className="min-h-screen bg-white md:bg-[#F8F9FA] flex flex-col w-full customer-desktop-scale">
          {isOffline && (
            <div className="bg-amber-500 text-white text-xs font-bold py-2 px-4 text-center sticky top-0 z-[99999] shadow-sm">
              You are currently offline. Browsing in cached mode.
            </div>
          )}

          {/* Desktop top header */}
          {showHeader && <DesktopHeader />}

          {/* Card wrapper centered on desktop background */}
          <div className="flex-1 flex items-center justify-center p-4 pt-8 md:py-16">
            <div
              className={`app-container relative w-full bg-white md:max-w-lg md:rounded-3xl md:shadow-[0_20px_50px_rgba(0,0,0,0.08)] border-none overflow-hidden ${className}`}
            >
              {children}
            </div>
          </div>

          {showBottomNav && <MenuSidebar />}
        </div>
      </MenuProvider>
    )
  }

  // App pages with main layout
  return (
    <MenuProvider>
      <SidebarLayout
        sidebar={showSideNav ? <SideNav /> : null}
        bottomNav={showBottomNav ? <BottomNav /> : null}
        className={className}
      >
        {isOffline && (
          <div className="bg-amber-500 text-white text-xs font-bold py-2 px-4 text-center sticky top-0 z-[99999] shadow-sm">
            You are currently offline. Browsing in cached mode.
          </div>
        )}
        {children}

        {/* The drawer belongs to the ribbon's Menu button, not to the bottom
            ribbon, so it stays mounted even where `showBottomNav={false}`. */}
        <MenuSidebar />
      </SidebarLayout>
    </MenuProvider>
  )
}

export default React.memo(AppShell)

