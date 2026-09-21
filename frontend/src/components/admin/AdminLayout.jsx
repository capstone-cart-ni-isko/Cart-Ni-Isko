import { useState } from 'react'
import AdminSidebar from './AdminSidebar.jsx'
import AdminTopBar from './AdminTopBar.jsx'
import PwaInstallPrompt from '../ui/PwaInstallPrompt.jsx'

export default function AdminLayout({ children, className = '' }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('isko_admin_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  const handleToggleCollapse = () => {
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
      {/* Desktop Sidebar (Fixed Left) */}
      <div
        className={`hidden md:block shrink-0 h-screen sticky top-0 z-30 transition-[width] duration-300 ease-in-out [&>aside]:w-full ${
          isSidebarCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        <AdminSidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
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

        <PwaInstallPrompt />
      </div>
    </div>
  )
}