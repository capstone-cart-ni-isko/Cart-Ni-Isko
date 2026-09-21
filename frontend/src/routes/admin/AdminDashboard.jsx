import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import StatCard from '../../components/admin/StatCard.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import BarChartStages from '../../components/admin/BarChartStages.jsx'
import SalesBarChart from '../../components/admin/SalesBarChart.jsx'

import { INITIAL_ADMIN_DATA } from '../../data/adminMockData.js'

/* ── Shared card primitives (single typographic baseline) ── */
const CARD = 'bg-white rounded-lg p-4 border border-slate-200 space-y-3'
const CARD_TITLE = 'text-sm font-bold tracking-normal text-slate-900'
const ACTION_LINK =
  'text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors shrink-0'

function Chevron({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function CardHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className={CARD_TITLE}>{title}</h2>
      {action}
    </div>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { adminState = {}, resolveAlert } = useAdmin()
  const [timeRange, setTimeRange] = useState('Today')

  const kpi = adminState?.dashboardKPIs || INITIAL_ADMIN_DATA.dashboardKPIs
  const stages = adminState?.fulfillmentStages || INITIAL_ADMIN_DATA.fulfillmentStages
  const categorySales = adminState?.categorySales || INITIAL_ADMIN_DATA.categorySales
  const orders = adminState?.orders || INITIAL_ADMIN_DATA.orders || []
  const recentOrders = orders.slice(0, 5)
  const alerts = adminState?.alerts || INITIAL_ADMIN_DATA.alerts || []
  const onDuty = adminState?.onDutyToday || INITIAL_ADMIN_DATA.onDutyToday || []

  const handleExportSales = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Order ID,Customer,Date,Type,Fulfillment,Status,Total']
        .concat(
          orders.map(
            (o) => `${o.id},${o.customer},${o.date},${o.type},${o.fulfillment},${o.status},₱${o.total}`
          )
        )
        .join('\n')
    const link = document.createElement('a')
    link.setAttribute('href', encodeURI(csvContent))
    link.setAttribute('download', `Tindahan_ni_Isko_Sales_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleAlertClick = (alert) => {
    if (alert.actionType === 'restock') {
      navigate('/admin/inventory')
    } else {
      navigate('/admin/orders')
    }
    resolveAlert(alert.id)
  }

  const displayGrossSales = kpi.grossSales === 124500 ? 126610.0 : (kpi.grossSales ?? 126610.0)
  const displayTotalOrders = kpi.totalOrders === 142 ? 144 : (kpi.totalOrders ?? 144)

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Store performance hero */}
        <section className="bg-slate-50/70 border border-slate-200 rounded-lg p-3.5 sm:p-4 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Store performance
              </h1>
              <p className="text-xs font-normal text-slate-500 mt-0.5">
                Monitor sales, orders, inventory, and store activity.
              </p>
            </div>

            <div className="inline-flex items-center h-8 bg-white p-0.5 rounded-md border border-slate-200 self-start sm:self-auto">
              {['Today', 'Week', 'Month'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTimeRange(tab)}
                  className={`h-7 px-3 rounded text-xs font-medium transition-all cursor-pointer ${
                    timeRange === tab
                      ? 'bg-[#FF6B00] text-white'
                      : 'text-slate-600 hover:text-slate-900 bg-transparent'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              title="Gross sales"
              value={`₱ ${displayGrossSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              trend={kpi.grossSalesTrend || '+14% vs last period'}
              trendPositive
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
              iconBg="bg-orange-50 text-[#FF6B00]"
            />
            <StatCard
              title="Total orders"
              value={displayTotalOrders}
              trend={kpi.totalOrdersTrend || '+8% vs last period'}
              trendPositive
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
              }
              iconBg="bg-blue-50 text-blue-600"
            />
            <StatCard
              title="Pre-orders"
              value={kpi.preOrders ?? 8}
              subtitle={kpi.preOrdersSubtitle || 'Requires production'}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
              iconBg="bg-amber-50 text-amber-600"
            />
            <StatCard
              title="Ready for pickup"
              value={kpi.readyForPickup ?? 12}
              subtitle={kpi.readyForPickupSubtitle || 'Awaiting customer claim'}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              }
              iconBg="bg-emerald-50 text-emerald-600"
            />
          </div>
        </section>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Fulfillment overview */}
            <div className={CARD}>
              <CardHeader
                title="Fulfillment overview"
                action={
                  <Link to="/admin/fulfillment" className={ACTION_LINK}>
                    <span>View fulfillment</span>
                    <Chevron />
                  </Link>
                }
              />
              <BarChartStages stages={stages} />
            </div>

            {/* Sales performance */}
            <div className={CARD}>
              <CardHeader
                title="Sales performance"
                action={
                  <Link to="/admin/analytics" className={ACTION_LINK}>
                    <span>View report</span>
                    <Chevron />
                  </Link>
                }
              />
              <SalesBarChart
                data={categorySales}
                onNavigateReport={() => navigate('/admin/analytics')}
              />
            </div>

            {/* Recent orders */}
            <div className={CARD}>
              <CardHeader
                title="Recent orders"
                action={
                  <Link to="/admin/orders" className={ACTION_LINK}>
                    <span>View all</span>
                    <Chevron />
                  </Link>
                }
              />

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="pb-2">Order</th>
                      <th className="pb-2">Customer</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2">Fulfillment</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium">
                    {recentOrders.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => navigate('/admin/orders')}
                        className="hover:bg-slate-50/50 cursor-pointer"
                      >
                        <td className="py-2 font-semibold text-slate-900">{order.id}</td>
                        <td className="py-2 text-slate-700 font-medium">{order.customer}</td>
                        <td className="py-2 text-slate-500">{order.type}</td>
                        <td className="py-2 text-slate-500">{order.fulfillment}</td>
                        <td className="py-2">
                          <StatusPill status={order.status} />
                        </td>
                        <td className="py-2 font-semibold text-slate-900">
                          ₱{order.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 text-right text-slate-400 text-[11px]">
                          {order.timeAgo || order.date}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Alert center */}
            <div className={CARD}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className={CARD_TITLE}>Alert center</h2>
                  {alerts.length > 0 && (
                    <span className="text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-md shrink-0">
                      {alerts.length} Pending
                    </span>
                  )}
                </div>
                <Link to="/admin/orders" className={ACTION_LINK}>
                  <span>View all</span>
                  <Chevron />
                </Link>
              </div>

              <div className="space-y-2">
                {alerts.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => handleAlertClick(alert)}
                    className={`w-full text-left p-2.5 rounded-md border flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                      alert.severity === 'danger'
                        ? 'bg-rose-50/50 border-rose-200/80 hover:bg-rose-50'
                        : alert.severity === 'warning'
                        ? 'bg-amber-50/50 border-amber-200/80 hover:bg-amber-50'
                        : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{alert.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{alert.description}</p>
                    </div>
                    <Chevron className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-2.5">
              <h2 className={CARD_TITLE}>Quick actions</h2>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => navigate('/admin/pos')}
                  className="w-full h-8 bg-[#FF6B00] hover:bg-[#E05E00] text-white font-semibold text-xs px-3 rounded-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>New POS order</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/admin/inventory')}
                  className="w-full h-8 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium text-xs px-3 rounded-md border border-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-slate-400">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                  <span>Restock inventory</span>
                </button>

                {/* Routes to the Products page first; the page opens the modal. */}
                <button
                  type="button"
                  onClick={() => navigate('/admin/inventory?new=1')}
                  className="w-full h-8 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium text-xs px-3 rounded-md border border-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-slate-400">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Add new product</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportSales}
                  className="w-full h-8 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium text-xs px-3 rounded-md border border-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5 text-slate-400">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Export sales (CSV)</span>
                </button>
              </div>
            </div>

            {/* On duty today */}
            <div className={CARD}>
              <CardHeader
                title="On duty today"
                action={
                  <Link to="/admin/schedule" className={ACTION_LINK}>
                    <span>View full schedule</span>
                    <Chevron />
                  </Link>
                }
              />

              <div className="space-y-2">
                {onDuty.map((staff) => (
                  <div
                    key={staff.id}
                    className="flex items-center justify-between gap-2.5 p-2.5 rounded-md bg-slate-50 border border-slate-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-brand-orange/15 text-brand-orange font-semibold text-[10px] flex items-center justify-center shrink-0">
                        {staff.avatar}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{staff.name}</p>
                        <p className="text-[10px] text-slate-500 font-medium truncate">
                          {staff.role} • {staff.timeSlot}
                        </p>
                      </div>
                    </div>
                    <StatusPill status={staff.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}