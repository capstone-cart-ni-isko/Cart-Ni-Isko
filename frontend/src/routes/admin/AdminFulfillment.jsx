import React, { useState, useMemo } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'

const INITIAL_FULFILLMENT_ORDERS = [
  {
    id: '#ORD-8921',
    customer: 'Maria Santos',
    date: 'Oct 24, 2:30 PM',
    batchId: 'BAT-0012',
    batchCount: 5,
    category: 'Regular',
    fulfillmentType: 'Store Pickup',
    studentId: '2022-10492',
    pickupMode: 'Self Pickup',
    status: 'Ready for Pickup',
    timeInStage: '2h 14m',
    sinceTime: 'Since 12:16 PM',
    exceeds24h: false,
    actionType: 'handover',
    actionLabel: 'Hand Over Item',
  },
  {
    id: '#ORD-8923',
    customer: 'Elena Reyes',
    date: 'Oct 24, 1:45 PM',
    batchId: 'BAT-0012',
    batchCount: 5,
    category: 'Regular',
    fulfillmentType: 'Store Pickup',
    studentId: '2020-55321',
    proxyName: 'Ana P.',
    pickupMode: 'Proxy: Ana P.',
    status: 'Ready for Pickup',
    timeInStage: '28m',
    sinceTime: 'Since 2:17 PM',
    exceeds24h: false,
    actionType: 'handover',
    actionLabel: 'Hand Over Item',
  },
  {
    id: '#ORD-8925',
    customer: 'Corazon Aquino',
    date: 'Oct 24, 11:20 AM',
    batchId: 'BAT-0014',
    batchCount: 5,
    category: 'Pre-order',
    fulfillmentType: 'Store Pickup',
    studentId: '2021-00293',
    pickupMode: 'Self Pickup',
    status: 'In Production',
    timeInStage: '3h 05m',
    sinceTime: 'Since 11:20 AM',
    exceeds24h: false,
    actionType: 'production',
    actionLabel: 'View Production',
  },
  {
    id: '#ORD-8928',
    customer: 'Diana Lopez',
    date: 'Oct 24, 10:10 AM',
    batchId: 'BAT-0015',
    batchCount: 6,
    category: 'Pre-order',
    fulfillmentType: 'Store Pickup',
    studentId: '2022-88910',
    proxyName: 'John L.',
    pickupMode: 'Proxy: John L.',
    status: 'Awaiting Production',
    timeInStage: '5h 45m',
    sinceTime: 'Since 10:10 AM',
    exceeds24h: false,
    actionType: 'production',
    actionLabel: 'View Production',
  },
  {
    id: '#ORD-8929',
    customer: 'Kevin Tan',
    date: 'Oct 24, 9:05 AM',
    batchId: 'BAT-0016',
    batchCount: 4,
    category: 'Regular',
    fulfillmentType: 'Store Pickup',
    studentId: '2023-11455',
    pickupMode: 'Self Pickup',
    status: 'Unclaimed > 24h',
    timeInStage: '25h 20m',
    sinceTime: 'Since Oct 23, 8:30 PM',
    exceeds24h: true,
    actionType: 'notify',
    actionLabel: 'Notify Customer',
  },
]

export default function AdminFulfillment() {
  const { updateLogisticsStage } = useAdmin()

  // Tab State: 'pickup' | 'courier' | 'history'
  const [activeTab, setActiveTab] = useState('pickup')

  // Orders list state
  const [orders, setOrders] = useState(INITIAL_FULFILLMENT_ORDERS)
  const [selectedIds, setSelectedIds] = useState(['#ORD-8921', '#ORD-8923']) // 2/3 selected (Photo 4)
  const [showBatchDropdown, setShowBatchDropdown] = useState(false)

  // Filters State
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [batchFilter, setBatchFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [dateRangeFilter, setDateRangeFilter] = useState('All')
  const [exceptionFilter, setExceptionFilter] = useState('All')

  // Active tags (matching Photo 4)
  const [activeTags, setActiveTags] = useState([
    'Status: Awaiting Production, In Production, Preparing...',
    'Exception: Unclaimed > 24h',
    'Order Category: All',
  ])

  // Modals & feedback
  const [toastMessage, setToastMessage] = useState('')

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3500)
  }

  // Toggle order checkbox selection
  const toggleSelectOrder = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === orders.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(orders.map((o) => o.id))
    }
  }

  // Batch actions
  const handleBatchStatusUpdate = (newStatus) => {
    setOrders((prev) =>
      prev.map((o) => (selectedIds.includes(o.id) ? { ...o, status: newStatus } : o))
    )
    showToast(`Updated ${selectedIds.length} orders to "${newStatus}"`)
    setShowBatchDropdown(false)
  }

  // Single order action
  const handleOrderAction = (order) => {
    if (order.actionType === 'handover') {
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: 'Claimed', actionLabel: 'Claimed' } : o))
      )
      showToast(`Order ${order.id} handed over to ${order.customer}!`)
    } else if (order.actionType === 'notify') {
      showToast(`Notification and SMS reminder sent to ${order.customer} for ${order.id}.`)
    } else {
      showToast(`Viewing production queue for ${order.id}`)
    }
  }

  // Remove single active tag
  const removeTag = (tag) => {
    setActiveTags((prev) => prev.filter((t) => t !== tag))
  }
  const clearAllTags = () => {
    setActiveTags([])
  }

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch =
        !searchQuery ||
        o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.batchId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.studentId.includes(searchQuery)
      return matchSearch
    })
  }, [orders, searchQuery])

  return (
    <AdminLayout>
      <div className="space-y-6 animate-fade-in pb-12">
        {/* Toast alert */}
        {toastMessage && (
          <div className="fixed top-20 right-8 z-50 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-slide-up">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Page Header (Photo 4) */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
            Fulfillment &amp; Logistics
          </h1>
          <p className="text-xs lg:text-sm text-gray-500 font-medium mt-0.5">
            Process online orders through production, pickup, and delivery.
          </p>
        </div>

        {/* 4 Metric KPI Cards (Photo 4) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Fulfillment */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-wider uppercase text-gray-400">
                ACTIVE FULFILLMENT
              </p>
              <h3 className="text-2xl font-black text-gray-900 mt-0.5">42</h3>
              <p className="text-[11px] text-gray-400 font-medium">Orders in progress</p>
            </div>
          </div>

          {/* Awaiting Production */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-brand-orange shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4H2v16z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-wider uppercase text-gray-400">
                AWAITING PRODUCTION
              </p>
              <h3 className="text-2xl font-black text-gray-900 mt-0.5">4</h3>
              <p className="text-[11px] text-gray-400 font-medium">Need production</p>
            </div>
          </div>

          {/* Ready For Pickup */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-wider uppercase text-gray-400">
                READY FOR PICKUP
              </p>
              <h3 className="text-2xl font-black text-gray-900 mt-0.5">12</h3>
              <p className="text-[11px] text-gray-400 font-medium">Waiting for customers</p>
            </div>
          </div>

          {/* Ready For Dispatch */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-extrabold tracking-wider uppercase text-gray-400">
                READY FOR DISPATCH
              </p>
              <h3 className="text-2xl font-black text-gray-900 mt-0.5">5</h3>
              <p className="text-[11px] text-gray-400 font-medium">For courier delivery</p>
            </div>
          </div>
        </div>

        {/* Main Tabs (Store Pickup / Courier Delivery / Completed) */}
        <div className="flex items-center gap-8 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('pickup')}
            className={`pb-3.5 text-xs font-bold transition-colors flex items-center gap-2 relative cursor-pointer ${
              activeTab === 'pickup'
                ? 'text-brand-orange border-b-2 border-brand-orange font-extrabold'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <span>🏪 Store Pickup (38)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('courier')}
            className={`pb-3.5 text-xs font-bold transition-colors flex items-center gap-2 relative cursor-pointer ${
              activeTab === 'courier'
                ? 'text-brand-orange border-b-2 border-brand-orange font-extrabold'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <span>🚚 Courier Delivery (12)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-3.5 text-xs font-bold transition-colors flex items-center gap-2 relative cursor-pointer ${
              activeTab === 'history'
                ? 'text-brand-orange border-b-2 border-brand-orange font-extrabold'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <span>⏱ Completed / History</span>
          </button>
        </div>

        {/* Filters Toolbar (Photo 4) */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-2xs space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
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
                placeholder="Search order, customer, or batch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-4 rounded-md bg-white border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-0 focus:border-gray-300"
              />
            </div>

            {/* Dropdown Filters (Clean without orange or black outlines) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-0 focus:border-gray-300 cursor-pointer"
              >
                <option value="All">Status ▾</option>
                <option value="Ready for Pickup">Ready for Pickup</option>
                <option value="In Production">In Production</option>
                <option value="Awaiting Production">Awaiting Production</option>
                <option value="Unclaimed">Unclaimed &gt; 24h</option>
              </select>

              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-0 focus:border-gray-300 cursor-pointer"
              >
                <option value="All">Batch ▾</option>
                <option value="BAT-0012">BAT-0012</option>
                <option value="BAT-0014">BAT-0014</option>
                <option value="BAT-0015">BAT-0015</option>
                <option value="BAT-0016">BAT-0016</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-0 focus:border-gray-300 cursor-pointer"
              >
                <option value="All">Order Category ▾</option>
                <option value="Regular">Regular</option>
                <option value="Pre-order">Pre-order</option>
              </select>

              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-0 focus:border-gray-300 cursor-pointer"
              >
                <option value="All">Date Range ▾</option>
                <option value="Today">Today</option>
                <option value="Last 7 Days">Last 7 Days</option>
                <option value="This Month">This Month</option>
              </select>

              <select
                value={exceptionFilter}
                onChange={(e) => setExceptionFilter(e.target.value)}
                className="h-9 px-3 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-0 focus:border-gray-300 cursor-pointer"
              >
                <option value="All">Exception ▾</option>
                <option value="Unclaimed">Unclaimed &gt; 24h</option>
                <option value="Delayed">Delayed</option>
              </select>

              <button
                type="button"
                onClick={clearAllTags}
                className="text-xs font-semibold text-gray-500 hover:text-brand-orange px-2 py-1 cursor-pointer"
              >
                Clear all
              </button>

              <button
                type="button"
                className="h-9 px-3.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                <span>Filters</span>
              </button>
            </div>
          </div>

          {/* Active Filter Tags */}
          {activeTags.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 flex-wrap">
              {activeTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-gray-100 text-gray-700 text-xs font-medium border border-gray-200"
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-gray-400 hover:text-gray-700 cursor-pointer text-sm font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Selected Orders Banner & Batch Actions Dropdown (Photo 4) */}
        {selectedIds.length > 0 && (
          <div className="bg-orange-50/70 border border-orange-200/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-xs font-extrabold text-orange-950">
                {selectedIds.length} orders selected
              </span>

              {/* Batch Actions Dropdown - Rectangular Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowBatchDropdown(!showBatchDropdown)}
                  className="px-3.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 rounded-md text-xs font-semibold text-gray-800 flex items-center gap-2 shadow-2xs cursor-pointer focus:outline-none"
                >
                  <span>Batch Actions</span>
                  <span className="text-gray-400 text-xs">▾</span>
                </button>

                {showBatchDropdown && (
                  <div className="absolute left-0 mt-1.5 w-60 bg-white rounded-md shadow-xl border border-gray-200 py-1.5 z-40 animate-fade-in">
                    <button
                      type="button"
                      onClick={() => handleBatchStatusUpdate('In Production')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-start gap-3 cursor-pointer"
                    >
                      <span className="text-base">🛍</span>
                      <div>
                        <p className="text-xs font-bold text-gray-900 leading-tight">Mark In Production</p>
                        <p className="text-[10px] text-gray-400">Move to in production</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchStatusUpdate('Preparing')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-start gap-3 cursor-pointer"
                    >
                      <span className="text-base">📦</span>
                      <div>
                        <p className="text-xs font-bold text-gray-900 leading-tight">Mark Preparing</p>
                        <p className="text-[10px] text-gray-400">Move to preparing</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchStatusUpdate('Ready for Pickup')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-start gap-3 cursor-pointer"
                    >
                      <span className="text-base">🧺</span>
                      <div>
                        <p className="text-xs font-bold text-gray-900 leading-tight">Mark Ready for Pickup</p>
                        <p className="text-[10px] text-gray-400">Notify customers</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchStatusUpdate('Claimed')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-start gap-3 cursor-pointer"
                    >
                      <span className="text-base">✅</span>
                      <div>
                        <p className="text-xs font-bold text-gray-900 leading-tight">Mark Claimed</p>
                        <p className="text-[10px] text-gray-400">by customer</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-orange-900/80 font-medium">
              <span>ⓘ</span>
              <span>Actions are shown based on the status of selected orders.</span>
            </div>
          </div>
        )}

        {/* Table Container (Photo 4) */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-700 border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/50 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  <th className="p-4 w-10">
                    <input
                      type="checkbox"
                      className="rounded text-brand-orange focus:ring-0"
                      checked={selectedIds.length === orders.length && orders.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-4">ORDER ID</th>
                  <th className="p-4">BATCH ID</th>
                  <th className="p-4">CATEGORY</th>
                  <th className="p-4">FULFILLMENT DETAILS</th>
                  <th className="p-4">STATUS</th>
                  <th className="p-4">TIME IN STAGE</th>
                  <th className="p-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrders.map((order) => {
                  const isSelected = selectedIds.includes(order.id)
                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-gray-50/70 transition-colors ${
                        isSelected ? 'bg-orange-50/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOrder(order.id)}
                          className="rounded text-brand-orange focus:ring-0"
                        />
                      </td>

                      {/* Order ID & Customer */}
                      <td className="p-4">
                        <p className="font-extrabold text-gray-900 text-xs hover:text-brand-orange cursor-pointer">
                          {order.id}
                        </p>
                        <p className="text-gray-800 font-semibold text-[11px] mt-0.5">
                          {order.customer}
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">{order.date}</p>
                      </td>

                      {/* Batch ID - Rectangular */}
                      <td className="p-4">
                        <span className="inline-block px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-semibold text-[11px] border border-blue-100/70">
                          {order.batchId}
                        </span>
                        <p className="text-[10px] text-gray-400 mt-0.5">{order.batchCount} orders</p>
                      </td>

                      {/* Category Badge - Rectangular */}
                      <td className="p-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                            order.category === 'Pre-order'
                              ? 'bg-orange-50 text-brand-orange border border-orange-200/60'
                              : 'bg-blue-50 text-blue-700 border border-blue-200/60'
                          }`}
                        >
                          {order.category}
                        </span>
                      </td>

                      {/* Fulfillment Details */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 font-bold text-gray-900 text-xs">
                          <span className="w-2 h-2 rounded-full bg-purple-600" />
                          <span>{order.fulfillmentType}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                          Student ID: {order.studentId}
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">
                          {order.pickupMode}
                        </p>
                      </td>

                      {/* Status Badge - Rectangular */}
                      <td className="p-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                            order.status === 'Ready for Pickup'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : order.status === 'In Production'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                              : order.status === 'Awaiting Production'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                              : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                          }`}
                        >
                          {order.status}
                        </span>
                        {order.status === 'Unclaimed > 24h' && (
                          <p className="text-[10px] text-rose-500 font-medium mt-0.5">
                            {order.sinceTime}
                          </p>
                        )}
                      </td>

                      {/* Time In Stage */}
                      <td className="p-4">
                        <div className="flex items-center gap-1 font-bold text-xs">
                          <span className="text-gray-400">⏱</span>
                          <span
                            className={order.exceeds24h ? 'text-rose-600 font-black' : 'text-gray-800'}
                          >
                            {order.timeInStage}
                          </span>
                        </div>
                        <p
                          className={`text-[10px] font-medium mt-0.5 ${
                            order.exceeds24h ? 'text-rose-600 font-bold' : 'text-gray-400'
                          }`}
                        >
                          {order.exceeds24h ? 'Exceeds 24h' : order.sinceTime}
                        </p>
                      </td>

                      {/* Action Buttons - Rectangular */}
                      <td className="p-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOrderAction(order)}
                            className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-colors cursor-pointer ${
                              order.actionType === 'handover'
                                ? 'bg-[#18181B] hover:bg-black text-white shadow-2xs'
                                : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-800'
                            }`}
                          >
                            {order.actionLabel}
                          </button>
                          <button
                            type="button"
                            className="p-1.5 rounded-md border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:bg-gray-50 cursor-pointer"
                          >
                            ···
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer (Photo 4) */}
          <div className="p-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-gray-500 font-medium">Showing 1–5 of 38 orders</span>
            <div className="flex items-center gap-4">
              <select className="h-8 px-2.5 rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-700 focus:outline-none focus:ring-0">
                <option>10 per page</option>
                <option>25 per page</option>
                <option>50 per page</option>
              </select>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="w-8 h-8 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="w-8 h-8 rounded-md bg-brand-orange text-white font-bold flex items-center justify-center shadow-2xs"
                >
                  1
                </button>
                <button
                  type="button"
                  className="w-8 h-8 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100 flex items-center justify-center font-semibold"
                >
                  2
                </button>
                <button
                  type="button"
                  className="w-8 h-8 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100 flex items-center justify-center font-semibold"
                >
                  3
                </button>
                <button
                  type="button"
                  className="w-8 h-8 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100 flex items-center justify-center font-semibold"
                >
                  4
                </button>
                <button
                  type="button"
                  className="w-8 h-8 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
