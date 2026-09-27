import DesktopHeader from './DesktopHeader.jsx'
import DesktopFooter from './DesktopFooter.jsx'
import React from 'react'

/**
 * Responsive layout container:
 *   - On Desktop (md+): Full browser width with Header at top, max-w-7xl content area, Footer at bottom.
 *   - On Mobile (<md): Single column with floating bottomNav.
 */
function SidebarLayout({ sidebar, bottomNav, children, className = '' }) {
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col w-full customer-desktop-scale">
      {/* Desktop Header - visible on md+ */}
      <DesktopHeader />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col w-full min-h-[calc(100vh-80px)]">
        <div
          className={`app-container relative flex-1 w-full bg-[#F8F9FA] max-w-7xl mx-auto px-4 md:px-8 lg:px-10 md:py-6 ${className}`}
        >
          <div className="mx-auto flex w-full max-w-6xl items-start gap-6">
            {sidebar && (
              <aside className="sticky top-24 hidden w-52 shrink-0 lg:block">
                {sidebar}
              </aside>
            )}
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </div>
      </main>

      {/* Desktop Footer - visible on md+ */}
      <DesktopFooter />

      {/* Bottom nav floats over the content on mobile */}
      {bottomNav}
    </div>
  )
}

export default React.memo(SidebarLayout)
