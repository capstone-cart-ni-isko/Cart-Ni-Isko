import React, { useState } from 'react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'

// ── Reusable inline toggle ──────────────────────────────────────────────────
function Toggle({ checked, onChange, size = 'md' }) {
  const sizes = {
    lg: { track: 'h-6 w-11', thumb: 'h-5 w-5', on: 'translate-x-5' },
    md: { track: 'h-5 w-9',  thumb: 'h-4 w-4', on: 'translate-x-4' },
  }
  const s = sizes[size] || sizes.md
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${s.track} shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 ${
        checked ? 'bg-brand-orange' : 'bg-slate-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block ${s.thumb} transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? s.on : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ── Secondary nav definition ────────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    group: 'Store',
    items: [
      { id: 'store-operations',  label: 'Store Operations'  },
      { id: 'pickup-delivery',   label: 'Pickup & Delivery' },
    ],
  },
  {
    group: 'Orders',
    items: [
      { id: 'order-preferences',  label: 'Order Preferences'    },
      { id: 'checkout-payments',  label: 'Checkout & Payments'  },
    ],
  },
  {
    group: 'Notifications',
    items: [
      { id: 'staff-notifications',    label: 'Staff Notifications'    },
      { id: 'customer-notifications', label: 'Customer Notifications' },
    ],
  },
  {
    group: 'Security',
    items: [
      { id: 'access-permissions', label: 'Access & Permissions' },
      { id: 'security',           label: 'Security'             },
    ],
  },
]

// ── Small chevron icon ──────────────────────────────────────────────────────
function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-slate-400 flex-shrink-0">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ── Preview row ─────────────────────────────────────────────────────────────
function PreviewRow({ label, value, last = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between py-2.5 text-left transition-colors hover:bg-slate-50 rounded-lg px-2 -mx-2 ${
        !last ? 'border-b border-slate-100' : ''
      }`}
    >
      <span className="text-xs text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-800">{value}</span>
        <ChevronRight />
      </div>
    </button>
  )
}

// ── Preview card ────────────────────────────────────────────────────────────
function PreviewCard({ title, icon, rows, onNavigate }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs hover:shadow-sm transition-shadow">
      <button
        type="button"
        onClick={onNavigate}
        className="w-full flex items-center justify-between mb-3 group"
      >
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-orange-50 group-hover:text-brand-orange transition-colors">
            {icon}
          </span>
          <h3 className="text-xs font-bold text-slate-900 group-hover:text-brand-orange transition-colors">
            {title}
          </h3>
        </div>
        <ChevronRight />
      </button>
      <div className="space-y-0.5">
        {rows.map((row, i) => (
          <PreviewRow
            key={row.label}
            label={row.label}
            value={row.value}
            last={i === rows.length - 1}
            onClick={onNavigate}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function AdminSettings() {
  const { adminState = {}, updateStoreSettings } = useAdmin()
  const { showToast } = useToast()

  const storeSettings = adminState?.storeSettings || {}

  const [activeSection, setActiveSection] = useState('store-operations')

  // Store Operations
  const [isStoreOpen, setIsStoreOpen]           = useState(storeSettings.isStoreOpen         ?? true)
  const [acceptOnlineOrders, setAcceptOnlineOrders] = useState(storeSettings.acceptOnlineOrders ?? true)
  const [allowInStorePickup, setAllowInStorePickup] = useState(storeSettings.allowInStorePickups ?? true)
  const [allowDelivery, setAllowDelivery]       = useState(storeSettings.allowDelivery        ?? true)

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const mark = () => setHasUnsavedChanges(true)

  const handleToggle = (setter, current, label) => (val) => {
    setter(val)
    mark()
    showToast(`${label} ${val ? 'enabled' : 'disabled'}.`, 'info')
  }

  const handleDiscard = () => {
    setIsStoreOpen(storeSettings.isStoreOpen    ?? true)
    setAcceptOnlineOrders(storeSettings.acceptOnlineOrders ?? true)
    setAllowInStorePickup(storeSettings.allowInStorePickups ?? true)
    setAllowDelivery(storeSettings.allowDelivery ?? true)
    setHasUnsavedChanges(false)
    showToast('Changes discarded.', 'info')
  }

  const handleSave = () => {
    updateStoreSettings({
      isStoreOpen, acceptOnlineOrders,
      allowInStorePickups: allowInStorePickup,
      allowDelivery,
    })
    setHasUnsavedChanges(false)
    showToast('Settings saved successfully!', 'success')
  }

  return (
    <AdminLayout>
      <div className="pb-28">

        {/* ── Page Header ── */}
        <div className="mb-6 pb-5 border-b border-slate-200">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Manage your store, ordering preferences, notifications, and administrative settings.
          </p>
        </div>

        {/* ── Two-Column Layout ── */}
        <div className="flex gap-6 items-start">

          {/* LEFT: Secondary Settings Nav */}
          <aside className="w-52 flex-shrink-0 bg-white rounded-xl border border-slate-200 p-3 shadow-xs sticky top-6">
            {NAV_SECTIONS.map((section) => (
              <div key={section.group} className="mb-4 last:mb-0">
                <p className="px-2.5 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {section.group}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const active = activeSection === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                          active
                            ? 'bg-orange-50 text-brand-orange border border-orange-200/70 shadow-xs'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                        }`}
                      >
                        <span>{item.label}</span>
                        {active && (
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </aside>

          {/* RIGHT: Main Content */}
          <main className="flex-1 min-w-0 space-y-5">

            {/* ── Store Operations ── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4.5 h-4.5 text-emerald-600">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">Store Operations</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Control when your store accepts orders and how customers can purchase items.
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-6 space-y-4">
                {/* Store Status — prominent row */}
                <div className={`flex items-start justify-between gap-4 p-4 rounded-xl border ${
                  isStoreOpen ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isStoreOpen ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <span className="text-sm font-bold text-slate-900">
                        Store Status &mdash;{' '}
                        <span className={isStoreOpen ? 'text-emerald-700' : 'text-slate-500'}>
                          {isStoreOpen ? 'Store Open' : 'Store Closed'}
                        </span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 ml-5">
                      When turned off, customers cannot place new orders.
                    </p>
                  </div>
                  <Toggle
                    checked={isStoreOpen}
                    onChange={handleToggle(setIsStoreOpen, isStoreOpen, 'Store Status')}
                    size="lg"
                  />
                </div>

                {/* Three secondary toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      label: 'Accept Online Orders',
                      desc: 'Bag checkout available',
                      checked: acceptOnlineOrders,
                      setter: setAcceptOnlineOrders,
                      name: 'Online Orders',
                    },
                    {
                      label: 'Allow In-Store Pickup',
                      desc: 'Campus claim stations active',
                      checked: allowInStorePickup,
                      setter: setAllowInStorePickup,
                      name: 'In-Store Pickup',
                    },
                    {
                      label: 'Allow Delivery',
                      desc: 'Courier dispatch enabled',
                      checked: allowDelivery,
                      setter: setAllowDelivery,
                      name: 'Delivery',
                    },
                  ].map((t) => (
                    <div
                      key={t.label}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-white"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 leading-snug">{t.label}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{t.desc}</p>
                      </div>
                      <Toggle
                        checked={t.checked}
                        onChange={handleToggle(t.setter, t.checked, t.name)}
                        size="md"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Preview Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <PreviewCard
                title="Order Preferences"
                onNavigate={() => setActiveSection('order-preferences')}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                }
                rows={[
                  { label: 'Max orders per time slot', value: '25 orders'  },
                  { label: 'Order confirmation mode',  value: 'Automatic'  },
                  { label: 'Cancellation policy',      value: 'Within 24h' },
                ]}
              />

              <PreviewCard
                title="Notifications"
                onNavigate={() => setActiveSection('staff-notifications')}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                }
                rows={[
                  { label: 'New order notifications', value: 'Instant Push' },
                  { label: 'Pickup reminders',        value: '2h Before'    },
                  { label: 'Low-stock alerts',        value: '≤ 5 units'    },
                ]}
              />

              <PreviewCard
                title="Access & Permissions"
                onNavigate={() => setActiveSection('access-permissions')}
                icon={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                }
                rows={[
                  { label: 'Staff access',          value: 'POS & Claims'      },
                  { label: 'Manager permissions',   value: 'Catalog & Orders'  },
                  { label: 'Administrator',         value: 'Full Access'       },
                ]}
              />
            </div>

          </main>
        </div>
      </div>

      {/* ── Sticky Bottom Bar ── */}
      <div className="fixed bottom-0 right-0 left-0 md:left-64 bg-white/95 backdrop-blur-md border-t border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4 z-20 shadow-lg">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${hasUnsavedChanges ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
          <span className="text-xs font-semibold text-slate-600">
            {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={!hasUnsavedChanges}
            onClick={handleDiscard}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-lg bg-brand-orange hover:bg-orange-600 text-white text-xs font-bold transition-colors shadow-sm active:scale-95"
          >
            Save Changes
          </button>
        </div>
      </div>
    </AdminLayout>
  )
}