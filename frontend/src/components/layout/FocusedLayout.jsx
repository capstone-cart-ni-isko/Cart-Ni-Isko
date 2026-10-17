import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton.jsx'

/**
 * FocusedLayout — Layout for focused customer pages (Settings, Order Details, Product Details, etc.)
 *
 * System Rule 65: "The elements of another page (for example homepage ribbon)
 * must never show inside a focused page."
 * System Rule 68: "There must be a working 'back' button or 'exit' button wherever necessary in the system."
 * System Rule 69: "If using a 'back' button, it must be at the top left."
 * System Rule 70: "If using an 'exit' button, it must be at the top right."
 *
 * This layout guarantees:
 * 1. NO Homepage ribbon / DesktopHeader.
 * 2. NO BottomNav.
 * 3. NO MenuSidebar drawer from another page.
 * 4. Dedicated top header with a top-left Back button (rule 68, 69).
 * 5. Full responsiveness across mobile PWA, mobile web, and desktop viewports.
 */
function FocusedLayout({
  children,
  title = '',
  subtitle = '',
  backTo = null,
  onBack = null,
  backLabel = 'Back',
  rightAction = null,
  className = '',
  containerClassName = 'max-w-4xl',
}) {
  const navigate = useNavigate()
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

  const handleBack = () => {
    if (onBack) return onBack()
    if (backTo) return navigate(backTo)
    if (window.history.length > 1) return navigate(-1)
    return navigate('/home')
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[var(--surface)] flex flex-col w-full customer-desktop-scale text-gray-900 dark:text-[var(--ink)]">
      {isOffline && (
        <div className="bg-amber-500 text-white text-xs font-semibold py-2 px-4 text-center sticky top-0 z-[99999]">
          You are currently offline. Browsing in cached mode.
        </div>
      )}

      {/* ── Focused Top Header Bar: Back button at top left (Rule 69) ── */}
      <header className="sticky top-0 z-30 select-none bg-white/95 dark:bg-[var(--surface)]/95 backdrop-blur-md border-b border-gray-200/80 dark:border-[var(--line)] w-full shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton
              onClick={handleBack}
              label={backLabel === 'Back' ? null : backLabel}
            />
            {title && (
              <div className="min-w-0">
                <h1 className="text-sm md:text-base font-bold text-gray-900 dark:text-[var(--ink)] tracking-tight truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="hidden sm:block text-[11px] text-gray-500 dark:text-[var(--muted)] truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            )}
          </div>

          {rightAction && (
            <div className="flex items-center gap-2 shrink-0">
              {rightAction}
            </div>
          )}
        </div>
      </header>

      {/* ── Focused Main Content Container ── */}
      <main className="flex-1 w-full p-4 md:p-6 lg:p-8">
        <div className={`mx-auto w-full ${containerClassName} ${className}`}>
          {children}
        </div>
      </main>
    </div>
  )
}

export default React.memo(FocusedLayout)
