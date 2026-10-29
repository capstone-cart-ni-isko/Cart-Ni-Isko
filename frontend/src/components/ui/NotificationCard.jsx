/* eslint-disable react-refresh/only-export-components */

/**
 * Universal SVG icons for notification categories across customer & admin portals.
 */
export function NotifIcon({ icon, className = 'w-5 h-5' }) {
  switch (icon) {
    case 'box':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      )
    case 'credit-card':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <circle cx="7" cy="15" r="1" fill="currentColor" />
        </svg>
      )
    case 'qr':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3z" />
          <path d="M20 14v3h-3" />
          <path d="M14 20h7" />
        </svg>
      )
    case 'truck':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="1" y="3" width="15" height="13" rx="1" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      )
    case 'calendar':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )
    case 'alert':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
    case 'megaphone':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
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
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )
  }
}

/**
 * Parses message string into contextual notification attributes:
 * title, category, semantic icon, badges, and clean text.
 */
export function inferNotificationDetails(rawMessage = '', explicitPriority = false) {
  const raw = String(rawMessage || '')
  const text = raw.toLowerCase()
  const priority = explicitPriority || /^\s*\[priority\]/i.test(raw) || text.includes('failed qr') || text.includes('low stock')
  const cleanMessage = raw.replace(/\[\s*priority\s*\]/gi, '').trim()

  // Match order number (#123 or order 123)
  const orderMatch = raw.match(/order\s*(?:#|no\.?|id:?\s*)?(\d+)/i)
  const orderNumber = orderMatch ? `#${orderMatch[1]}` : null

  let category = 'system'
  let title = priority ? 'Priority Notice' : 'System Notice'
  let icon = 'bell'
  let iconBg = 'bg-slate-50 text-slate-600 border-slate-200/80 dark:bg-[var(--surface-3)] dark:text-[var(--muted)] dark:border-[var(--line)]'
  let tag = 'General'
  let tagClass = 'bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-[var(--surface-3)] dark:text-[var(--muted)]'

  if (text.includes('failed qr') || text.includes('does not match') || text.includes('invalid qr')) {
    category = 'security'
    title = 'QR Scan Alert'
    icon = 'qr'
    iconBg = 'bg-rose-50 text-rose-600 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60'
    tag = 'Scan Error'
    tagClass = 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
  } else if (text.includes('claimed')) {
    category = 'orders'
    title = 'Order Claimed'
    icon = 'box'
    iconBg = 'bg-emerald-50 text-emerald-600 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60'
    tag = 'Claimed'
    tagClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
  } else if (text.includes('payment') || text.includes('paid') || text.includes('refund')) {
    category = 'payment'
    title = text.includes('refund') ? 'Refund Processed' : 'Payment Received'
    icon = 'credit-card'
    iconBg = 'bg-emerald-50 text-emerald-600 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60'
    tag = 'Payment'
    tagClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
  } else if (text.includes('low stock') || text.includes('out of stock')) {
    category = 'inventory'
    title = 'Low Stock Alert'
    icon = 'alert'
    iconBg = 'bg-amber-50 text-amber-600 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60'
    tag = 'Inventory'
    tagClass = 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
  } else if (text.includes('ready for pickup') || text.includes('ready to claim')) {
    category = 'orders'
    title = 'Ready for Pickup'
    icon = 'box'
    iconBg = 'bg-orange-50 text-brand-orange border-orange-200/80 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800/60'
    tag = 'Ready'
    tagClass = 'bg-orange-50 text-orange-700 border-orange-200/80 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60'
  } else if (text.includes('order') || text.includes('deliver') || text.includes('pickup') || text.includes('processing')) {
    category = 'orders'
    title = text.includes('placed') ? 'Order Placed' : 'Order Update'
    icon = text.includes('deliver') ? 'truck' : 'box'
    iconBg = 'bg-orange-50 text-brand-orange border-orange-200/80 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800/60'
    tag = 'Orders'
    tagClass = 'bg-orange-50 text-orange-700 border-orange-200/80 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60'
  } else if (text.includes('appointment') || text.includes('schedule') || text.includes('slot') || text.includes('visit')) {
    category = 'appointment'
    title = 'Appointment Update'
    icon = 'calendar'
    iconBg = 'bg-blue-50 text-blue-600 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/60'
    tag = 'Appointment'
    tagClass = 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60'
  } else if (text.includes('promo') || text.includes('voucher') || text.includes('sale') || text.includes('discount')) {
    category = 'promotions'
    title = 'Promotion'
    icon = 'bag'
    iconBg = 'bg-purple-50 text-purple-600 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/60'
    tag = 'Promo'
    tagClass = 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60'
  } else if (text.includes('broadcast') || text.includes('announcement') || text.includes('notice')) {
    category = 'announcement'
    title = 'Store Announcement'
    icon = 'megaphone'
    iconBg = 'bg-indigo-50 text-indigo-600 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800/60'
    tag = 'Broadcast'
    tagClass = 'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60'
  }

  return {
    cleanMessage,
    priority,
    orderNumber,
    category,
    title,
    icon,
    iconBg,
    tag,
    tagClass,
  }
}

/**
 * Standardized Notification Card Component
 * Shared across Customer and Admin portals for visual cohesion and readability.
 */
export default function NotificationCard({
  notification,
  onClick,
  actionLabel = 'View details →',
  onMarkRead,
  onViewDetails,
  showMeta = true,
  className = '',
}) {
  const isUnread = Boolean(notification.unread ?? !notification.read)
  const isPriority = Boolean(notification.priority)
  const isOrder = Boolean(
    notification.orderNumber ||
    String(notification.targetUrl || '').startsWith('/orders')
  )
  const hasActions = Boolean(onMarkRead || onViewDetails)

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.(notification)
    }
  }

  const stop = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(notification)}
      onKeyDown={handleKeyDown}
      className={`group relative rounded-2xl border transition-all duration-150 cursor-pointer p-4 sm:p-5 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 ${
        isUnread
          ? 'bg-orange-50/25 border-orange-200 shadow-2xs hover:border-orange-300 hover:shadow-xs dark:bg-orange-950/15 dark:border-orange-500/30'
          : 'bg-white border-slate-200/90 shadow-2xs hover:border-slate-300 hover:shadow-xs dark:bg-[var(--surface-2)] dark:border-[var(--line)]'
      } ${className}`}
    >
      <div className="flex items-start gap-3.5 sm:gap-4">
        {/* Leading Category/Status Icon */}
        <div
          className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${notification.iconBg}`}
        >
          <NotifIcon icon={notification.icon} className="w-5 h-5" />
        </div>

        {/* Content Body */}
        <div className="flex-1 min-w-0">
          {/* Header row: Title + Unread indicator on left, Timestamp on right */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-[var(--ink)] tracking-tight leading-snug truncate">
                {notification.title}
              </h3>

              {isUnread && (
                <span
                  className="w-2 h-2 rounded-full bg-brand-orange shrink-0 animate-pulse"
                  title="Unread notification"
                  aria-label="Unread"
                />
              )}
            </div>

            <span className="text-2xs sm:text-xs font-medium text-slate-400 dark:text-[var(--muted)] shrink-0 pt-0.5 whitespace-nowrap">
              {notification.time}
            </span>
          </div>

          {/* Description Text */}
          <p className="text-xs sm:text-sm text-slate-600 dark:text-[var(--ink)]/80 mt-1.5 leading-relaxed break-words line-clamp-3">
            {notification.message}
          </p>

          {/* Footer Metadata Row */}
          <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-[var(--line)] flex items-center justify-between gap-3 flex-wrap">
            {/* Badges container */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Priority badge - staff portal only */}
              {showMeta && isPriority && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  Priority
                </span>
              )}

              {/* Order number tag - staff portal only */}
              {showMeta && notification.orderNumber && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-mono font-semibold bg-orange-50 text-brand-orange border border-orange-200/60 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60">
                  {notification.orderNumber}
                </span>
              )}

              {/* Semantic category tag */}
              {notification.tag && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold border ${notification.tagClass}`}
                >
                  {notification.tag}
                </span>
              )}

              {/* Read status removed as requested */}
            </div>

            {/* Actions: customers get explicit Mark as Read / View Order Details */}
            {hasActions ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!isUnread || !onMarkRead}
                  onClick={(e) => {
                    stop(e)
                    onMarkRead?.(notification)
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[var(--line)] text-2xs font-semibold text-slate-600 dark:text-[var(--muted)] hover:border-brand-orange hover:text-brand-orange disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-slate-600 transition-colors cursor-pointer disabled:cursor-default"
                >
                  Mark as Read
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e)
                    onViewDetails?.(notification)
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-brand-orange text-white text-2xs font-semibold hover:bg-brand-orange-dark transition-colors cursor-pointer"
                >
                  {isOrder ? 'View Order Details' : 'View Details'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 group-hover:text-brand-orange transition-colors shrink-0">
                <span>{actionLabel}</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
