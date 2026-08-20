import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'

import {
  UserIcon,
  KeyIcon,
  MapPinIcon,
  BellIcon,
  PackageIcon,
  HelpIcon,
  LockIcon,
  LogOutIcon
} from '../components/ui/Icons.jsx'

const settingsAccountItems = [
  { to: '/account', label: 'Edit Profile', icon: <UserIcon className="w-5 h-5 text-gray-450" />, description: 'Update name, email and photo' },
  { to: '/settings/change-password', label: 'Change Password', icon: <KeyIcon className="w-5 h-5 text-gray-450" />, description: 'Update your login password' },
  { to: '/settings/address', label: 'My Address', icon: <MapPinIcon className="w-5 h-5 text-gray-450" />, description: 'Manage delivery addresses' },
]

const settingsPrefsItems = [
  { to: '/settings/notifications', label: 'Notification Preferences', icon: <BellIcon className="w-5 h-5 text-gray-450" />, description: 'Control alerts and updates' },
  { to: '/orders', label: 'Order History', icon: <PackageIcon className="w-5 h-5 text-gray-450" />, description: 'View past and active orders' },
]

const settingsSupportItems = [
  { to: '/help', label: 'Help & Support', icon: <HelpIcon className="w-5 h-5 text-gray-450" />, description: 'FAQs and contact support' },
  { to: '/security', label: 'Security', icon: <LockIcon className="w-5 h-5 text-gray-450" />, description: 'Two-factor authentication' },
]

function SettingsSection({ title, items }) {
  return (
    <div className="space-y-2">
      <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">{title}</h2>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
        {items.map(({ to, label, icon, description }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="shrink-0">{icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{description}</p>
              </div>
            </div>
            <span className="text-gray-300 text-xl ml-3 shrink-0">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Settings() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { showToast } = useToast()
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const handleLogout = () => {
    logout()
    showToast('Signed out successfully')
    navigate('/')
  }

  return (
    <AppShell showNav={false}>
      <PageHeader title="Settings" backTo="/profile" />

      <div className="px-4 py-4 pb-12 space-y-5 animate-fade-in">
        <SettingsSection title="Account" items={settingsAccountItems} />
        <SettingsSection title="Preferences" items={settingsPrefsItems} />
        <SettingsSection title="Support" items={settingsSupportItems} />

        {/* Log Out */}
        <button
          type="button"
          onClick={() => setShowLogoutModal(true)}
          className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-red-50 active:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-3.5">
            <LogOutIcon className="w-5 h-5 text-red-500" />
            <p className="text-sm font-bold text-red-600">Log Out</p>
          </div>
          <span className="text-red-300 text-xl">›</span>
        </button>
      </div>

      <ConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        title="Log Out?"
        message="Are you sure you want to sign out of your Tindahan ni Isko account?"
        confirmText="Log Out"
        isDestructive={true}
      />
    </AppShell>
  )
}

export default Settings
