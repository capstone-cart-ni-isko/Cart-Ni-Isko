import React, { useState } from 'react'
import AdminSidebar from './AdminSidebar.jsx'
import AdminTopBar from './AdminTopBar.jsx'
import PwaInstallPrompt from '../ui/PwaInstallPrompt.jsx'

export default function AdminLayout({ children, className = '' }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-row w-full font-sans antialiased text-gray-900">
      {/* Desktop Sidebar (Fixed Left) */}
      <div className="hidden md:block w-64 shrink-0 h-screen sticky top-0 z-30">
        <AdminSidebar />
      </div>

      {/* Mobile Drawer Backdrop & Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden animate-fade-in">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-50 animate-slide-right">
            <AdminSidebar onCloseMobile={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Header */}
        <AdminTopBar onToggleMobileMenu={() => setMobileMenuOpen(true)} />

        {/* Page Body Viewport */}
        <main className={`flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto ${className}`}>
          {children}
        </main>

        <PwaInstallPrompt />
      </div>
    </div>
  )
}
