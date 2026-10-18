import { useState, useMemo, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { empCateg, empIsStaff } from './schema.js'
import ClockInOut from './ClockInOut.jsx'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'

const ICON = 'w-4 h-4'

/*
 * FLOW-EMP_HOME-05 — the sidebar is a vertical array docked at the left of
 * every employee page, composed of (top to bottom) the "dashboard" icon with
 * the "Dashboard" label, the "walk-in" icon with the "Walk-in Orders" label,
 * the "appointments" icon with the "Appointments" label, the "orders" icon
 * with the "Orders" label, the "products" icon with the "Products" label, the
 * "reviews" icon with the "Reviews" label, the "sales" icon with the
 * "Sales" label, the "staff" icon with the "Staff" label, the "schedules"
 * icon with the "Schedules" label, and the "logout" icon with the
 * "Logout" label.
 *
 * Every entry therefore carries BOTH its icon and its label - the array can no
 * longer collapse to icons, so the two are always rendered together.
 *
 * REQ-EMP_HOME-01 — when emp_categ is 'staff', the Dashboard, Walk-in Orders,
 * Reviews and Sales entries must NOT render. REQ-EMP_HOME-01 also ensures only
 * super admins can access the Staff management page, and only admins+super
 * admins can access inventory, reviews, analytics, and appointments.
 */
const NAV_GROUPS = [
  {
    id: 'overview',
    group: 'Overview',
    items: [
      {
        to: '/admin/dashboard',
        label: 'Dashboard',
        hideForStaff: true,
        // REQ-EMP_HOME-01: Dashboard only for admin and super admin
        roles: ['ADMIN', 'SUPER_ADMIN'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'sales-ops',
    group: 'Operations',
    items: [
      {
        to: '/admin/walkin',
        label: 'Walk-in Orders',
        hideForStaff: true,
        // POST /pos/* is admin-only in the API, so staff never open it.
        roles: ['ADMIN', 'SUPER_ADMIN'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
        ),
      },
      {
        to: '/admin/appointments',
        label: 'Appointments',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <polyline points="9 16 11 18 15 14" />
          </svg>
        ),
      },
      {
        to: '/admin/orders',
        label: 'Orders',
        // FLOW-EMP_HOME-05 lists Orders for every employee and REQ-EMP_HOME-01
        // forbids staff from only Dashboard / Walk-in / Reviews / Sales - and
        // /admin/orders is the staff home (empHomePath), so it must render.
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'store-catalog',
    group: 'Store & Sales',
    items: [
      {
        to: '/admin/inventory',
        label: 'Products',
        // Staff may VIEW the inventory (read-only); only admins and super admins
        // can add, edit, or delete products. The AdminInventory page hides the
        // management buttons for staff.
        roles: ['ADMIN', 'SUPER_ADMIN', 'STAFF'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        ),
      },
      {
        to: '/admin/reviews',
        label: 'Reviews',
        hideForStaff: true,
        // REQ-EMP_HOME-01: Reviews only for admin and super admin
        roles: ['ADMIN', 'SUPER_ADMIN'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ),
      },
      {
        to: '/admin/analytics',
        label: 'Sales',
        hideForStaff: true,
        // REQ-EMP_HOME-01: Sales only for admin and super admin, and the
        // /admin/analytics route carries the same RequireRole guard.
        roles: ['ADMIN', 'SUPER_ADMIN'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        ),
      },
    ],
  },
  {
    id: 'management',
    group: 'Management',
    items: [
      {
        to: '/admin/staff',
        label: 'Staff',
        // REQ-EMP_HOME-01: the Staff entry is admin/super-admin territory, and
        // App.jsx locks /admin/staff (and /admin/users) to SUPER_ADMIN only, so
        // the entry mirrors the route guard exactly - showing it to a plain
        // ADMIN would only bounce them back to their home page.
        roles: ['SUPER_ADMIN'],
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
      {
        to: '/admin/schedules',
        label: 'Schedules',
        // FLOW-EMP_SCHED-01/04: the scheduling screen is reachable by every
        // employee - super admins preschedule the roster and each employee can
        // review their own availability - so this entry stays visible to all.
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <polyline points="12 14 12 16.5 13.5 17.5" />
          </svg>
        ),
      },
    ],
  },
]

/** Every entry the ribbon and the sidebar share a link for. */
const staffAliases = ['/admin/staff', '/admin/users']

export default function AdminSidebar({ onCloseMobile }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentAdminUser, logoutAdmin } = useAdmin()

  const roleKey = currentAdminUser?.roleKey || (empCateg(currentAdminUser) === 'super admin' ? 'SUPER_ADMIN' : empCateg(currentAdminUser) === 'admin' ? 'ADMIN' : 'STAFF')
  // REQ-EMP_HOME-01 — a 'staff' category employee is a regular staff member,
  // so the Dashboard / Walk-in / Reviews / Sales entries never render for them.
  const isStaff = empIsStaff(currentAdminUser)

  // FLOW-EMP_HOME-05 + REQ-EMP_HOME-01 — one pass over the grouped items, so
  // an entry is filtered with exactly the same rule the route guard uses.
  const navGroups = useMemo(() => {
    return NAV_GROUPS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.hideForStaff && isStaff) return false
        if (item.roles && !item.roles.includes(roleKey)) return false
        return true
      }),
    })).filter((section) => section.items.length > 0)
  }, [isStaff, roleKey])

  const [confirmLogout, setConfirmLogout] = useState(false)

  /* Rule 74 keeps the search bar at the centre of the ribbon, but below `sm`
     the ribbon has no room for it, so the same search is surfaced in this
     phone drawer instead of disappearing entirely. */
  const [searchParams] = useSearchParams()
  const [mobileSearch, setMobileSearch] = useState(searchParams.get('search') || '')

  useEffect(() => {
    const q = searchParams.get('search')
    if (q !== null && q !== undefined) {
      setMobileSearch(q)
    }
  }, [searchParams])

  const submitMobileSearch = (e) => {
    e.preventDefault()
    const q = mobileSearch.trim()
    if (q) navigate(`/admin/search?q=${encodeURIComponent(q)}`)
    onCloseMobile?.()
  }

  // DOMAIN 16 — confirmation dialog, then logout and redirect to the login page.
  const handleLogout = () => {
    logoutAdmin()
    setConfirmLogout(false)
    onCloseMobile?.()
    navigate('/admin/login')
  }

  const isActivePath = (to) =>
    staffAliases.includes(to)
      ? staffAliases.some((p) => location.pathname === p)
      : location.pathname === to || location.pathname.startsWith(`${to}/`)

  return (
    /* Settings-like left-docked card: white surface, soft border, rounded
       corners, full height so the nav scrolls inside the card instead of
       pushing the page. Same visual language as the settings rail. */
    <aside className="w-full h-full bg-white dark:bg-[var(--surface)] rounded-xl border border-slate-200 dark:border-[var(--line)] flex flex-col min-h-0 select-none overflow-hidden">
      <div className="flex flex-col flex-1 min-h-0">
        {/* Small-screen drawer close.

            FLOW-EMP_HOME-05 lists the sidebar's contents exactly: the labelled
            navigation entries plus the logout entry - no logo and no search bar.
            Both of those belong to the ribbon, which rule 72/73 and
            FLOW-EMP_HOME-02/03 already place at the top of every employee page,
            so the docked rail is navigation only. On the phone drawer the close
            affordance therefore moves here, where the brand header used to be. */}
        {onCloseMobile && (
          <div className="md:hidden px-3 pt-2 pb-1 flex items-center justify-end shrink-0 border-b border-slate-100 dark:border-[var(--line)]">
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1 rounded-md text-gray-400 dark:text-[var(--muted)] hover:text-gray-600 dark:hover:text-[var(--ink-3)] hover:bg-gray-100 dark:hover:bg-[var(--surface-3)] cursor-pointer"
              aria-label="Close menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Phone-only search (rule 74): the ribbon's own field is hidden
            below `sm`, so the query lives here instead. */}
        <form onSubmit={submitMobileSearch} className="md:hidden px-3 pt-2.5 pb-1.5 shrink-0 border-b border-slate-100 dark:border-[var(--line)]">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={mobileSearch}
              onFocus={() => {
                if (location.pathname !== '/admin/search') {
                  const target = mobileSearch.trim() ? `/admin/search?q=${encodeURIComponent(mobileSearch.trim())}` : '/admin/search'
                  navigate(target)
                  onCloseMobile?.()
                }
              }}
              onChange={(e) => setMobileSearch(e.target.value)}
              placeholder="Search orders, products, customers..."
              aria-label="Search"
              className="field-input w-full pl-9 pr-8"
            />
            {mobileSearch && (
              <button
                type="button"
                onClick={() => setMobileSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Clear search"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </form>

        {/* Navigation — FLOW-EMP_HOME-05 */}
        <nav aria-label="Employee navigation" className="px-2.5 py-1.5 space-y-2 overflow-y-auto flex-1 scrollbar-none">
          {navGroups.map((section) => (
            <div key={section.id} className="space-y-0.5">
              <div className="px-2.5 pt-0.5 pb-0.5 text-2xs font-bold uppercase tracking-wider text-gray-400 dark:text-[var(--muted-2)] select-none">
                {section.group}
              </div>
              <div className="space-y-0.5">
                {section.items.map(({ to, label, icon }) => {
                  const isActive = isActivePath(to)
                  return (
                    <button
                      key={to}
                      type="button"
                      onClick={() => navigate(to)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center w-full gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-orange-50 dark:bg-[var(--tint-brand-bg)] text-brand-orange shadow-2xs'
                          : 'text-slate-600 dark:text-[var(--muted)] hover:bg-slate-50 dark:hover:bg-[var(--surface-3)] hover:text-slate-900 dark:hover:text-[var(--ink)]'
                      }`}
                    >
                      <span className="shrink-0">{icon}</span>
                      <span className="truncate">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Clock In / Clock Out — directly above Logout, so the signed-in
            employee can always see whether they are scheduled to be in store
            right now and can request to time out ahead of their scheduled end
            (FLOW-EMP_SCHED-04, REQ-SS-02/03). */}
        <div className="shrink-0 px-2 pt-1.5 pb-1.5 border-t border-slate-100 dark:border-[var(--line)] space-y-1">
          <ClockInOut />
        </div>

        {/* Logout — last entry, pinned to the foot of the card so it is
            always reachable, with a confirmation (DOMAIN 16). */}
        <div className="shrink-0 px-2 pt-1.5 pb-1.5 border-t border-slate-100 dark:border-[var(--line)]">
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="flex items-center w-full gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-semibold text-rose-600 hover:bg-rose-50 transition-all duration-150 cursor-pointer"
          >
            <span className="shrink-0 flex justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            <span className="truncate">Logout</span>
          </button>
        </div>
      </div>

      {/* Logout confirmation dialog (DOMAIN 16) — one shared popup shell, so
          the admin logout reads exactly like every other dialog in the system. */}
      {confirmLogout && (
        <Modal
          isOpen={confirmLogout}
          onClose={() => setConfirmLogout(false)}
          title="Sign out?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmLogout(false)} className="px-3.5">
                Cancel
              </Button>
              <Button variant="danger" onClick={handleLogout} className="px-3.5">
                Sign out
              </Button>
            </>
          }
        >
          <p className="text-sm text-gray-600 font-medium leading-relaxed">
            Your staff session ends immediately and you will be redirected to the login page.
          </p>
        </Modal>
      )}
    </aside>
  )
}
