import React, { useState, useMemo } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import StatCard from '../../components/admin/StatCard.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'

import { INITIAL_ADMIN_DATA } from '../../data/adminMockData.js'

export default function AdminFulfillment() {
  const { adminState = {}, updateLogisticsStage, batchCompleteLogistics } = useAdmin()

  const [activeTab, setActiveTab] = useState('campus') // 'campus' | 'courier' | 'pos'
  const [subFilter, setSubFilter] = useState('all') // 'all' | 'overdue' | 'unclaimed'
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('table') // 'table' | 'grid'
  const [selectedIds, setSelectedIds] = useState([])

  // Action Modals
  const [handoverModalOrder, setHandoverModalOrder] = useState(null)
  const [dispatchModalOrder, setDispatchModalOrder] = useState(null)
  const [trackingNumberInput, setTrackingNumberInput] = useState('')
  const [notifySuccessMsg, setNotifySuccessMsg] = useState('')

  const kpi = adminState?.fulfillmentKPIs || INITIAL_ADMIN_DATA.fulfillmentKPIs
  const items = adminState?.logisticsOrders || INITIAL_ADMIN_DATA.logisticsOrders || []

  // Filter items by main tab, sub filter, and search
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchTab =
        (activeTab === 'campus' && item.methodType === 'campus') ||
        (activeTab === 'courier' && item.methodType === 'courier') ||
        (activeTab === 'pos' && item.methodType === 'pos')

      const matchSearch =
        !searchQuery ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.studentId && item.studentId.includes(searchQuery))

      const matchSub =
        subFilter === 'all' ||
        (subFilter === 'overdue' && item.stage === 'Delayed') ||
        (subFilter === 'unclaimed' && item.stage === 'Ready')

      return matchTab && matchSearch && matchSub
    })
  }, [items, activeTab, subFilter, searchQuery])

  // Handover confirmation
  const handleHandoverConfirm = () => {
    if (handoverModalOrder) {
      updateLogisticsStage(handoverModalOrder.id, 'Completed')
      setHandoverModalOrder(null)
    }
  }

  // Dispatch tracking submit
  const handleDispatchConfirm = () => {
    if (dispatchModalOrder) {
      updateLogisticsStage(dispatchModalOrder.id, 'In Transit', {
        trackingNumber: trackingNumberInput || 'LLM-2026-9921',
        details: `Courier - Lalamove\nTracking: ${trackingNumberInput || 'LLM-2026-9921'}`,
      })
      setDispatchModalOrder(null)
      setTrackingNumberInput('')
    }
  }

  // Notify student trigger
  const handleNotifyTrigger = (order) => {
    updateLogisticsStage(order.id, 'Ready')
    setNotifySuccessMsg(`Notification sent to ${order.customer} (SMS & In-App Alert dispatched).`)
    setTimeout(() => setNotifySuccessMsg(''), 4000)
  }

  // Batch complete
  const handleBatchComplete = () => {
    if (selectedIds.length > 0) {
      batchCompleteLogistics(selectedIds)
      setSelectedIds([])
    } else {
      const readyIds = filteredItems.filter((i) => i.stage === 'Ready').map((i) => i.id)
      batchCompleteLogistics(readyIds)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
            Fulfillment &amp; Logistics
          </h1>
          <p className="text-xs lg:text-sm font-medium text-gray-500 mt-1">
            Track batch shipments, student claim windows, and courier dispatch.
          </p>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="TOTAL UNITS ORDERED"
            value={kpi.totalUnitsOrdered}
            subtitle={kpi.totalUnitsNote}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            }
          />
          <StatCard
            title="STOCK ARRIVAL"
            value={kpi.stockArrival}
            subtitle={kpi.stockArrivalNote}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            }
            iconBg="bg-blue-50 text-blue-600"
          />
          <StatCard
            title="READY FOR CLAIM"
            value={kpi.readyForClaim}
            subtitle={kpi.readyForClaimNote}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            }
            iconBg="bg-amber-50 text-amber-600"
          />
          <StatCard
            title="COMPLETED"
            value={kpi.completed}
            subtitle={kpi.completedNote}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            }
            iconBg="bg-emerald-50 text-emerald-600"
          />
        </div>

        {/* Notification banner */}
        {notifySuccessMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-emerald-600">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{notifySuccessMsg}</span>
            </div>
            <button onClick={() => setNotifySuccessMsg('')} className="text-emerald-700 hover:text-emerald-900">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Main Tab Switcher & Search */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Primary Tab Switcher */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('campus')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'campus'
                    ? 'bg-brand-orange text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Campus Claims (38)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('courier')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'courier'
                    ? 'bg-brand-orange text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Courier Shipping (12)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pos')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'pos'
                    ? 'bg-brand-orange text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                In-Store POS Log
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                placeholder="Search student, order ID, or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-gray-50 border border-gray-200 text-xs focus:outline-none focus:bg-white focus:ring-1 focus:ring-brand-orange"
              />
            </div>
          </div>

          {/* Secondary Sub Filters & Batch Complete */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  subFilter === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All Orders ({filteredItems.length})
              </button>
              <button
                type="button"
                onClick={() => setSubFilter('overdue')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  subFilter === 'overdue'
                    ? 'bg-rose-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Overdue (3)</span>
              </button>
              <button
                type="button"
                onClick={() => setSubFilter('unclaimed')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  subFilter === 'unclaimed'
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Unclaimed &gt; 24h (5)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBatchComplete}
                className="px-3.5 py-1.5 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>Batch Complete</span>
              </button>

              {/* View Toggle List vs Grid */}
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-1 rounded ${viewMode === 'table' ? 'bg-white shadow-2xs text-brand-orange' : 'text-gray-400'}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1 rounded ${viewMode === 'grid' ? 'bg-white shadow-2xs text-brand-orange' : 'text-gray-400'}`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Data Table View */}
        {viewMode === 'table' ? (
          <div className="bg-white rounded-2xl border border-gray-100/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70 text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                    <th className="py-3.5 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredItems.length > 0 &&
                          filteredItems.every((i) => selectedIds.includes(i.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(filteredItems.map((i) => i.id))
                          else setSelectedIds([])
                        }}
                        className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                      />
                    </th>
                    <th className="py-3.5 px-4">ORDER ID</th>
                    <th className="py-3.5 px-4">CUSTOMER</th>
                    <th className="py-3.5 px-4">FULFILLMENT METHOD</th>
                    <th className="py-3.5 px-4">CLAIM / DELIVERY DETAILS</th>
                    <th className="py-3.5 px-4">LOGISTICS STAGE</th>
                    <th className="py-3.5 px-4 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => {
                            if (selectedIds.includes(item.id)) {
                              setSelectedIds(selectedIds.filter((id) => id !== item.id))
                            } else {
                              setSelectedIds([...selectedIds, item.id])
                            }
                          }}
                          className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-bold text-gray-900">{item.id}</td>
                      <td className="py-3.5 px-4 font-semibold text-gray-800">{item.customer}</td>
                      <td className="py-3.5 px-4">
                        <StatusPill status={item.method} variant="blue" />
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 whitespace-pre-line text-[11px] leading-tight font-medium">
                        {item.details}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusPill status={item.stage} />
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {item.stage === 'Ready' && (
                          <button
                            type="button"
                            onClick={() => setHandoverModalOrder(item)}
                            className="px-3.5 py-1.5 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-2xs transition-colors"
                          >
                            Hand Over Item
                          </button>
                        )}
                        {item.stage === 'Packing' && (
                          <button
                            type="button"
                            onClick={() => setDispatchModalOrder(item)}
                            className="px-3.5 py-1.5 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold text-xs rounded-xl shadow-2xs transition-colors"
                          >
                            Dispatch / Track
                          </button>
                        )}
                        {item.stage === 'Delayed' && (
                          <button
                            type="button"
                            onClick={() => handleNotifyTrigger(item)}
                            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors"
                          >
                            Notify
                          </button>
                        )}
                        {item.stage === 'Completed' && (
                          <button
                            type="button"
                            disabled
                            className="px-3.5 py-1.5 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 cursor-default flex items-center justify-center gap-1 mx-auto"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>Fulfilled</span>
                          </button>
                        )}
                        {item.stage === 'Pending' && (
                          <button
                            type="button"
                            onClick={() => updateLogisticsStage(item.id, 'Packing')}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors"
                          >
                            Start Packing
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-black text-gray-900">{item.id}</h3>
                    <p className="text-xs font-semibold text-gray-600">{item.customer}</p>
                  </div>
                  <StatusPill status={item.stage} />
                </div>
                <div className="text-xs text-gray-500 whitespace-pre-line bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  {item.details}
                </div>
                <div className="pt-2">
                  {item.stage === 'Ready' && (
                    <button
                      type="button"
                      onClick={() => setHandoverModalOrder(item)}
                      className="w-full py-2 bg-gray-900 text-white font-bold text-xs rounded-xl hover:bg-black"
                    >
                      Hand Over Item
                    </button>
                  )}
                  {item.stage === 'Packing' && (
                    <button
                      type="button"
                      onClick={() => setDispatchModalOrder(item)}
                      className="w-full py-2 bg-brand-orange text-white font-bold text-xs rounded-xl hover:bg-brand-orange-dark"
                    >
                      Dispatch / Track
                    </button>
                  )}
                  {item.stage === 'Delayed' && (
                    <button
                      type="button"
                      onClick={() => handleNotifyTrigger(item)}
                      className="w-full py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700"
                    >
                      Notify Student
                    </button>
                  )}
                  {item.stage === 'Completed' && (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 flex items-center justify-center gap-1"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Fulfilled</span>
                    </button>
                  )}
                  {item.stage === 'Pending' && (
                    <button
                      type="button"
                      onClick={() => updateLogisticsStage(item.id, 'Packing')}
                      className="w-full py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700"
                    >
                      Start Packing
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hand Over Item Modal */}
      {handoverModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-4">
            <h3 className="text-base font-black text-gray-900">Confirm Campus Claim</h3>
            <p className="text-xs text-gray-500">
              Confirm handover of merchandise to{' '}
              <strong className="text-gray-900">{handoverModalOrder.customer}</strong>{' '}
              ({handoverModalOrder.id}).
            </p>
            <div className="p-3 bg-gray-50 rounded-xl text-xs space-y-1">
              <p className="font-bold text-gray-800">Verification Details:</p>
              <p className="text-gray-600">{handoverModalOrder.details}</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setHandoverModalOrder(null)}
                className="px-4 py-2 bg-gray-100 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleHandoverConfirm}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Confirm Claim</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch / Track Modal */}
      {dispatchModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-4">
            <h3 className="text-base font-black text-gray-900">Dispatch Courier Order</h3>
            <p className="text-xs text-gray-500">
              Enter courier tracking code for{' '}
              <strong className="text-gray-900">{dispatchModalOrder.customer}</strong>.
            </p>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Lalamove / Courier Tracking #
              </label>
              <input
                type="text"
                placeholder="e.g. LLM-992140"
                value={trackingNumberInput}
                onChange={(e) => setTrackingNumberInput(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-orange"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDispatchModalOrder(null)}
                className="px-4 py-2 bg-gray-100 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDispatchConfirm}
                className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-black shadow-xs"
              >
                Dispatch &amp; Update
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
