import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '../components/layout/AppShell.jsx'
import { HelpIcon } from '../components/ui/Icons.jsx'

// SVG Icons tailored for notification types
function NotifTypeIcon({ icon, className = 'w-5 h-5' }) {
  switch (icon) {
    case 'megaphone':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      )
    case 'box':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )
    case 'bag':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      )
    case 'truck':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      )
    case 'alert':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )
  }
}

// Caught Up illustration component
function CaughtUpIllustration({ className = 'w-44 h-44' }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Background soft blob */}
      <div className="absolute inset-2 bg-orange-50/80 rounded-full blur-xs" />
      <svg viewBox="0 0 200 200" className="w-full h-full relative z-10" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Soft background circle */}
        <circle cx="100" cy="105" r="75" fill="#FFF7ED" />

        {/* Character Illustration */}
        <g id="character">
          {/* Hair behind */}
          <path d="M70 120 C60 100 65 70 95 65 C130 60 145 85 135 120 Z" fill="#1F2937" />
          {/* Body / Shirt */}
          <path d="M60 180 C60 140 75 125 100 125 C125 125 140 140 140 180 Z" fill="#FED7AA" />
          {/* Neck */}
          <path d="M92 115 L108 115 L108 128 L92 128 Z" fill="#FDBA74" />
          {/* Head & Face */}
          <ellipse cx="100" cy="98" rx="22" ry="25" fill="#FED7AA" />
          {/* Hair front */}
          <path d="M78 90 C82 72 100 70 115 72 C125 74 125 85 124 95 C118 85 105 82 92 84 C85 85 80 88 78 90 Z" fill="#1F2937" />
          {/* Eyes & Smile */}
          <circle cx="93" cy="97" r="2.2" fill="#1F2937" />
          <circle cx="107" cy="97" r="2.2" fill="#1F2937" />
          <path d="M96 106 Q100 110 104 106" stroke="#C2410C" strokeWidth="2" strokeLinecap="round" fill="none" />
          {/* Blush */}
          <circle cx="88" cy="103" r="3" fill="#FCA5A5" opacity="0.6" />
          <circle cx="112" cy="103" r="3" fill="#FCA5A5" opacity="0.6" />

          {/* Smartphone held in hand */}
          <rect x="122" y="120" width="20" height="34" rx="4" fill="#374151" transform="rotate(8 122 120)" />
          <rect x="124" y="123" width="16" height="28" rx="2" fill="#E5E7EB" transform="rotate(8 122 120)" />
          {/* Hand */}
          <circle cx="126" cy="138" r="5" fill="#FED7AA" />
        </g>

        {/* Ringing Bell Icon badge */}
        <g id="ringing-bell" transform="translate(130, 50)">
          <path d="M18 10 A6 6 0 0 0 6 10 c0 7-3 9-3 9 h18 s-3-2-3-9" fill="#EA580C" />
          <circle cx="12" cy="21" r="2" fill="#EA580C" />
          {/* Motion lines */}
          <path d="M22 6 L25 4" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" />
          <path d="M25 11 L28 11" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" />
          <path d="M2 11 L-1 11" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" />
          <path d="M2 6 L-1 4" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  )
}

const INITIAL_NOTIFICATIONS = []

export default function Notifications() {
  const navigate = useNavigate()
  const [items, setItems] = useState(INITIAL_NOTIFICATIONS)
  const [activeTab, setActiveTab] = useState('All') // 'All' | 'Orders' | 'Production' | 'System' | 'Promotions'

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })))
  }

  const markRead = (id, targetUrl) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)))
    if (targetUrl) {
      navigate(targetUrl)
    }
  }

  // Calculate badge counts
  const countAll = items.length
  const countOrders = items.filter((n) => n.category === 'orders').length
  const countProduction = items.filter((n) => n.category === 'production').length
  const countSystem = items.filter((n) => n.category === 'system').length
  const countPromotions = items.filter((n) => n.category === 'promotions').length
  const unreadTotal = items.filter((n) => n.unread).length

  // Filter items based on activeTab
  const filteredItems = items.filter((n) => {
    if (activeTab === 'All') return true
    if (activeTab === 'Orders') return n.category === 'orders'
    if (activeTab === 'Production') return n.category === 'production'
    if (activeTab === 'System') return n.category === 'system'
    if (activeTab === 'Promotions') return n.category === 'promotions'
    return true
  })

  // Mobile: show caught-up only when there are no notifications at all
  const isMobileEmpty = filteredItems.length === 0
  // Desktop: show caught-up card only when all notifications are read
  const isDesktopCaughtUp = unreadTotal === 0

  return (
    <AppShell>
      <div className="px-4 py-6 pb-32 lg:px-6 lg:py-6 lg:pb-16 max-w-7xl mx-auto animate-fade-in">

        {/* Header (Matching Photo 5 on desktop & Photo 2 on mobile) */}
        <div className="flex items-start gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">Notifications</h1>
            <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">
              Stay updated with your orders, production, and important announcements.
            </p>
          </div>
        </div>

        {/* Filter Pills and Mark as read toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 mb-7 pb-2 border-b border-slate-200">
          {/* Filter Pills */}
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { label: 'All', count: countAll },
              { label: 'Orders', count: countOrders },
              { label: 'Production', count: countProduction },
              { label: 'System', count: countSystem },
              { label: 'Promotions', count: countPromotions },
            ].map(({ label, count }) => {
              const active = activeTab === label
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveTab(label)}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-orange-50 border border-brand-orange text-brand-orange'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-black ${
                      active ? 'bg-brand-orange text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Mark all as read button */}
          {unreadTotal > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-600 hover:text-brand-orange self-end sm:self-auto transition-colors cursor-pointer shrink-0"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-brand-orange">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Mark all as read</span>
            </button>
          )}
        </div>

        {/* Main Grid: Left Notification List + Right Caught-Up Card (Desktop) */}
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-start">
          {/* Notifications Feed (or Mobile Empty State) */}
          <div className="lg:col-span-8 space-y-3.5">
            {/* Mobile Empty / Caught Up State */}
            <div className={`md:hidden ${isMobileEmpty ? 'block' : 'hidden'}`}>
              {/* Illustration + Text — no card, sits on page bg */}
              <div className="flex flex-col items-center justify-center text-center pt-10 pb-8 px-6">
                <CaughtUpIllustration className="w-56 h-56 mb-5" />
                <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">You're all caught up!</h3>
                <p className="text-sm text-gray-400 font-medium mt-2 max-w-[260px] leading-relaxed">
                  No new notifications at the moment.
                </p>
              </div>

              {/* Need help card — separate white card below */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3.5 shadow-2xs">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-brand-orange border border-orange-200 flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M9 18h6M10 22h4" />
                    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-900">Need help?</h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Check the Help Center for more information about your orders and fulfillment process.
                  </p>
                  <Link
                    to="/help"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-orange hover:underline mt-2"
                  >
                    <span>Visit Help Center</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Notification Cards List (When not mobile empty) */}
            <div className={`space-y-3 ${isMobileEmpty ? 'hidden md:block' : 'block'}`}>
              {filteredItems.length === 0 ? (
                <div className="hidden md:block text-center py-16 bg-white rounded-xl border border-slate-200 p-8 shadow-2xs">
                  <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-slate-700">No notifications found in this category.</p>
                  <p className="text-xs text-slate-400 mt-1">Updates regarding your orders, appointments, and campus store will appear here.</p>
                </div>
              ) : (
                filteredItems.map((item) => (
                  <article
                    key={item.id}
                    onClick={() => markRead(item.id, item.targetUrl)}
                    className={`relative bg-white rounded-xl border transition-colors p-4 sm:p-5 flex items-start gap-4 cursor-pointer group shadow-2xs ${
                      item.unread ? 'border-orange-200 bg-orange-50/15' : 'border-slate-200'
                    }`}
                  >
                    {/* Left Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center shrink-0 ${item.iconBg}`}
                    >
                      <NotifTypeIcon icon={item.icon} className="w-5 h-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                            {item.title}
                          </h3>
                          {item.unread && (
                            <span className="w-2.5 h-2.5 rounded-full bg-brand-orange shrink-0 animate-pulse" />
                          )}
                        </div>
                        <span className="text-xs font-medium text-slate-400 shrink-0">
                          {item.time}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed line-clamp-2">
                        {item.message}
                      </p>

                      <div className="flex items-center justify-between mt-3">
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-md capitalize ${item.tagColor}`}
                        >
                          {item.tag}
                        </span>
                        <div className="text-slate-400 group-hover:text-brand-orange transition-colors text-sm font-bold">
                          ›
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              )}

              {/* Showing count footer */}
              {filteredItems.length > 0 && (
                <div className="text-xs text-slate-400 font-medium pt-2 text-center sm:text-left">
                  Showing 1–{filteredItems.length} of {countAll} notifications
                </div>
              )}
            </div>
          </div>

          {/* Desktop Right Column: Caught Up Card (Photo 5) */}
          <div className="hidden lg:block lg:col-span-4 sticky top-28 space-y-4">
            {isDesktopCaughtUp && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 text-center flex flex-col items-center shadow-2xs">
                <CaughtUpIllustration className="w-48 h-48 mb-3" />
                <h3 className="text-lg font-black text-slate-900 mt-1">You're all caught up!</h3>
                <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
                  No new notifications at the moment.
                </p>
              </div>
            )}

            {/* Quick Link Card to Help Center */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-50 text-brand-orange border border-orange-200 flex items-center justify-center font-bold text-sm shrink-0">
                  <HelpIcon className="w-4 h-4 text-brand-orange" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Need order assistance?</h4>
                  <p className="text-xs text-slate-400">Visit our student help desk</p>
                </div>
              </div>
              <Link
                to="/help"
                className="text-xs sm:text-sm font-bold text-brand-orange hover:underline px-2 py-1 shrink-0"
              >
                Help Center →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}