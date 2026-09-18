import { Link, useNavigate } from 'react-router-dom'
import logo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import {
  HelpIcon,
  SettingsIcon,
} from '../ui/Icons.jsx'

function HomeNavIcon({ className = 'w-4.5 h-4.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

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

function WalletNavIcon({ className = 'w-4.5 h-4.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
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

export default function DesktopAccountSidebar({ activeTab = 'overview', onTabChange = null }) {
  const navigate = useNavigate()

  const navItems = [
    { id: 'overview', label: 'Overview', icon: HomeNavIcon, path: '/profile' },
    { id: 'orders', label: 'My Orders', icon: OrdersNavIcon, path: '/orders' },
    { id: 'appointments', label: 'My Appointments', icon: CalendarNavIcon, path: '/appointments' },
    { id: 'saved', label: 'Saved Items', icon: StarNavIcon, path: '/wishlist' },
    { id: 'settings', label: 'Account Settings', icon: SettingsIcon, path: '/settings' },
    { id: 'help', label: 'Help & Support', icon: HelpIcon, path: '/help' },
  ]

  const handleClick = (item) => {
    if (onTabChange) {
      onTabChange(item.id)
    } else {
      navigate(item.path)
    }
  }

  return (
    <aside className="w-60 shrink-0 flex flex-col justify-between space-y-5">
      {/* Top Nav Card */}
      <div className="bg-white rounded-3xl p-3.5 border border-gray-100/90 shadow-xs">
        {/* Brand logo at top of sidebar */}
        <div className="px-3 pt-2 pb-3 mb-1 border-b border-gray-50 flex items-center">
          <Link to="/home" className="flex items-center">
            <img src={logo} alt="Tindahan ni Isko" className="h-8 object-contain" />
          </Link>
        </div>

        <nav className="space-y-0.5">
          {navItems.map(({ id, label, icon: Icon, path }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleClick({ id, path })}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-sm font-semibold transition-all text-left relative ${
                  isActive
                    ? 'bg-[#FFF4EC] text-[#FF6A00] font-extrabold'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-[#FF6A00] rounded-r-full" />
                )}
                <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-[#FF6A00]' : 'text-gray-400'}`} />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Need Help? Card at bottom */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100/90 shadow-xs space-y-3">
        <div>
          <p className="font-extrabold text-base text-gray-900">Need Help?</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            We're here to help with your orders and account.
          </p>
        </div>
        <Link
          to="/help"
          className="w-full py-2.5 px-4 rounded-xl border border-orange-200 bg-white hover:bg-orange-50/60 text-[#FF6A00] font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-2xs"
        >
          <HeadsetIcon className="w-4 h-4 text-[#FF6A00]" />
          <span>Contact Support</span>
        </Link>
      </div>
    </aside>
  )
}
