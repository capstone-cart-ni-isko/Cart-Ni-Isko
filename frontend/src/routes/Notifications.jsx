import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useApiChange } from '../hooks/useApiChange.js'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import SkeletonBlock from '../components/ui/SkeletonBlock.jsx'
import Modal from '../components/ui/Modal.jsx'
import { HelpIcon } from '../components/ui/Icons.jsx'
import NotificationCard, { inferNotificationDetails, NotifIcon } from '../components/ui/NotificationCard.jsx'
import {
  fetchNotifications,
  markAllRead,
  markRead,
  markReadInCache,
  readNotificationsCache,
} from '../services/notifications.js'

/** REQ-OT-01: "to claim"/"to receive" notifications are handled by QR scanning, not regular notifications. */
function isExemptNotification(message) {
  const msg = String(message || '').toLowerCase()
  return msg.includes('to claim') || msg.includes('to receive')
}

/** REQ-AB-04 / REQ-SC-04: a closed-slot notice opens the updated calendar. */
function calendarTarget(message) {
  const text = String(message || '').toLowerCase()
  return text.includes('appointment') && /clos|cancel|unavailable/.test(text)
    ? '/appointments'
    : null
}

/** Extract concerned order URL if notification relates to an order. */
function extractOrderTarget(message, row) {
  if (row?.ord_id) return `/orders/${row.ord_id}`
  const text = String(message || '')
  const match = text.match(/order\s*(?:#|no\.?|id:?\s*)?(\d+)/i)
  if (match?.[1]) {
    return `/orders/${match[1]}`
  }
  return null
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

function timeAgo(date) {
  if (Number.isNaN(date.getTime())) return 'Recently'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

/** Map a custnotif_* / empnotif_* row into the inbox card shape this page renders. */
function mapNotification(row, index) {
  const message = row.custnotif_msg ?? row.empnotif_msg ?? row.message ?? ''
  const created = row.custnotif_created ?? row.empnotif_created ?? row.created_at
  const details = inferNotificationDetails(message)

  // A rejected cancellation must read as its own outcome, not a generic
  // "Order Update": the customer needs the decision spelled out.
  if (/cancellation request was not approved/i.test(message)) {
    details.category = 'orders'
    details.title = 'Cancellation Not Approved'
    details.tag = 'Not Approved'
    details.icon = 'alert'
    details.iconBg =
      'bg-rose-50 text-rose-600 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60'
    details.tagClass =
      'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
  }

  return {
    id: row.custnotif_id ?? row.empnotif_id ?? row.id ?? `notif-${index}`,
    category: details.category,
    icon: details.icon,
    iconBg: details.iconBg,
    priority: details.priority,
    orderNumber: details.orderNumber,
    tag: details.tag,
    tagClass: details.tagClass,
    title: details.title,
    message: details.cleanMessage,
    time: created ? timeAgo(new Date(created)) : 'Just now',
    unread: !(row.custnotif_read || row.empnotif_read),
    targetUrl: row.notif_link || extractOrderTarget(message, row) || calendarTarget(message),
    isExempt: isExemptNotification(message),
  }
}

export default function Notifications() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Unread')
  const [selectedNotif, setSelectedNotif] = useState(null)

  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  /** REQ-AN-01: the customer's real inbox from GET /notif/display. */
  const load = useCallback(async () => {
    if (!custId) {
      setItems([])
      setLoading(false)
      return
    }
    // Paint the 60-second mirror first, then let the request refresh it. An
    // already-populated inbox is left alone so a refresh never flickers back.
    const cached = readNotificationsCache('customer', custId)
    if (cached) {
      setItems((prev) => (prev.length ? prev : cached.map(mapNotification)))
      setLoading(false)
    }

    try {
      const rows = await fetchNotifications('customer', custId)
      setItems((rows || []).map(mapNotification))
    } catch (err) {
      console.warn('Failed to load notifications:', err?.message)
    } finally {
      setLoading(false)
    }
  }, [custId])

  // Realtime (FLOW-NOTIF-01): a notification generated by a checkout, an order
  // status change or a booking lands in the open inbox at once; the badge on
  // the ribbon is refreshed by RealtimeBridge's window event.
  const version = useApiChange('notif')

  useEffect(() => {
    load()
  }, [load, version])

  /**
   * Clicking a notification marks it read and opens its target.
   */
  const markNotificationRead = (notif) => {
    if (!notif?.id || !notif.unread) return
    setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, unread: false } : n)))
    setSelectedNotif((prev) => (
      prev && prev.id === notif.id ? { ...prev, unread: false } : prev
    ))
    markReadInCache('customer', custId, [notif.id])
    markRead(notif.id, 'customer')
      .catch(() => {})
      .finally(() => window.dispatchEvent(new Event('notifications-changed')))
  }

  const markAllAsRead = async () => {
    const unreadItems = items.filter((n) => n.unread && n.id)
    if (unreadItems.length === 0) return
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })))
    setSelectedNotif((prev) => (prev ? { ...prev, unread: false } : prev))
    try {
      // One request for the whole inbox; one per row timed out part way.
      await markAllRead('customer')
      markReadInCache('customer', custId)
    } catch {
      // Never pretend: put the server's real state back on screen.
      load()
    } finally {
      window.dispatchEvent(new Event('notifications-changed'))
    }
  }

  const handleNotificationClick = (notif) => {
    markNotificationRead(notif)
    if (notif.targetUrl) {
      navigate(notif.targetUrl)
    } else {
      setSelectedNotif({ ...notif, unread: false })
    }
  }

  // Calculate badge counts
  const countUnread = items.filter((n) => n.unread).length
  const countOrders = items.filter((n) => n.category === 'orders' || n.category === 'payment').length
  const countProduction = items.filter((n) => n.category === 'production' || n.category === 'inventory').length
  const countSystem = items.filter((n) => n.category === 'system' || n.category === 'security' || n.category === 'announcement' || n.category === 'appointment').length
  const unreadTotal = countUnread

  // Filter items based on activeTab
  const filteredItems = items.filter((n) => {
    if (activeTab === 'Unread') return n.unread
    if (activeTab === 'Orders') return n.category === 'orders' || n.category === 'payment'
    if (activeTab === 'Production') return n.category === 'production' || n.category === 'inventory'
    if (activeTab === 'System') return n.category === 'system' || n.category === 'security' || n.category === 'announcement' || n.category === 'appointment'
    return true
  })

  const tabs = [
    { label: 'Unread', count: countUnread },
    { label: 'Orders', count: countOrders },
    { label: 'Production', count: countProduction },
    { label: 'System', count: countSystem },
  ]

  return (
    <AppShell>
      <PageHeader
        title="Notifications"
        subtitle="Stay updated with your orders, production, and important announcements."
        backTo="/home"
      />

      <div className="max-w-6xl mx-auto w-full px-4 md:px-0 py-4 md:py-2 pb-32 lg:pb-16 animate-fade-in lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6 lg:items-start">
        {/* Categories + Mark All as Read: a card on the right on wide
            screens, kept in view while the list scrolls. */}
        <aside className="hidden lg:block lg:col-start-2 lg:row-start-1 lg:sticky lg:top-6 rounded-2xl border border-slate-200/80 bg-white shadow-2xs p-5 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
          <div role="tablist" aria-orientation="vertical" className="space-y-1">
            {tabs.map(({ label, count }) => {
              const active = activeTab === label
              return (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(label)}
                  className={`w-full h-11 px-4 rounded-xl flex items-center justify-between text-sm font-semibold transition-colors cursor-pointer ${
                    active ? 'bg-orange-50 text-brand-orange' : 'text-gray-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{label}</span>
                  <span className={`text-sm tabular-nums ${active ? 'text-brand-orange' : 'text-gray-400'}`}>{count}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={markAllAsRead}
            className="w-full h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-brand-orange hover:bg-orange-50 transition-colors cursor-pointer"
          >
            Mark All as Read
          </button>
        </aside>

      <div className="lg:col-start-1 lg:row-start-1 min-w-0 space-y-4">
        {/* Category tabs (phones and tablets): plain underline tabs on the
            page itself, pinned while the list scrolls underneath. */}
        <nav
          aria-label="Notification categories"
          className="lg:hidden sticky top-14 md:top-0 z-20 -mx-4 px-4 pt-3 bg-[#F8F9FA]/90 dark:bg-[var(--surface)]/90 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div
              role="tablist"
              className="flex flex-nowrap gap-6 overflow-x-auto scrollbar-none select-none border-b border-slate-200 flex-1"
            >
              {tabs.map(({ label, count }) => {
                const active = activeTab === label
                return (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(label)}
                    className={`relative -mb-px shrink-0 pb-3 pt-1 text-sm font-semibold transition-colors cursor-pointer border-b-2 flex items-baseline gap-1.5 ${
                      active
                        ? 'border-brand-orange text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    <span>{label}</span>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        active ? 'text-brand-orange' : 'text-gray-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={markAllAsRead}
              className="shrink-0 mb-2 px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-brand-orange hover:text-brand-orange-dark hover:bg-orange-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Mark All as Read
            </button>
          </div>
        </nav>

        {loading ? (
          <div className="space-y-4" aria-busy={loading} aria-live="polite">
            <span className="sr-only">Loading notifications</span>
            {Array.from({ length: 4 }, (_, index) => (
              <article
                key={index}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs animate-pulse"
                aria-hidden="true"
              >
                <div className="flex items-start gap-3.5 p-4 sm:p-5">
                  <SkeletonBlock className="h-11 w-11 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <SkeletonBlock className="h-4 w-2/5 rounded" />
                      <SkeletonBlock className="h-3 w-12 rounded" />
                    </div>
                    <SkeletonBlock className="h-3 w-full rounded" />
                    <SkeletonBlock className="h-3 w-3/4 rounded" />
                    <SkeletonBlock className="h-3 w-24 rounded" />
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-slate-200 px-6 py-12 shadow-2xs">
            <CaughtUpIllustration className="w-40 h-40 mb-2" />
            <h3 className="text-base font-semibold text-gray-900">You're all caught up!</h3>
            <p className="text-sm text-gray-500 mt-1">No new notifications at the moment.</p>
          </div>
        ) : (
          <>
            {unreadTotal === 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-emerald-900">You're all caught up!</p>
                  <p className="text-sm text-emerald-700">No unread notifications.</p>
                </div>
              </div>
            )}

            {filteredItems.length === 0 ? (
              <div className="text-center bg-white rounded-2xl border border-slate-200 px-6 py-12 shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <NotifIcon icon="bell" className="w-6 h-6" />
                </div>
                <p className="text-base font-semibold text-gray-900">
                  No notifications in this category
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Updates about your orders, appointments and the campus store will appear here.
                </p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <NotificationCard
                  key={item.id}
                  notification={item}
                  onClick={handleNotificationClick}
                  showMeta={false}
                  actionLabel="View details"
                />
              ))
            )}

            {filteredItems.length > 0 && (
              <p className="text-sm text-gray-400 font-medium text-center">
                Showing {filteredItems.length} notification{filteredItems.length !== 1 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </div>
      </div>

      {/* Focused Notification Detail Popup */}
      <Modal
        isOpen={Boolean(selectedNotif)}
        onClose={() => setSelectedNotif(null)}
        title={selectedNotif?.title || 'Notification Details'}
        subtitle={selectedNotif?.time || ''}
        size="sm"
        footer={
          <div className="flex flex-wrap items-center justify-end w-full gap-2">
            {selectedNotif?.targetUrl && (
              <button
                type="button"
                onClick={() => {
                  const target = selectedNotif.targetUrl
                  setSelectedNotif(null)
                  navigate(target)
                }}
                className="h-10 px-4 rounded-xl bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-dark transition-colors cursor-pointer"
              >
                {selectedNotif?.orderNumber || String(selectedNotif?.targetUrl || '').startsWith('/orders')
                  ? 'View Order Details'
                  : 'View Details'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedNotif(null)}
              className="h-10 px-4 rounded-xl border border-slate-200 dark:border-[var(--line)] text-sm font-semibold text-slate-600 dark:text-[var(--muted)] hover:bg-slate-50 dark:hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        }
      >
        {selectedNotif && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              {selectedNotif.tag && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold border ${selectedNotif.tagClass}`}>
                  {selectedNotif.tag}
                </span>
              )}
              <span className="text-xs text-gray-400 font-medium ml-auto">{selectedNotif.time}</span>
            </div>
            <p className="text-sm text-gray-800 dark:text-[var(--ink)] leading-relaxed whitespace-pre-line">
              {selectedNotif.message}
            </p>
          </div>
        )}
      </Modal>
    </AppShell>
  )
}
