import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'
import { useToast } from '../../hooks/useToast.js'
import ConfirmModal from '../ui/ConfirmModal.jsx'
import { useState } from 'react'
import {
  SettingsIcon,
  UserIcon,
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

function MapPinNavIcon({ className = 'w-4.5 h-4.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

const navItems = [
  { id: 'overview', label: 'Overview', icon: UserIcon, path: '/profile', match: (p) => p === '/profile' },
  { id: 'account', label: 'Edit Profile', icon: UserIcon, path: '/account', match: (p) => p.startsWith('/account') },
  { id: 'orders', label: 'My Orders', icon: OrdersNavIcon, path: '/orders', match: (p) => p.startsWith('/orders') },
  { id: 'address', label: 'My Addresses', icon: MapPinNavIcon, path: '/settings/address', match: (p) => p.startsWith('/settings/address') },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, path: '/settings', match: (p) => p === '/settings' },
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
    navigate('/signin')
  }

  return (
    <>
      <aside className="w-full shrink-0 flex flex-col space-y-2.5">
        <div className="bg-white rounded-lg p-3 border border-gray-100">
          <div className="px-2 pt-0.5 pb-1.5 mb-1 border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Account Menu</p>
          </div>

          <nav className="space-y-0.5">
            {navItems.map(({ id, label, icon: Icon, path, match }) => {
              const isActive = match(location.pathname)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate(path)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-semibold transition-colors text-left cursor-pointer ${
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

          <div className="pt-1.5 mt-1.5 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowLogout(true)}
              className="w-full text-left flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOutIcon className="w-4 h-4 text-rose-500" />
              <span>Log Out</span>
            </button>
          </div>
        </div>

        <ConfirmModal
          isOpen={showLogout}
          onClose={() => setShowLogout(false)}
          onConfirm={handleLogout}
          title="Log Out?"
          message="Are you sure you want to sign out of your Tindahan ni Isko account?"
          confirmText="Log Out"
          isDestructive
        />
      </aside>
    </>
  )
}
