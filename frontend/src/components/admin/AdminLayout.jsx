import { useState } from 'react'
import AdminSidebar from './AdminSidebar.jsx'
import AdminTopBar from './AdminTopBar.jsx'

/**
 * FLOW-EMP_HOME-05 / REQ-EMP_HOME-02 — the employee sidebar is a vertical
 * array docked at the LEFT of every employee page. It is always open (it can
 * no longer be collapsed to icons), so the labelled entries stay readable on
 * every screen, exactly like the customer portal's own settings menu card.
 *
 * GEOMETRY (system rule 72)
 * -------------------------
 * The ribbon is docked at the TOP and spans the FULL WIDTH of the page; the
 * sidebar + page body share the row underneath it. The two rows live inside a
 * `h-screen overflow-hidden` shell and each one sizes itself, so there are no
 * magic `calc()` numbers to keep in sync with the ribbon height.
 *
 * The only drawer left is the small-screen one, where the sidebar cannot fit
 * beside the content and therefore still opens on demand.
 */
export default function AdminLayout({ children, className = '' }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="admin-portal h-screen bg-[#F8F9FA] flex flex-col w-full font-sans antialiased text-gray-900 overflow-hidden">
      {/* ── ROW 1 — the navigation ribbon, full page width (rule 72) ── */}
      <AdminTopBar onToggleMobileMenu={() => setMobileMenuOpen(true)} />

      {/* ── ROW 2 — docked sidebar (left) + page body (right) ── */}
      <div className="flex flex-1 min-h-0 w-full">
        {/* Desktop Sidebar — always open, docked at the left edge as a card */}
        <div className="hidden md:block shrink-0 w-60 h-full min-h-0 p-3 z-30">
          <AdminSidebar onCloseMobile={() => setMobileMenuOpen(false)} />
        </div>

        {/* Main Content Area — fills the remaining height, scrollable */}
        {/* One gutter step at mobile, one at desktop: the old three-step
            `p-3 sm:p-4 md:p-5` re-flowed the content edge on every breakpoint,
            so tables and card grids sat at a different offset depending on
            where they were viewed. */}
        <main className={`flex-1 min-w-0 overflow-y-auto p-4 md:p-5 w-full mx-auto ${className}`}>
          {children}
        </main>

        {/* Mobile Drawer Backdrop & Sidebar */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden animate-fade-in">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 z-50 animate-slide-right">
              <AdminSidebar onCloseMobile={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
