import BottomNav from './BottomNav.jsx'
import SideNav from './SideNav.jsx'
import SidebarLayout from './SidebarLayout.jsx'
import DesktopHeader from './DesktopHeader.jsx'

function AppShell({ children, showNav = true, className = '' }) {
  // Auth/Onboarding pages (no bottom nav, no sidebar) — center card without black border/outline on desktop
  if (!showNav) {
    return (
      <div className="min-h-screen bg-white md:bg-[#F8F9FA] flex flex-col w-full">
        {/* Desktop top header */}
        <DesktopHeader />
        
        {/* Card wrapper centered on desktop background */}
        <div className="flex-1 flex items-center justify-center p-4 md:py-16">
          <div
            className={`app-container relative w-full bg-white md:max-w-lg md:rounded-3xl md:shadow-[0_20px_50px_rgba(0,0,0,0.08)] border-none overflow-hidden ${className}`}
          >
            {children}
          </div>
        </div>
      </div>
    )
  }

  // App pages with main layout
  return (
    <SidebarLayout
      sidebar={showNav ? <SideNav /> : null}
      bottomNav={showNav ? <BottomNav /> : null}
      className={className}
    >
      {children}
    </SidebarLayout>
  )
}

export default AppShell
