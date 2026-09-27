import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import StatCard from '../../components/admin/StatCard.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import Panel from '../../components/admin/kit/Panel.jsx'
import AdminPageHeader from '../../components/admin/kit/AdminPageHeader.jsx'
import Segmented from '../../components/admin/kit/Segmented.jsx'
import { SCROLL_FADE, PAGE_ROOT } from '../../components/admin/kit/ui.js'
import { getImageUrl } from '../../utils/imageUtils.js'

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
} from '../../services/dashboard.js'

// SRS refresh cadence for staff analytics (REQ-SD-02)
const REFRESH_MS = 30000
const RANGE_META = { Today: 'Today', Week: 'Last 7 days', Month: 'Last 30 days' }

/** % change of *customer* orders (active buyers) vs the previous window. */
function customerTrend(rows, range) {
  const { from, duration } = rangeBounds(range)
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

export default function AdminAnalytics() {
  const navigate = useNavigate()
  const { orders: rawOrders = [], refreshOrders, products = [] } = useAdmin()
  const [timeRange, setTimeRange] = useState('Week') // 'Today' | 'Week' | 'Month'
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
  const rangeOrders = useMemo(() => filterOrdersByRange(orders, timeRange), [orders, timeRange])
  const sales = useMemo(() => summarizeSales(rangeOrders), [rangeOrders])
  const baseline = useMemo(
    () => summarizeSales(filterOrdersByRange(orders, 'Month')).avg,
    [orders]
  )
  const salesTrend = useMemo(() => buildTrendLabel(orders, timeRange), [orders, timeRange])
  const ordersTrend = useMemo(() => buildTrendLabel(orders, timeRange, () => 1), [orders, timeRange])
  const buyersTrend = useMemo(() => customerTrend(orders, timeRange), [orders, timeRange])

  const activeCustomers = useMemo(() => {
    const ids = new Set(
      rangeOrders.map((row) => row.custId).filter((id) => id !== null && id !== undefined)
    )
    return ids.size
  }, [rangeOrders])

  const avgOrderValue = sales.avg
  const avgProgress = baseline > 0 ? Math.min(100, Math.round((avgOrderValue / baseline) * 100)) : 0

  // Chart data points (Online vs Walk-in POS per bucket)
  const trendData = useMemo(() => buildSalesTrend(rangeOrders, timeRange), [rangeOrders, timeRange])
  const maxSales = Math.max(...trendData.map((d) => d.total || 0), 1)
  const peakPoint = useMemo(
    () => trendData.reduce((best, point) => (point.total > (best?.total || 0) ? point : best), null),
    [trendData]
  )

  const recentOrders = orders.slice(0, 4)
  const topProducts = useMemo(
    () => buildTopProducts(rangeOrders, products),
    [rangeOrders, products]
  )
  const conversion = useMemo(
    () => buildConversion({ orders, cartRows: snapshot?.cartRows || [], accounts: snapshot?.accounts || {} }),
    [orders, snapshot]
  )

  const peso = (n) => `₱${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <AdminLayout>
      <div className={PAGE_ROOT}>
        <AdminPageHeader title="Analytics Overview" subtitle={`${RANGE_META[timeRange]} · sales, orders and customer activity`}>
          <Segmented label="Time range" options={['Today', 'Week', 'Month']} value={timeRange} onChange={setTimeRange} />
        </AdminPageHeader>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          <StatCard
            title="Total sales"
            value={peso(sales.gross)}
            trend={salesTrend.label}
            trendPositive={salesTrend.positive}
            accent="orange"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
          />
          <StatCard
            title="Total orders"
            value={sales.count.toLocaleString('en-US')}
            trend={ordersTrend.label}
            trendPositive={ordersTrend.positive}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            }
          />
          <StatCard
            title="Active customers"
            value={activeCustomers.toLocaleString('en-US')}
            trend={buyersTrend.label}
            trendPositive={buyersTrend.positive}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
          />
          <StatCard
            title="Avg. order value"
            value={peso(avgOrderValue)}
            progressBar={avgProgress}
            subtitle={baseline > 0 ? `${avgProgress}% of the 30-day average` : 'No 30-day baseline yet'}
            accent="orange"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            }
          />
        </div>

        {/* Body: two rows of panels that fill the screen */}
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3 lg:flex-1 lg:min-h-0">
          <Panel
            title="Sales overview"
            meta="Online vs in-store POS"
            className="lg:col-span-8 min-h-[18rem] lg:min-h-0"
            actions={
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-isko-orange" /> Online
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-isko-blue" /> POS walk-in
                </span>
              </div>
            }
          >
            <div className="h-full flex flex-col">
              {trendData.length === 0 || maxSales <= 1 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-200 text-center">
                  <p className="text-xs font-medium text-slate-600">No sales in this period</p>
                  <p className="text-[11px] text-slate-400">Daily totals appear here as orders come in.</p>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-0 flex items-end justify-between gap-3 px-2 border-b border-slate-200">
                    {trendData.map((point) => {
                      const onlineH = (point.online / maxSales) * 100
                      const posH = (point.pos / maxSales) * 100
                      return (
                        <div key={point.date} className="relative flex-1 h-full flex flex-col items-center justify-end group">
                          <div className="absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] p-2 rounded-md pointer-events-none whitespace-nowrap shadow-lg z-20 space-y-0.5">
                            <p className="font-semibold text-isko-orange">{point.date}</p>
                            <p>Online: ₱{point.online.toLocaleString()}</p>
                            <p>POS: ₱{point.pos.toLocaleString()}</p>
                            <p className="font-semibold border-t border-slate-700 pt-0.5">Total: ₱{point.total.toLocaleString()}</p>
                          </div>
                          <div className="w-full max-w-[40px] h-full flex flex-col justify-end">
                            <div className="w-full bg-isko-orange rounded-t transition-all duration-500" style={{ height: `${onlineH}%` }} />
                            <div className="w-full bg-isko-blue transition-all duration-500" style={{ height: `${posH}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-between gap-3 px-2 pt-1.5 shrink-0">
                    {trendData.map((point) => (
                      <span key={point.date} className="flex-1 text-center text-[11px] font-medium text-slate-500 truncate">
                        {point.date}
                      </span>
                    ))}
                  </div>
                  <p className="pt-1 text-[11px] text-slate-400 shrink-0">
                    {peakPoint ? `Peak: ${peakPoint.date} (${peso(peakPoint.total)})` : ''}
                  </p>
                </>
              )}
            </div>
          </Panel>

          <Panel
            title="Top products"
            meta={RANGE_META[timeRange]}
            actionLabel="Inventory"
            actionTo="/admin/inventory"
            className="lg:col-span-4 min-h-[16rem] lg:min-h-0"
          >
            <div className={`h-full ${SCROLL_FADE} space-y-1`}>
              {topProducts.length === 0 && (
                <p className="h-full flex items-center justify-center text-xs text-slate-400 text-center">No sales in this period yet.</p>
              )}
              {topProducts.map((prod, rank) => (
                <button
                  key={prod.name}
                  type="button"
                  onClick={() => navigate('/admin/inventory')}
                  className="w-full flex items-center justify-between gap-3 p-2 rounded-md hover:bg-isko-blue/5 transition-colors cursor-pointer text-left"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-bold w-6 text-center ${rank === 0 ? 'text-isko-orange' : 'text-slate-400'}`}>#{rank + 1}</span>
                    <img
                      src={getImageUrl(prod.image)}
                      alt=""
                      className="w-9 h-9 rounded-md bg-slate-50 object-contain p-1 border border-slate-200 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-900 truncate">{prod.name}</span>
                      <span className="block text-[11px] text-slate-500">{prod.category}</span>
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-sm font-bold text-slate-900 tabular-nums">{prod.sales}</span>
                    <span className="block text-[10px] text-slate-400 uppercase">units</span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Recent orders" actionLabel="All orders" actionTo="/admin/orders" className="lg:col-span-8 min-h-[14rem] lg:min-h-0">
            <div className={`h-full ${SCROLL_FADE}`}>
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-1.5 pr-2">Order</th>
                    <th className="py-1.5 pr-2">Customer</th>
                    <th className="py-1.5 pr-2 text-right">Amount</th>
                    <th className="py-1.5 pr-2">Status</th>
                    <th className="py-1.5 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {recentOrders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">No orders yet.</td>
                    </tr>
                  )}
                  {recentOrders.map((o) => (
                    <tr key={o.id} className="h-9 hover:bg-isko-blue/5">
                      <td className="pr-2 font-semibold text-slate-900 whitespace-nowrap">{o.id}</td>
                      <td className="pr-2 text-slate-700 truncate max-w-[10rem]">{o.customer}</td>
                      <td className="pr-2 text-right font-semibold text-slate-900 tabular-nums">{peso(o.total)}</td>
                      <td className="pr-2">
                        <StatusPill status={o.status} />
                      </td>
                      <td className="text-right text-slate-400 text-[11px] whitespace-nowrap">{o.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Conversion funnel" meta="All time" className="lg:col-span-4 min-h-[12rem] lg:min-h-0">
            <div className="h-full flex flex-col justify-center gap-2 text-xs">
              {[
                ['Store visitors', conversion.visitors, 'bg-slate-300'],
                ['Added to cart', conversion.addedToCart, 'bg-isko-blue/50'],
                ['Completed checkouts', conversion.checkouts, 'bg-isko-blue'],
              ].map(([label, value, fill]) => {
                const pct = conversion.visitors > 0 ? Math.min(100, (value / conversion.visitors) * 100) : 0
                return (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-slate-600">
                      <span>{label}</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{Number(value || 0).toLocaleString('en-US')}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      {pct > 0 && <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />}
                    </div>
                  </div>
                )
              })}
              <div className="pt-2 mt-1 border-t border-slate-100 flex justify-between font-semibold text-slate-900">
                <span>Conversion rate</span>
                <span className="text-isko-orange">{conversion.conversionRate}</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </AdminLayout>
  )
}
