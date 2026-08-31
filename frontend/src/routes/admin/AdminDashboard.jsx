import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import StatCard from '../../components/admin/StatCard.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import BarChartStages from '../../components/admin/BarChartStages.jsx'
import SalesBarChart from '../../components/admin/SalesBarChart.jsx'

import { INITIAL_ADMIN_DATA } from '../../data/adminMockData.js'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { adminState = {}, resolveAlert, addProduct } = useAdmin()
  const [timeRange, setTimeRange] = useState('Today')
  const [showAddProductModal, setShowAddProductModal] = useState(false)
  const [newProdName, setNewProdName] = useState('')
  const [newProdCategory, setNewProdCategory] = useState('Hoodies')
  const [newProdPrice, setNewProdPrice] = useState('')
  const [newProdStock, setNewProdStock] = useState('')

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
          adminState.orders.map(
            (o) =>
              `${o.id},${o.customer},${o.date},${o.type},${o.fulfillment},${o.status},₱${o.total}`
          )
        )
        .join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Tindahan_ni_Isko_Sales_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleAddProductSubmit = (e) => {
    e.preventDefault()
    if (!newProdName || !newProdPrice) return
    addProduct({
      name: newProdName,
      category: newProdCategory,
      price: parseFloat(newProdPrice) || 0,
      stock: parseInt(newProdStock, 10) || 10,
    })
    setShowAddProductModal(false)
    setNewProdName('')
    setNewProdPrice('')
    setNewProdStock('')
    navigate('/admin/inventory')
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
              Store Performance
            </h1>
            <p className="text-xs lg:text-sm font-medium text-gray-500 mt-1">
              Monitor sales, orders, inventory, and store activity.
            </p>
          </div>

          {/* Date Filter Pills */}
          <div className="flex bg-white p-1 rounded-xl border border-gray-200/70 shadow-2xs self-start sm:self-auto">
            {['Today', 'Week', 'Month'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTimeRange(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  timeRange === tab
                    ? 'bg-brand-orange text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* 4 KPI Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="GROSS SALES"
            value={`₱ ${kpi.grossSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            trend={kpi.grossSalesTrend}
            trendPositive={true}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
          />
          <StatCard
            title="TOTAL ORDERS"
            value={kpi.totalOrders}
            trend={kpi.totalOrdersTrend}
            trendPositive={true}
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
            title="PRE-ORDERS"
            value={kpi.preOrders}
            subtitle={kpi.preOrdersSubtitle}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            iconBg="bg-amber-50 text-amber-600"
          />
          <StatCard
            title="READY FOR PICKUP"
            value={kpi.readyForPickup}
            subtitle={kpi.readyForPickupSubtitle}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            }
            iconBg="bg-emerald-50 text-emerald-600"
          />
        </div>

        {/* 2-Column Main Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Left Column (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Fulfillment Overview Card */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-gray-900">
                    Fulfillment Overview
                  </h2>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    Real-time view of order fulfillment stages
                  </p>
                </div>
                <Link
                  to="/admin/fulfillment"
                  className="text-xs font-bold text-brand-orange hover:underline flex items-center gap-1"
                >
                  <span>View Fulfillment</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </div>

              {/* Horizontal stage bar chart */}
              <BarChartStages stages={stages} />
            </div>

            {/* Sales Performance Category Chart */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-gray-900">
                  Sales Performance
                </h2>
              </div>

              <SalesBarChart
                data={categorySales}
                onNavigateReport={() => navigate('/admin/analytics')}
              />
            </div>

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
                  <span>View All</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[550px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                      <th className="pb-3">ORDER</th>
                      <th className="pb-3">CUSTOMER</th>
                      <th className="pb-3">TYPE</th>
                      <th className="pb-3">FULFILLMENT</th>
                      <th className="pb-3">STATUS</th>
                      <th className="pb-3">AMOUNT</th>
                      <th className="pb-3 text-right">TIME</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs font-medium">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50/50">
                        <td className="py-3 font-bold text-gray-900">{order.id}</td>
                        <td className="py-3 text-gray-700 font-semibold">{order.customer}</td>
                        <td className="py-3 text-gray-500">{order.type}</td>
                        <td className="py-3 text-gray-500">{order.fulfillment}</td>
                        <td className="py-3">
                          <StatusPill status={order.status} />
                        </td>
                        <td className="py-3 font-bold text-gray-900">
                          ₱{order.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-right text-gray-400 text-[11px]">
                          {order.timeAgo || order.date}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column (Alerts, Quick Actions, On Duty) */}
          <div className="space-y-6">
            {/* Alert Center */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-amber-500">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <h2 className="text-base font-black text-gray-900">
                    Alert Center
                  </h2>
                </div>
                {alerts.length > 0 && (
                  <span className="text-xs font-black bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">
                    {alerts.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 font-medium -mt-2">
                Requires immediate attention
              </p>

              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                      alert.severity === 'danger'
                        ? 'bg-rose-50/60 border-rose-200'
                        : alert.severity === 'warning'
                        ? 'bg-amber-50/60 border-amber-200'
                        : 'bg-blue-50/60 border-blue-200'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-gray-900">
                        {alert.title}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {alert.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (alert.actionType === 'retry_payment' || alert.actionType === 'view_order') {
                          navigate('/admin/orders')
                        } else if (alert.actionType === 'restock') {
                          navigate('/admin/inventory')
                        }
                        resolveAlert(alert.id)
                      }}
                      className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors shrink-0 shadow-2xs ${
                        alert.severity === 'danger'
                          ? 'bg-rose-600 text-white hover:bg-rose-700'
                          : alert.severity === 'warning'
                          ? 'bg-amber-600 text-white hover:bg-amber-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {alert.actionLabel}
                    </button>
                  </div>
                ))}
              </div>

              <div className="text-center pt-2">
                <Link
                  to="/admin/orders"
                  className="text-xs font-bold text-brand-orange hover:underline flex items-center justify-center gap-1"
                >
                  <span>View All Alerts</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Quick Actions Stack */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-3">
              <h2 className="text-base font-black text-gray-900">
                Quick Actions
              </h2>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => navigate('/admin/pos')}
                  className="w-full bg-brand-orange hover:bg-brand-orange-dark text-white font-black text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>New POS Order</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/admin/inventory')}
                  className="w-full bg-gray-50 hover:bg-gray-100 text-gray-800 font-bold text-xs py-2.5 px-4 rounded-xl border border-gray-200 flex items-center justify-center gap-2 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-500">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                  <span>Restock Inventory</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddProductModal(true)}
                  className="w-full bg-gray-50 hover:bg-gray-100 text-gray-800 font-bold text-xs py-2.5 px-4 rounded-xl border border-gray-200 flex items-center justify-center gap-2 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-500">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Add New Product</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportSales}
                  className="w-full bg-gray-50 hover:bg-gray-100 text-gray-800 font-bold text-xs py-2.5 px-4 rounded-xl border border-gray-200 flex items-center justify-center gap-2 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-500">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Export Sales (CSV)</span>
                </button>
              </div>
            </div>

            {/* On Duty Today */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-4">
              <h2 className="text-base font-black text-gray-900">
                On Duty Today
              </h2>

              <div className="space-y-3">
                {onDuty.map((staff) => (
                  <div
                    key={staff.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-orange/15 text-brand-orange font-black text-xs flex items-center justify-center shrink-0">
                        {staff.avatar}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-900">
                          {staff.name}
                        </p>
                        <p className="text-[10px] text-gray-500 font-medium">
                          {staff.role} • {staff.timeSlot}
                        </p>
                      </div>
                    </div>
                    <StatusPill status={staff.status} />
                  </div>
                ))}
              </div>

              <div className="text-center pt-2">
                <Link
                  to="/admin/schedule"
                  className="text-xs font-bold text-brand-orange hover:underline flex items-center justify-center gap-1"
                >
                  <span>View Full Schedule</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900">Quick Add Product</h3>
              <button
                type="button"
                onClick={() => setShowAddProductModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddProductSubmit} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Product Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BU Pride Pullover"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Category</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  >
                    <option value="Hoodies">Hoodies</option>
                    <option value="Shirts">Shirts</option>
                    <option value="Jackets">Jackets</option>
                    <option value="Caps">Caps</option>
                    <option value="Lanyard">Lanyard</option>
                    <option value="Pins">Pins</option>
                    <option value="Stickers">Stickers</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Price (₱)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="750.00"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-gray-700 mb-1">Initial Stock Count</label>
                <input
                  type="number"
                  placeholder="25"
                  value={newProdStock}
                  onChange={(e) => setNewProdStock(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="px-4 py-2 bg-gray-100 rounded-xl font-bold text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-orange rounded-xl font-black text-white hover:bg-brand-orange-dark shadow-xs"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
