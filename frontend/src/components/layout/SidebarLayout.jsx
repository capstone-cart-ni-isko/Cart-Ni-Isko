import DesktopHeader from './DesktopHeader.jsx'
import DesktopFooter from './DesktopFooter.jsx'

/**
 * Responsive layout container:
 *   - On Desktop (md+): Full browser width with Header at top, max-w-7xl content area, Footer at bottom.
 *   - On Mobile (<md): Single column with floating bottomNav.
 */
function SidebarLayout({ sidebar, bottomNav, children, className = '' }) {
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col w-full">
      {/* Desktop Header - visible on md+ */}
      <DesktopHeader />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col w-full">
        <div
          className={`app-container relative flex-1 w-full bg-[#F8F9FA] md:max-w-[1600px] md:mx-auto md:px-8 lg:px-12 md:py-8 ${className}`}
        >
          {children}
        </div>
      </main>

      {/* Desktop Footer - visible on md+ */}
      <DesktopFooter />

      {/* Bottom nav floats over the content on mobile */}
      {bottomNav}
    </div>
  )
}

export default SidebarLayout
