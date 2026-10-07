import { useCallback, useEffect, useState } from 'react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import {
  fetchNotifications,
  markRead,
  readNotificationsCache,
} from '../../services/notifications.js'

/** DOMAIN 31 - a relative stamp the same way the customer inbox shows it. */
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

/** empnotif_* row -> the card shape this page renders. */
function mapNotification(row, index) {
  const message = String(row.empnotif_msg ?? row.message ?? '')
  const created = row.empnotif_created ?? row.created_at
  const priority =
    String(row.empnotif_type || '').toLowerCase() === 'priority' ||
    /^\s*\[priority\]/i.test(message)

  return {
    id: row.empnotif_id ?? row.id ?? `notif-${index}`,
    message,
    priority,
    time: created ? timeAgo(new Date(created)) : 'Just now',
    // FLOW-NOTIF-05 - unread rows carry no *_read stamp.
    read: Boolean(row.empnotif_read ?? row.read),
  }
}

/**
 * FLOW-EMP_HOME-08 - the "notification" icon in the ribbon opens this tab.
 *
 * FLOW-NOTIF-02..06: the backend already answers unread-first, priority-first,
 * newest-first; opening a row stamps its read time and the unread counter on
 * the ribbon follows through the `notifications-changed` event.
 */
export default function AdminNotifications() {
  const { currentAdminUser } = useAdmin()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const empId = currentAdminUser?.id ?? null

  const load = useCallback(async () => {
    if (!empId) {
      setItems([])
      setLoading(false)
      return
    }

    // 60-second mirror paints instantly, then the request refreshes it.
    const cached = readNotificationsCache('employee', empId)
    if (cached) {
      setItems((prev) => (prev.length ? prev : cached.map(mapNotification)))
      setLoading(false)
    }

    try {
      const rows = await fetchNotifications('employee', empId)
      setItems((rows || []).map(mapNotification))
    } catch (err) {
      console.warn('Failed to load notifications:', err?.message)
    } finally {
      setLoading(false)
    }
  }, [empId])

  useEffect(() => {
    load()
  }, [load])

  /** FLOW-NOTIF-05 - a notification is marked read only when it is opened. */
  const openNotification = (item) => {
    if (item.read) return
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)))
    markRead(item.id, 'employee')
      .catch(() => {})
      .finally(() => window.dispatchEvent(new Event('notifications-changed')))
  }

  const unread = items.filter((n) => !n.read)
  const shown = filter === 'unread' ? unread : items

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header — same type treatment as the customer inbox */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
            Notifications
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">
            Store updates, appointment activity and system notices for your account.
          </p>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-2 border-b border-slate-200 scrollbar-none">
          {[
            { key: 'all', label: 'All', count: items.length },
            { key: 'unread', label: 'Unread', count: unread.length },
          ].map(({ key, label, count }) => {
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
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

        {/* Inbox */}
        {loading && items.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 text-xs text-slate-400">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 border-t-brand-orange animate-spin" />
              Loading notifications…
            </span>
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-xl border border-slate-200 p-8">
            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-700">
              {filter === 'unread' ? 'You are all caught up.' : 'No notifications yet.'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Store activity and system notices will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((item) => (
              <article
                key={item.id}
                onClick={() => openNotification(item)}
                className={`relative bg-white rounded-xl border transition-colors p-4 flex items-start gap-4 cursor-pointer group ${
                  item.read ? 'border-slate-200' : 'border-orange-200 bg-orange-50/15'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                    item.priority
                      ? 'bg-amber-50 border-amber-200 text-amber-600'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {item.priority ? 'Priority notice' : 'Notification'}
                      </h3>
                      {!item.read && (
                        <span className="w-2.5 h-2.5 rounded-full bg-brand-orange shrink-0 animate-pulse" />
                      )}
                    </div>
                    <span className="text-xs font-medium text-slate-400 shrink-0">{item.time}</span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
                    {item.message}
                  </p>

                  <div className="flex items-center justify-between mt-3">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                        item.priority ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.priority ? 'Priority' : 'General'}
                    </span>
                    <span className="text-slate-400 group-hover:text-brand-orange transition-colors text-sm font-bold">
                      ›
                    </span>
                  </div>
                </div>
              </article>
            ))}

            <div className="text-xs text-slate-400 font-medium pt-1 text-center sm:text-left">
              Showing {shown.length} of {items.length} notification{items.length === 1 ? '' : 's'}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
