import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import StatCard from '../../components/admin/StatCard.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import { jsPDF } from 'jspdf'
// v5 exports the caller rather than patching the jsPDF prototype.
import autoTable from 'jspdf-autotable'
import { downloadXlsx } from '../../services/excelExport.js'

import {
  fetchDashboardSnapshot,
  mapOrderRows,
  filterOrdersByRange,
  summarizeSales,
  rangeBounds,
  parseDate,
  buildSalesTrend,
  buildTrendLabel,
  buildTopProducts,
  buildConversion,
  buildCategorySales,
  buildOrderTypeMix,
} from '../../services/dashboard.js'
import SalesOverview from '../../components/admin/SalesOverview.jsx'

// SRS refresh cadence for staff analytics (REQ-SD-02)
const REFRESH_MS = 30000

/** % change of *customer* orders (active buyers) vs the previous window. */
function customerTrend(rows, range, custom = null) {
  const { from, duration } = rangeBounds(range, custom)
  const current = new Set()
  const previous = new Set()

  rows.forEach((row) => {
    if (row.custId === null || row.custId === undefined) return
    const date = parseDate(row.createdAt)
    if (!date) return
    const time = date.getTime()
    if (time >= from && time < from + duration) current.add(row.custId)
    else if (time >= from - duration && time < from) previous.add(row.custId)
  })

  if (previous.size === 0) {
    return {
      label: current.size > 0 ? 'New buyers this period' : 'No buyers yet',
      positive: true,
    }
  }
  const pct = ((current.size - previous.size) / previous.size) * 100
  return {
    label: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs last period`,
    positive: pct >= 0,
  }
}

/** ISO yyyy-mm-dd for a day offset from today (date inputs read this shape). */
function isoDay(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)
}

/** FLOW-ANALYTICS-06: the presets the date filter must offer. */
const RANGE_PRESETS = [
  { value: 'Today', label: 'Today' },
  { value: 'Week', label: 'This Week' },
  { value: 'Month', label: 'This Month' },
  { value: 'Custom', label: 'Custom' },
]

export default function AdminAnalytics() {
  const navigate = useNavigate()
  const { orders: rawOrders = [], refreshOrders, products = [] } = useAdmin()
  const [timeRange, setTimeRange] = useState('Week') // 'Today' | 'Week' | 'Month' | 'Custom'
  const [customFrom, setCustomFrom] = useState(() => isoDay(-6))
  const [customTo, setCustomTo] = useState(() => isoDay(0))

  // FLOW-ANALYTICS-06 / REQ-ANALYTICS-06: one window object that every filter,
  // chart and export below reads, so the numbers a report carries always
  // describe the range shown on screen.
  const customWindow = useMemo(() => {
    if (timeRange !== 'Custom' || !customFrom || !customTo) return null
    const from = new Date(`${customFrom}T00:00:00`).getTime()
    const to = new Date(`${customTo}T23:59:59`).getTime() + 1
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null
    return { from, to, duration: to - from }
  }, [timeRange, customFrom, customTo])
  const [snapshot, setSnapshot] = useState(null)

  const syncData = useCallback(() => {
    refreshOrders()
    fetchDashboardSnapshot()
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

  const orders = useMemo(() => mapOrderRows(rawOrders), [rawOrders])
  const rangeOrders = useMemo(
    () => filterOrdersByRange(orders, timeRange, customWindow),
    [orders, timeRange, customWindow]
  )
  const sales = useMemo(() => summarizeSales(rangeOrders), [rangeOrders])
  const salesTrend = useMemo(
    () => buildTrendLabel(orders, timeRange, (row) => row.total, customWindow),
    [orders, timeRange, customWindow]
  )
  const ordersTrend = useMemo(
    () => buildTrendLabel(orders, timeRange, () => 1, customWindow),
    [orders, timeRange, customWindow]
  )
  const buyersTrend = useMemo(
    () => customerTrend(orders, timeRange, customWindow),
    [orders, timeRange, customWindow]
  )

  const activeCustomers = useMemo(() => {
    const ids = new Set(
      rangeOrders.map((row) => row.custId).filter((id) => id !== null && id !== undefined)
    )
    return ids.size
  }, [rangeOrders])


  // Chart data points (Online vs Walk-in POS per bucket)
  const trendData = useMemo(
    () => buildSalesTrend(rangeOrders, timeRange, customWindow),
    [rangeOrders, timeRange, customWindow]
  )
  // Sales Overview breakdowns: order-type mix and sales by category for the
  // same window the KPI cards describe.
  const orderMix = useMemo(() => buildOrderTypeMix(rangeOrders), [rangeOrders])
  const categorySales = useMemo(() => buildCategorySales(rangeOrders, Infinity), [rangeOrders])
  const bucketUnit =
    timeRange === 'Today'
      ? 'hour'
      : timeRange === 'Month' || (customWindow && customWindow.duration > 14 * 86400000)
        ? '5-day period'
        : 'day'

  const recentOrders = orders.slice(0, 4)
  const topProducts = useMemo(
    () => buildTopProducts(rangeOrders, products),
    [rangeOrders, products]
  )
  const conversion = useMemo(
    () => buildConversion({ orders, cartRows: snapshot?.cartRows || [], accounts: snapshot?.accounts || {} }),
    [orders, snapshot]
  )

  // FLOW-ANALYTICS-08 / REQ-ANALYTICS-06: the export carries the active date
  // range, every KPI on screen and all three breakdowns, so a downloaded file
  // always describes exactly what the dashboard is showing.
  const rangeLabel =
    timeRange === 'Custom' && customWindow
      ? `Custom: ${customFrom} to ${customTo}`
      : RANGE_PRESETS.find((preset) => preset.value === timeRange)?.label || timeRange

  const buildReport = () => ({
    meta: [
      ['Date range', rangeLabel],
      ['Generated', new Date().toLocaleString()],
      ['Total sales (PHP)', sales.gross.toFixed(2)],
      ['Total orders', String(sales.count)],
      ['Active customers', String(activeCustomers)],
    ],
    tables: [
      {
        title: 'Sales trend by order type',
        head: ['Date', 'Walk-in', 'Pre-order', 'Online', 'Total', 'Orders'],
        rows: trendData.map((p) => [p.date, p.walkin, p.preorder, p.online, p.total, p.orders]),
      },
      {
        title: 'Sales by order type',
        head: ['Order type', 'Orders', 'Revenue (PHP)', 'Share'],
        rows: [
          ['Online', orderMix.online],
          ['Walk-in', orderMix.walkin],
          ['Pre-order', orderMix.preorder],
        ].map(([label, entry]) => [
          label,
          entry.orders,
          entry.sales.toFixed(2),
          sales.gross > 0 ? `${((entry.sales / sales.gross) * 100).toFixed(1)}%` : '0%',
        ]),
      },
      {
        title: 'Sales by category',
        head: ['Category', 'Units sold', 'Revenue (PHP)'],
        rows: categorySales.map((c) => [c.category, c.units, c.sales.toFixed(2)]),
      },
      {
        title: 'Top products',
        head: ['Product', 'Category', 'Units sold', 'Revenue (PHP)'],
        rows: topProducts.map((p) => [p.name, p.category, p.sales, p.revenue]),
      },
      {
        title: 'Recent orders',
        head: ['Order', 'Customer', 'Total (PHP)', 'Status', 'Date'],
        rows: recentOrders.map((o) => [o.id, o.customer, (Number(o?.total) || 0).toFixed(2), o.status, o.date]),
      },
    ],
  })


  const exportFile = async (extension) => {
    const filename = `analytics-${timeRange.toLowerCase()}-${isoDay(0)}.${extension}`
    if (extension === 'xlsx') {
      const report = buildReport()
      try {
        await downloadXlsx(filename, {
          title: 'Analytics Report',
          subtitle: rangeLabel,
          sheetName: 'Analytics',
          summary: report.meta.filter(([label]) => label !== 'Generated'),
          sections: report.tables.map((table) => ({ title: table.title, columns: table.head, rows: table.rows })),
        })
      } catch (e) {
        console.error(e)
      }
      return
    }

    const report = buildReport()
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    doc.setFontSize(16)
    doc.text('Analytics Report', 40, 40)
    doc.setFontSize(10)
    report.meta.forEach(([label, value], index) => doc.text(`${label}: ${value}`, 40, 62 + index * 14))
    let y = 62 + report.meta.length * 14 + 20
    report.tables.forEach((table) => {
      if (y > doc.internal.pageSize.getHeight() - 80) {
        doc.addPage()
        y = 40
      }
      doc.setFontSize(12)
      doc.text(table.title, 40, y)
      const rendered = autoTable(doc, {
        startY: y + 6,
        head: [table.head],
        body: table.rows.map((row) => row.map((cell) => String(cell ?? ''))),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [255, 106, 0] },
      })
      y = (rendered?.finalY ?? doc.lastAutoTable?.finalY ?? y + 60) + 20
    })
    doc.save(filename)
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="page-title text-gray-900 dark:text-[var(--ink)]">
              Analytics Overview
            </h1>
            <p className="text-xs lg:text-sm font-medium text-gray-500 mt-1">
              Today's performance and recent activity.
            </p>
          </div>

          {/* Date range — FLOW-ANALYTICS-06 presets plus a custom window */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <div className="flex bg-white p-1 rounded-xl border border-gray-200/80 shadow-2xs">
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setTimeRange(preset.value)}
                  aria-pressed={timeRange === preset.value}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    timeRange === preset.value
                      ? 'bg-brand-orange text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {timeRange === 'Custom' && (
              <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-gray-200/80 shadow-2xs">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label="Custom range start"
                  className="text-xs font-bold text-gray-700 focus:outline-none"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label="Custom range end"
                  className="text-xs font-bold text-gray-700 focus:outline-none"
                />
              </div>
            )}

            {/* FLOW-ANALYTICS-08: export what is currently on screen */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => exportFile('xlsx')}
                className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-700 hover:text-brand-orange hover:border-brand-orange transition-all cursor-pointer"
              >
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => exportFile('pdf')}
                className="h-8 px-3 rounded-lg bg-brand-orange text-white text-xs font-bold hover:brightness-110 transition-all cursor-pointer"
              >
                Export PDF
              </button>
            </div>
          </div>
        </div>

        {/* 4 KPI Cards Matching Page 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="TOTAL SALES"
            value={`₱${sales.gross.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            trend={salesTrend.label}
            trendPositive={salesTrend.positive}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
          />
          <StatCard
            title="TOTAL ORDERS"
            value={sales.count.toLocaleString('en-US')}
            trend={ordersTrend.label}
            trendPositive={ordersTrend.positive}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            }
            iconBg="bg-blue-50 text-blue-600"
          />
          <StatCard
            title="ACTIVE CUSTOMERS"
            value={activeCustomers.toLocaleString('en-US')}
            trend={buyersTrend.label}
            trendPositive={buyersTrend.positive}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
            iconBg="bg-amber-50 text-amber-600"
          />
        </div>

        {/* 2-Column Main Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Left: Sales Overview (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            <SalesOverview
              trendData={trendData}
              orderMix={orderMix}
              categorySales={categorySales}
              rangeLabel={rangeLabel}
              bucketUnit={bucketUnit}
            />

            {/* Recent Orders Mini Table */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-gray-900">
                  Recent Orders
                </h2>
                <Link
                  to="/admin/orders"
                  className="text-xs font-bold text-brand-orange hover:underline flex items-center gap-1"
                >
                  View All <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-2xs font-extrabold uppercase tracking-wider text-gray-400">
                      <th className="pb-3">Order ID</th>
                      <th className="pb-3">Customer</th>
                      <th className="pb-3">Amount</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs font-medium">
                    {recentOrders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-gray-400 font-semibold">
                          No orders yet.
                        </td>
                      </tr>
                    )}
                    {recentOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50/50">
                        <td className="py-3 font-bold text-gray-900">{o.id}</td>
                        <td className="py-3 text-gray-700 font-semibold">{o.customer}</td>
                        <td className="py-3 font-bold text-gray-900">₱{(Number(o?.total) || 0).toFixed(2)}</td>
                        <td className="py-3">
                          <StatusPill status={o.status} />
                        </td>
                        <td className="py-3 text-right text-gray-400 text-2xs">{o.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Top Products Leaderboard */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-gray-900">
                  Top Products
                </h2>
                <button
                  type="button"
                  onClick={() => navigate('/admin/inventory')}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3.5">
                {topProducts.length === 0 && (
                  <p className="text-xs text-gray-400 py-3 text-center">
                    No sales in this period yet.
                  </p>
                )}
                {topProducts.map((prod, rank) => {
                  const resolvedImg = getImageUrl(prod.image)
                  return (
                    <div
                      key={prod.name}
                      onClick={() => navigate('/admin/inventory')}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-black text-gray-400 w-4 text-center">
                          #{rank + 1}
                        </span>
                        <img
                          src={resolvedImg}
                          alt={prod.name}
                          className="w-10 h-10 rounded-xl bg-gray-50 object-contain p-1 border border-gray-100 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {prod.name}
                          </p>
                          <p className="text-2xs text-gray-400 font-semibold">
                            {prod.category}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-gray-900">{prod.sales}</p>
                        <p className="text-2xs text-gray-400 uppercase font-semibold">units</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="pt-2 border-t border-gray-100 text-center">
                <Link
                  to="/admin/inventory"
                  className="text-xs font-bold text-brand-orange hover:underline"
                >
                  View Full Inventory Report <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>
            </div>

            {/* Conversion Metrics Widget */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-3">
              <h2 className="text-base font-black text-gray-900">
                Conversion Funnel
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Store Visitors</span>
                  <span className="font-bold text-gray-900">{conversion.visitors.toLocaleString('en-US')}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Added to Cart</span>
                  <span className="font-bold text-gray-900">{conversion.addedToCart.toLocaleString('en-US')}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Completed Checkouts</span>
                  <span className="font-bold text-emerald-600">{conversion.checkouts.toLocaleString('en-US')}</span>
                </div>
                <div className="pt-2 border-t border-gray-100 flex justify-between font-black text-gray-900">
                  <span>Conversion Rate</span>
                  <span className="text-brand-orange">{conversion.conversionRate}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
