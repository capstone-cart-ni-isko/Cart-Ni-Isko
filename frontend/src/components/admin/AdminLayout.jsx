import { useEffect, useRef, useState } from 'react'
import AdminSidebar from './AdminSidebar.jsx'
import AdminTopBar from './AdminTopBar.jsx'

// Delay before a hovered rail expands, so passing the cursor over it doesn't flash it open
const HOVER_OPEN_MS = 150

export default function AdminLayout({ children, className = '' }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // Icon-only rail by default; only an explicit "pinned open" choice is remembered
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('isko_admin_sidebar_collapsed') !== 'false'
    } catch {
      return true
    }
  })
  // While collapsed, hovering or focusing the rail opens it as an overlay
  // drawer on top of the page, so the content never reflows.
  const [hoverOpen, setHoverOpen] = useState(false)
  const hoverTimer = useRef(null)

  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  const openHover = (immediate = false) => {
    if (!isSidebarCollapsed) return
    clearTimeout(hoverTimer.current)
    if (immediate) setHoverOpen(true)
    else hoverTimer.current = setTimeout(() => setHoverOpen(true), HOVER_OPEN_MS)
  }

  const closeHover = () => {
    clearTimeout(hoverTimer.current)
    setHoverOpen(false)
  }

  const handleToggleCollapse = () => {
    closeHover()
    setIsSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('isko_admin_sidebar_collapsed', String(next))
      } catch (err) {
        console.warn('Failed to save sidebar state to localStorage', err)
      }
      return next
    })
  }

  return (
    <div className="admin-portal min-h-screen bg-[#F8F9FA] flex flex-row w-full font-sans antialiased text-gray-900">
      {/* Desktop Sidebar (Fixed Left). The outer slot reserves the layout
          width; the inner panel can grow past it as a hover overlay. */}
      <div
        className={`hidden md:block shrink-0 h-screen sticky top-0 z-40 transition-[width] duration-300 ease-in-out ${
          isSidebarCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div
          onMouseEnter={() => openHover()}
          onMouseLeave={closeHover}
          onFocus={() => openHover(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) closeHover()
          }}
          className={`absolute inset-y-0 left-0 transition-[width,box-shadow] duration-200 ease-out [&>aside]:w-full ${
            !isSidebarCollapsed ? 'w-56' : hoverOpen ? 'w-56 shadow-xl' : 'w-16'
          }`}
        >
          <AdminSidebar
            isCollapsed={isSidebarCollapsed && !hoverOpen}
            isOverlay={isSidebarCollapsed && hoverOpen}
            onToggleCollapse={handleToggleCollapse}
          />
        </div>
      </div>

      {/* Mobile Drawer Backdrop & Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden animate-fade-in">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 z-50 animate-slide-right">
            <AdminSidebar
              isCollapsed={false}
              onCloseMobile={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <AdminTopBar onToggleMobileMenu={() => setMobileMenuOpen(true)} />

        {/* Page Body Viewport — fills remaining height, scrollable */}
        <main className={`flex-1 overflow-y-auto p-3 sm:p-4 md:p-5 w-full mx-auto ${className}`}>
          {children}
        </main>
      </div>
    </div>
  )
}