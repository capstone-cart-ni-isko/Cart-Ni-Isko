import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import StatCard from '../../components/admin/StatCard.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'

import { INITIAL_ADMIN_DATA } from '../../data/adminMockData.js'

export default function AdminAnalytics() {
  const navigate = useNavigate()
  const { adminState = {} } = useAdmin()
  const [timeRange, setTimeRange] = useState('7D') // 'Today' | '7D' | '30D'

  const analytics = adminState?.analytics || INITIAL_ADMIN_DATA.analytics || {}
  const orders = adminState?.orders || INITIAL_ADMIN_DATA.orders || []
  const topProducts = analytics.topProducts || []
  const recentOrders = orders.slice(0, 4)

  // Chart data points
  const trendData = analytics.salesTrend || []
  const maxSales = Math.max(...trendData.map((d) => d.total || 0), 1)

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
              Analytics Overview
            </h1>
            <p className="text-xs lg:text-sm font-medium text-gray-500 mt-1">
              Today's performance and recent activity.
            </p>
          </div>

          {/* Timeframe Toggle Pills */}
          <div className="flex bg-white p-1 rounded-xl border border-gray-200/80 shadow-2xs self-start sm:self-auto">
            {['Today', '7D', '30D'].map((tab) => (
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

        {/* 4 KPI Cards Matching Page 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="TOTAL SALES"
            value="₱45,231.00"
            trend="+12.5% vs yesterday"
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
            value="1,204"
            trend="+8.2% vs yesterday"
            trendPositive={true}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
              </svg>
            }
            iconBg="bg-blue-50 text-blue-600"
          />
          <StatCard
            title="ACTIVE CUSTOMERS"
            value="892"
            trend="-1.4% vs yesterday"
            trendPositive={false}
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
          <StatCard
            title="AVG. ORDER VALUE"
            value="₱145.50"
            progressBar={65}
            subtitle="65% target reached"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            }
            iconBg="bg-purple-50 text-purple-600"
          />
        </div>

        {/* 2-Column Main Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Left: Sales Overview Line Chart (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black text-gray-900">
                    Sales Overview
                  </h2>
                  <p className="text-xs text-gray-400 font-medium">
                    Daily revenue breakdown (Online vs In-Store POS)
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold">
                  <div className="flex items-center gap-1.5 text-brand-orange">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-orange" />
                    <span>Online Sales</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-blue-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span>POS Walk-in</span>
                  </div>
                </div>
              </div>

              {/* Interactive SVG Area Chart */}
              <div className="pt-6 pb-2">
                <div className="h-64 flex items-end justify-between gap-3 px-2 border-b border-gray-100 relative">
                  {trendData.map((point) => {
                    const totalH = Math.round((point.total / maxSales) * 100)
                    const onlineH = Math.round((point.online / maxSales) * 100)
                    const posH = Math.round((point.pos / maxSales) * 100)

                    return (
                      <div
                        key={point.date}
                        className="flex-1 flex flex-col items-center gap-2 group h-full justify-end"
                      >
                        {/* Hover card */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] p-2 rounded-xl pointer-events-none whitespace-nowrap shadow-xl -mb-2 z-20 space-y-0.5">
                          <p className="font-extrabold text-orange-300">{point.date}</p>
                          <p>Online: ₱{point.online.toLocaleString()}</p>
                          <p>POS: ₱{point.pos.toLocaleString()}</p>
                          <p className="font-bold border-t border-gray-700 pt-0.5">
                            Total: ₱{point.total.toLocaleString()}
                          </p>
                        </div>

                        {/* Combined Stacked Bar / Trend Column */}
                        <div className="w-full max-w-[42px] flex flex-col justify-end h-full gap-1">
                          <div
                            className="w-full bg-brand-orange rounded-t-lg transition-all duration-500 group-hover:brightness-110"
                            style={{ height: `${onlineH}%` }}
                          />
                          <div
                            className="w-full bg-blue-500 rounded-t-sm transition-all duration-500 group-hover:brightness-110"
                            style={{ height: `${posH}%` }}
                          />
                        </div>

                        <span className="text-xs font-bold text-gray-500">
                          {point.date}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-between items-center text-[10px] text-gray-400 font-semibold pt-2">
                  <span>Mon (Week Start)</span>
                  <span>Mid-Week Peak</span>
                  <span>Sun (Distribution Closes)</span>
                </div>
              </div>
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
                  View All <span className="text-[10px]">➔</span>
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                      <th className="pb-3">Order ID</th>
                      <th className="pb-3">Customer</th>
                      <th className="pb-3">Amount</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-xs font-medium">
                    {recentOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50/50">
                        <td className="py-3 font-bold text-gray-900">{o.id}</td>
                        <td className="py-3 text-gray-700 font-semibold">{o.customer}</td>
                        <td className="py-3 font-bold text-gray-900">₱{(Number(o?.total) || 0).toFixed(2)}</td>
                        <td className="py-3">
                          <StatusPill status={o.status} />
                        </td>
                        <td className="py-3 text-right text-gray-400 text-[11px]">{o.date}</td>
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
                          <p className="text-[10px] text-gray-400 font-semibold">
                            {prod.category}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-gray-900">{prod.sales}</p>
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">sales</p>
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
                  View Full Inventory Report ➔
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
                  <span className="font-bold text-gray-900">{analytics.conversionMetrics.visitors}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Added to Cart</span>
                  <span className="font-bold text-gray-900">{analytics.conversionMetrics.addedToCart}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Completed Checkouts</span>
                  <span className="font-bold text-emerald-600">{analytics.conversionMetrics.checkouts}</span>
                </div>
                <div className="pt-2 border-t border-gray-100 flex justify-between font-black text-gray-900">
                  <span>Conversion Rate</span>
                  <span className="text-brand-orange">{analytics.conversionMetrics.conversionRate}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
