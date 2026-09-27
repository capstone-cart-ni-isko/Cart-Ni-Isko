import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import SalesBarChart from '../../components/admin/SalesBarChart.jsx'
import DashCard from '../../components/admin/dashboard/DashCard.jsx'
import KpiCard from '../../components/admin/dashboard/KpiCard.jsx'
import FulfillmentBars from '../../components/admin/dashboard/FulfillmentBars.jsx'
import RecentOrdersTable from '../../components/admin/dashboard/RecentOrdersTable.jsx'
import QuickActions from '../../components/admin/dashboard/QuickActions.jsx'
import OnDutyWidget from '../../components/admin/dashboard/OnDutyWidget.jsx'
import PosDrawer from '../../components/admin/dashboard/PosDrawer.jsx'
import RestockDrawer from '../../components/admin/dashboard/RestockDrawer.jsx'
import AddProductDrawer from '../../components/admin/dashboard/AddProductDrawer.jsx'
import ExportSalesDrawer from '../../components/admin/dashboard/ExportSalesDrawer.jsx'
import StaffScheduleDrawer from '../../components/admin/dashboard/StaffScheduleDrawer.jsx'
import { updateAccount } from '../../services/accounts.js'
import {
  fetchDashboardSnapshot,
  mapOrderRows,
  filterOrdersByRange,
  summarizeSales,
  countByStatus,
  buildTrendLabel,
  buildBookingSummary,
  buildCategorySales,
  buildFulfillmentStages,
  buildDutyRoster,
} from '../../services/dashboard.js'

// SRS refresh cadence for the staff dashboard (REQ-SD-02)
const REFRESH_MS = 30000
const RANGES = ['Today', 'Week', 'Month']
const RANGE_META = { Today: 'Today', Week: 'Last 7 days', Month: 'Last 30 days' }
const OPEN_STATUSES = ['CLAIMED', 'CANCELLED', 'RETURNED', 'UNCLAIMED', 'REFUNDED']

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function Icon({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      {children}
    </svg>
  )
}

function secondsAgo(timestamp, now) {
  if (!timestamp) return 'Loading live data…'
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  return seconds < 5 ? 'Updated just now' : seconds < 60 ? `Updated ${seconds}s ago` : `Updated ${Math.round(seconds / 60)}m ago`
}

/* Occupancy meter for the bookings panel; an empty slot pool shows an empty bar. */
function BookingMeter({ row }) {
  const pct = row.capacity > 0 ? Math.min(100, (row.occupied / row.capacity) * 100) : 0
  const full = row.capacity > 0 && row.occupied >= row.capacity
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-slate-700">{row.label}</span>
        <span className="tabular-nums text-slate-900 font-semibold">
          {row.occupied}
          <span className="text-slate-400 font-normal">{row.capacity > 0 ? `/${row.capacity}` : ' · no slots open'}</span>
        </span>
      </div>
      <div className="h-2 rounded bg-slate-100 overflow-hidden">
        {pct > 0 && <div className={`h-full rounded ${full ? 'bg-orange-500' : 'bg-slate-500'}`} style={{ width: `${pct}%` }} />}
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { showToast } = useToast()
  const { orders: rawOrders = [], refreshOrders, currentAdminUser, isSuperAdmin } = useAdmin()
  const [timeRange, setTimeRange] = useState('Today')
  const [snapshot, setSnapshot] = useState(null)
  const [orderFilter, setOrderFilter] = useState(null) // { key, label, match }
  const [drawer, setDrawer] = useState(null) // 'pos' | 'restock' | 'product' | 'export' | 'schedule'
  const [clockOverrides, setClockOverrides] = useState({}) // empId -> bool while a change is in flight
  const [now, setNow] = useState(() => Date.now())

  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(currentAdminUser?.roleKey)

  // Live data: the shared order list (AdminContext) plus the aggregation
  // snapshot, both re-polled every 30s (REQ-SD-02) and after every action.
  const syncData = useCallback(() => {
    refreshOrders()
    return fetchDashboardSnapshot()
      .then((next) => setSnapshot(next))
      .catch(() => {
        // Transient API failure: keep the last snapshot on screen.
      })
  }, [refreshOrders])

  useEffect(() => {
    syncData()
    const timer = setInterval(syncData, REFRESH_MS)
    return () => clearInterval(timer)
  }, [syncData])

  // Keeps the "Updated Xs ago" label honest between polls
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])

  // ── Derived data: every panel follows the selected range ──
  const orders = useMemo(() => mapOrderRows(rawOrders), [rawOrders])
  const rangeOrders = useMemo(() => filterOrdersByRange(orders, timeRange), [orders, timeRange])
  const sales = useMemo(() => summarizeSales(rangeOrders), [rangeOrders])
  const salesTrend = useMemo(() => buildTrendLabel(orders, timeRange), [orders, timeRange])
  const ordersTrend = useMemo(() => buildTrendLabel(orders, timeRange, () => 1), [orders, timeRange])
  const stages = useMemo(() => buildFulfillmentStages(rangeOrders), [rangeOrders])
  const bookings = useMemo(
    () => buildBookingSummary(snapshot?.appointments || [], timeRange, snapshot?.slots || []),
    [snapshot, timeRange]
  )
  const categorySales = useMemo(() => buildCategorySales(rangeOrders), [rangeOrders])
  const roster = useMemo(() => {
    const base = buildDutyRoster(snapshot?.accounts || {}, snapshot?.shifts || [])
    return base.map((staff) =>
      staff.empId in clockOverrides ? { ...staff, clockedIn: clockOverrides[staff.empId] } : staff
    )
  }, [snapshot, clockOverrides])

  const preOrderRows = rangeOrders.filter((o) => o.preorder && !OPEN_STATUSES.includes(o.rawStatus))
  const readyForPickup = countByStatus(rangeOrders, 'TO CLAIM')
  const onShiftCount = roster.filter((s) => s.onShiftNow).length
  const clockedInCount = roster.filter((s) => s.clockedIn).length

  const recentOrders = useMemo(
    () => (orderFilter ? rangeOrders.filter(orderFilter.match) : rangeOrders).slice(0, 25),
    [rangeOrders, orderFilter]
  )

  // ── Filters: clicking the active KPI / bar again clears it ──
  const toggleFilter = (filter) => setOrderFilter((current) => (current?.key === filter.key ? null : filter))
  const stageFilter = (stage) =>
    toggleFilter({ key: stage.key, label: stage.label, match: (o) => stage.statuses.includes(o.rawStatus) })
  const pickupFilter = () => {
    const stage = stages.find((s) => s.key === 'to_claim')
    if (stage) stageFilter(stage)
  }
  const preorderFilter = () =>
    toggleFilter({ key: 'preorder', label: 'Open pre-orders', match: (o) => o.preorder && !OPEN_STATUSES.includes(o.rawStatus) })

  // ── Clock in / out (PUT /accounts/update emp_instore), optimistic ──
  const handleToggleClock = async (empId, next) => {
    setClockOverrides((prev) => ({ ...prev, [empId]: next }))
    try {
      await updateAccount('employee', empId, { emp_instore: next })
      showToast(next ? 'Clocked in.' : 'Clocked out.', 'success')
      await syncData()
    } catch (err) {
      showToast(err?.message || 'Could not update clock status.', 'error')
    } finally {
      setClockOverrides((prev) => {
        const copy = { ...prev }
        delete copy[empId]
        return copy
      })
    }
  }

  const closeDrawer = () => setDrawer(null)

  return (
    <AdminLayout>
      <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
        {/* ── Header: title, freshness, range ── */}
        <header className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">Store performance</h1>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              {secondsAgo(snapshot?.fetchedAt, now)} · auto-refreshes every 30s
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => syncData()}
              className="h-8 w-8 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 flex items-center justify-center cursor-pointer"
              aria-label="Refresh now"
              title="Refresh now"
            >
              <Icon>
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </Icon>
            </button>
            <div className="inline-flex h-8 p-0.5 bg-slate-100 rounded-md" role="radiogroup" aria-label="Time range">
              {RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  role="radio"
                  aria-checked={timeRange === range}
                  onClick={() => setTimeRange(range)}
                  className={`h-7 px-3 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    timeRange === range ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ── KPI row (F-pattern: first thing scanned) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          <KpiCard
            label="Gross sales"
            value={peso(sales.gross)}
            subtext={salesTrend.label}
            tone={salesTrend.tone}
            onClick={() => setDrawer('export')}
            hint="Export these sales"
            icon={<Icon><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></Icon>}
          />
          <KpiCard
            label="Total orders"
            value={sales.count.toLocaleString('en-US')}
            subtext={ordersTrend.label}
            tone={ordersTrend.tone}
            onClick={() => setOrderFilter(null)}
            hint="Show all orders in this range"
            icon={<Icon><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /></Icon>}
          />
          <KpiCard
            label="Pre-orders"
            value={preOrderRows.length}
            subtext={preOrderRows.length > 0 ? 'Awaiting production' : 'None open'}
            tone="neutral"
            onClick={preorderFilter}
            active={orderFilter?.key === 'preorder'}
            hint="Filter recent orders to open pre-orders"
            icon={<Icon><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Icon>}
          />
          <KpiCard
            label="Ready for pickup"
            value={readyForPickup}
            subtext={readyForPickup > 0 ? 'Awaiting customer claim' : 'Nothing waiting'}
            tone="neutral"
            onClick={pickupFilter}
            active={orderFilter?.key === 'to_claim'}
            hint="Filter recent orders to ready for pickup"
            icon={<Icon><polyline points="20 6 9 17 4 12" /></Icon>}
          />
        </div>

        {/* ── Body: one grid with the same row proportions at every desktop size ──
            Left: pipeline + sales on top, recent orders below.
            Right: actions, bookings and the duty roster in one column. */}
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 lg:flex-1 lg:min-h-0">
          <DashCard
            title="Fulfillment"
            meta={`${rangeOrders.length} orders`}
            actionLabel="Pickup"
            actionTo="/admin/pickup"
            className="lg:col-span-4"
          >
            <FulfillmentBars stages={stages} activeKey={orderFilter?.key} onSelect={stageFilter} />
          </DashCard>

          <DashCard
            title="Sales by category"
            meta={RANGE_META[timeRange]}
            actionLabel="Analytics"
            actionTo="/admin/analytics"
            className="lg:col-span-5 min-h-[16rem] lg:min-h-0"
          >
            <SalesBarChart data={categorySales} />
          </DashCard>

          <div className="lg:col-span-3 lg:row-span-2 flex flex-col gap-3 lg:min-h-0">
            <DashCard title="Quick actions" className="shrink-0">
              <QuickActions isAdmin={isAdmin} onOpen={setDrawer} />
            </DashCard>
            <DashCard
              title="Bookings"
              meta={`${bookings.total} in range`}
              actionLabel="Schedule"
              actionTo="/admin/schedule"
              className="shrink-0"
              bodyClassName="space-y-2.5"
            >
              {bookings.rows.map((row) => (
                <BookingMeter key={row.type} row={row} />
              ))}
            </DashCard>
            <DashCard
              title="On duty"
              meta={`${clockedInCount} in store · ${onShiftCount}/${roster.length} on shift`}
              actionLabel="Schedule"
              onAction={() => setDrawer('schedule')}
              className="flex-1 min-h-[14rem] lg:min-h-0"
            >
              <OnDutyWidget
                roster={roster}
                currentEmpId={currentAdminUser?.id}
                canManageAll={isSuperAdmin}
                pendingIds={Object.keys(clockOverrides).map(Number)}
                onToggleClock={handleToggleClock}
              />
            </DashCard>
          </div>

          <DashCard
            title="Recent orders"
            meta={
              orderFilter ? (
                <span className="inline-flex items-center gap-1 h-5 pl-2 pr-1 rounded-full bg-slate-900 text-white text-[11px] font-medium">
                  {orderFilter.label}
                  <button
                    type="button"
                    onClick={() => setOrderFilter(null)}
                    aria-label="Clear filter"
                    className="w-4 h-4 rounded-full hover:bg-white/20 flex items-center justify-center cursor-pointer"
                  >
                    ✕
                  </button>
                </span>
              ) : (
                `${Math.min(rangeOrders.length, 25)} of ${rangeOrders.length}`
              )
            }
            actionLabel="All orders"
            actionTo="/admin/orders"
            className="lg:col-span-9 min-h-[18rem] lg:min-h-0"
          >
            <RecentOrdersTable
              orders={recentOrders}
              emptyText={orderFilter ? `No ${orderFilter.label.toLowerCase()} orders in this range.` : 'No orders in this range yet.'}
            />
          </DashCard>
        </div>
      </div>

      {/* ── In-page workflows ── */}
      <PosDrawer isOpen={drawer === 'pos'} onClose={closeDrawer} onCompleted={syncData} />
      <RestockDrawer isOpen={drawer === 'restock'} onClose={closeDrawer} onCompleted={syncData} />
      <AddProductDrawer isOpen={drawer === 'product'} onClose={closeDrawer} onCompleted={syncData} />
      <ExportSalesDrawer isOpen={drawer === 'export'} onClose={closeDrawer} orders={orders} initialRange={timeRange} />
      <StaffScheduleDrawer isOpen={drawer === 'schedule'} onClose={closeDrawer} />
    </AdminLayout>
  )
}
