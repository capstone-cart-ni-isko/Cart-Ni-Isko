import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { useToast } from '../../hooks/useToast.js'
import ConfirmModal from '../ui/ConfirmModal.jsx'
import { useState } from 'react'
import {
  HelpIcon,
  SettingsIcon,
  UserIcon,
  BellIcon,
  LogOutIcon,
} from '../ui/Icons.jsx'

function OrdersNavIcon({ className = 'w-4.5 h-4.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.27 6.96 8.73 5.05 8.73-5.05" /><path d="M12 22.08V12" />
    </svg>
  )
}

function CalendarNavIcon({ className = 'w-4.5 h-4.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function StarNavIcon({ className = 'w-4.5 h-4.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function MapPinNavIcon({ className = 'w-4.5 h-4.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function ShieldNavIcon({ className = 'w-4.5 h-4.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function HeadsetIcon({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  )
}

const navItems = [
  { id: 'overview', label: 'Overview', icon: UserIcon, path: '/profile', match: (p) => p === '/profile' },
  { id: 'account', label: 'Account Information', icon: UserIcon, path: '/account', match: (p) => p.startsWith('/account') },
  { id: 'orders', label: 'My Orders', icon: OrdersNavIcon, path: '/orders', match: (p) => p.startsWith('/orders') },
  { id: 'appointments', label: 'My Appointments', icon: CalendarNavIcon, path: '/appointments', match: (p) => p.startsWith('/appointments') },
  { id: 'saved', label: 'Saved Items', icon: StarNavIcon, path: '/wishlist', match: (p) => p.startsWith('/wishlist') },
  { id: 'security', label: 'Security & Password', icon: ShieldNavIcon, path: '/security', match: (p) => p.startsWith('/security') || p.startsWith('/settings/change-password') },
  { id: 'address', label: 'My Addresses', icon: MapPinNavIcon, path: '/settings/address', match: (p) => p.startsWith('/settings/address') },
  { id: 'notifications', label: 'Notifications', icon: BellIcon, path: '/settings/notifications', match: (p) => p.startsWith('/settings/notifications') },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, path: '/settings', match: (p) => p === '/settings' },
  { id: 'help', label: 'Help & Support', icon: HelpIcon, path: '/help', match: (p) => p.startsWith('/help') },
]

export default function DesktopAccountSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const { showToast } = useToast()
  const [showLogout, setShowLogout] = useState(false)

  const handleLogout = () => {
    logout()
    showToast('Signed out successfully')
    navigate('/')
  }

  return (
    <>
      <aside className="w-full shrink-0 flex flex-col space-y-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="px-2 pt-1 pb-2 mb-1 border-b border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Account Menu</p>
          </div>

          <nav className="space-y-1">
            {navItems.map(({ id, label, icon: Icon, path, match }) => {
              const isActive = match(location.pathname)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate(path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors text-left ${
                    isActive
                      ? 'bg-[#FFF4EC] text-[#FF6A00]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#FF6A00]' : 'text-gray-400'}`} />
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </nav>

          <div className="pt-2 mt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowLogout(true)}
              className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOutIcon className="w-4 h-4 text-rose-500" />
              <span>Log Out</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
          <div>
            <p className="font-bold text-sm text-gray-900">Need Help?</p>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              We're here to help with your orders and account.
            </p>
          </div>
          <Link
            to="/help"
            className="w-full py-2 px-3 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#FF6A00] font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <HeadsetIcon className="w-4 h-4 text-[#FF6A00]" />
            <span>Contact Support</span>
          </Link>
        </div>
      </aside>

      <ConfirmModal
        isOpen={showLogout}
        onClose={() => setShowLogout(false)}
        onConfirm={handleLogout}
        title="Log Out?"
        message="Are you sure you want to sign out of your Tindahan ni Isko account?"
        confirmText="Log Out"
        isDestructive
      />
    </>
  )
}