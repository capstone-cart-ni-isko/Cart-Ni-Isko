import React, { useState, useMemo } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import StatCard from '../../components/admin/StatCard.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import DataTable from '../../components/admin/DataTable.jsx'
import DrawerPanel from '../../components/admin/DrawerPanel.jsx'

export default function AdminOrders() {
  const { adminState, updateOrderStatus } = useAdmin()

  // State for filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('All')
  const [filterFulfillment, setFilterFulfillment] = useState('All')
  const [filterBatch, setFilterBatch] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [selectedOrderIds, setSelectedOrderIds] = useState([])

  // Modal / Drawer state
  const [activeOrderDetail, setActiveOrderDetail] = useState(null)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkNewStatus, setBulkNewStatus] = useState('In Production')

  const orders = adminState.orders || []

  // Compute live KPIs
  const totalOrders = orders.length
  const preOrdersCount = orders.filter((o) => o.type?.toLowerCase().includes('pre-order')).length
  const readyPickupCount = orders.filter((o) => o.status === 'Ready for Pickup').length
  const completedCount = orders.filter((o) => o.status === 'Completed').length

  // Applied filter chips
  const activeChips = useMemo(() => {
    const chips = []
    if (filterType !== 'All') chips.push({ key: 'type', label: `Type: ${filterType}`, reset: () => setFilterType('All') })
    if (filterFulfillment !== 'All') chips.push({ key: 'fulfillment', label: `Fulfillment: ${filterFulfillment}`, reset: () => setFilterFulfillment('All') })
    if (filterBatch !== 'All') chips.push({ key: 'batch', label: `Batch: ${filterBatch}`, reset: () => setFilterBatch('All') })
    if (filterStatus !== 'All') chips.push({ key: 'status', label: `Status: ${filterStatus}`, reset: () => setFilterStatus('All') })
    return chips
  }, [filterType, filterFulfillment, filterBatch, filterStatus])

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchSearch =
        !searchQuery ||
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.batch?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchType =
        filterType === 'All' ||
        (filterType === 'Pre-order' && order.type?.toLowerCase().includes('pre-order')) ||
        (filterType === 'Regular' && order.type?.toLowerCase().includes('regular')) ||
        order.type === filterType

      const matchFulfillment =
        filterFulfillment === 'All' ||
        order.fulfillment?.toLowerCase().includes(filterFulfillment.toLowerCase())

      const matchBatch = filterBatch === 'All' || order.batch === filterBatch
      const matchStatus = filterStatus === 'All' || order.status === filterStatus

      return matchSearch && matchType && matchFulfillment && matchBatch && matchStatus
    })
  }, [orders, searchQuery, filterType, filterFulfillment, filterBatch, filterStatus])

  // Bulk update handler
  const handleBulkUpdate = () => {
    selectedOrderIds.forEach((id) => {
      updateOrderStatus(id, bulkNewStatus)
    })
    setSelectedOrderIds([])
    setShowBulkModal(false)
  }

  // Export CSV
  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Order ID,Batch,Customer,Date,Type,Fulfillment,Status,Total (PHP)']
        .concat(
          filteredOrders.map(
            (o) =>
              `${o.id},${o.batch || ''},${o.customer},${o.date},${o.type},${o.fulfillment},${o.status},${o.total}`
          )
        )
        .join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Tindahan_Orders_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Table columns definition
  const columns = [
    {
      header: 'ORDER ID',
      key: 'id',
      render: (row) => (
        <div>
          <button
            type="button"
            onClick={() => setActiveOrderDetail(row)}
            className="font-bold text-gray-900 hover:text-brand-orange text-left"
          >
            {row.id}
          </button>
          {row.batch && (
            <p className="text-[10px] text-gray-400 font-semibold">{row.batch}</p>
          )}
        </div>
      ),
    },
    {
      header: 'CUSTOMER',
      key: 'customer',
      render: (row) => <span className="font-semibold text-gray-800">{row.customer}</span>,
    },
    {
      header: 'DATE',
      key: 'date',
      render: (row) => <span className="text-gray-500 text-xs">{row.date}</span>,
    },
    {
      header: 'TYPE',
      key: 'type',
      render: (row) => <span className="text-xs text-gray-600 font-medium">{row.type}</span>,
    },
    {
      header: 'FULFILLMENT',
      key: 'fulfillment',
      render: (row) => {
        const isCourier = row.fulfillment?.toLowerCase().includes('courier') || row.fulfillment?.toLowerCase().includes('delivery')
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-700 font-medium">{row.fulfillment}</span>
            {isCourier && (
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[9px] font-bold flex items-center gap-1" title="Delivery fee paid / Courier locked">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-2.5 h-2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <span>Locked</span>
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'STATUS',
      key: 'status',
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      header: 'TOTAL',
      key: 'total',
      render: (row) => (
        <span className="font-bold text-gray-900 text-xs">
          ₱{(Number(row?.total) || 0).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'ACTION',
      key: 'actions',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveOrderDetail(row)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="View Details"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Compacted Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Orders
            </h1>
            <p className="text-xs font-normal text-slate-500 mt-0.5">
              Manage and track all online and in-store sales.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-md border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>

            {selectedOrderIds.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBulkModal(true)}
                className="h-8 px-3 bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold text-xs rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>Bulk Update ({selectedOrderIds.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="TOTAL ORDERS"
            value={totalOrders}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            }
          />
          <StatCard
            title="PRE-ORDERS"
            value={preOrdersCount}
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
            value={readyPickupCount}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            }
            iconBg="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            title="COMPLETED"
            value={completedCount}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            }
            iconBg="bg-blue-50 text-blue-600"
          />
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="search"
                placeholder="Search orders, customers, batch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-8 pr-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:bg-white focus:ring-1 focus:ring-brand-orange"
              />
            </div>

            {/* Type Dropdown */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-8 px-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="All">Type: All</option>
              <option value="Regular">Online Regular</option>
              <option value="Pre-order">Online Pre-order</option>
              <option value="Onsite Regular">Onsite Regular</option>
            </select>

            {/* Fulfillment Dropdown */}
            <select
              value={filterFulfillment}
              onChange={(e) => setFilterFulfillment(e.target.value)}
              className="h-8 px-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="All">Fulfillment: All</option>
              <option value="Courier">Courier</option>
              <option value="Store Pickup">Store Pickup</option>
              <option value="Instant POS">Instant POS</option>
            </select>

            {/* Batch Dropdown */}
            <select
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value)}
              className="h-8 px-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="All">Batch: All</option>
              <option value="BAT-0012">BAT-0012</option>
              <option value="BAT-0013">BAT-0013</option>
              <option value="BAT-0014">BAT-0014</option>
              <option value="BAT-0015">BAT-0015</option>
              <option value="BAT-0016">BAT-0016</option>
              <option value="BAT-0017">BAT-0017</option>
            </select>

            {/* Status Dropdown */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-8 px-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="All">Status: All</option>
              <option value="In Production">In Production</option>
              <option value="Awaiting Production">Awaiting Production</option>
              <option value="Preparing">Preparing</option>
              <option value="Ready for Pickup">Ready for Pickup</option>
              <option value="Completed">Completed</option>
            </select>

            {/* Clear Filters Button */}
            {(searchQuery || activeChips.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setFilterType('All')
                  setFilterFulfillment('All')
                  setFilterBatch('All')
                  setFilterStatus('All')
                }}
                className="text-xs font-semibold text-rose-600 hover:underline px-2 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Applied Filter Chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                APPLIED:
              </span>
              {activeChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 text-brand-orange text-[11px] font-semibold border border-orange-200/60"
                >
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.reset}
                    className="hover:text-rose-600 font-bold cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredOrders}
          keyField="id"
          selectable={true}
          selectedIds={selectedOrderIds}
          onSelectionChange={setSelectedOrderIds}
          defaultPageSize={10}
        />
      </div>

      {/* Order Details Drawer */}
      <DrawerPanel
        isOpen={!!activeOrderDetail}
        onClose={() => setActiveOrderDetail(null)}
        title={activeOrderDetail ? `Order ${activeOrderDetail.id}` : ''}
        subtitle={activeOrderDetail ? `Placed: ${activeOrderDetail.date}` : ''}
      >
        {activeOrderDetail && (
          <div className="space-y-6 text-xs">
            {/* Status changer */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
              <p className="font-bold text-gray-600 uppercase text-[10px] tracking-wider">
                Update Order Status
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={activeOrderDetail.status}
                  onChange={(e) => {
                    updateOrderStatus(activeOrderDetail.id, e.target.value)
                    setActiveOrderDetail({
                      ...activeOrderDetail,
                      status: e.target.value,
                    })
                  }}
                  className="flex-1 p-2 bg-white border border-gray-200 rounded-xl font-bold text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-orange"
                >
                  <option value="Awaiting Production">Awaiting Production</option>
                  <option value="In Production">In Production</option>
                  <option value="Preparing">Preparing</option>
                  <option value="Ready for Pickup">Ready for Pickup</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Customer Details & Fulfillment Lock Status */}
            <div className="space-y-2">
              <h4 className="font-black text-gray-900 text-sm">Customer &amp; Fulfillment Info</h4>
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 space-y-2.5">
                <div>
                  <p className="font-bold text-gray-900">{activeOrderDetail.customer}</p>
                  <p className="text-gray-500">Order Type: {activeOrderDetail.type}</p>
                  {activeOrderDetail.batch && (
                    <p className="text-gray-500">Batch Code: {activeOrderDetail.batch}</p>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-200/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-700">Fulfillment Method</span>
                    {activeOrderDetail.fulfillment?.toLowerCase().includes('courier') || activeOrderDetail.fulfillment?.toLowerCase().includes('delivery') ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-black uppercase">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-2.5 h-2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        <span>Delivery Locked</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">
                        Store Pickup
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 font-semibold">{activeOrderDetail.fulfillment}</p>
                  {(activeOrderDetail.fulfillment?.toLowerCase().includes('courier') || activeOrderDetail.fulfillment?.toLowerCase().includes('delivery')) && (
                    <div className="text-[11px] text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200/80 mt-1 space-y-0.5">
                      <p className="font-bold flex items-center gap-1">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3 text-amber-900"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        <span>Method Locked</span>
                      </p>
                      <p className="text-amber-800">
                        Delivery fee paid or Lalamove courier dispatch confirmed. The fulfillment method can no longer be switched to Store Pickup.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ordered Items */}
            <div className="space-y-2">
              <h4 className="font-black text-gray-900 text-sm">Ordered Items</h4>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                {(activeOrderDetail.items || []).map((item, idx) => (
                  <div key={idx} className="p-3 bg-white flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-900">{item.name}</p>
                      <p className="text-gray-400 text-[10px]">
                        Qty: {item.qty} {item.size ? `• Size: ${item.size}` : ''}
                      </p>
                    </div>
                    <span className="font-black text-gray-900">
                      ₱{((Number(item?.price) || 0) * (Number(item?.qty) || 1)).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total breakdown */}
            <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-200/60 flex justify-between items-center text-sm font-black text-gray-900">
              <span>Grand Total</span>
              <span className="text-brand-orange text-base font-black">
                ₱{(Number(activeOrderDetail?.total) || 0).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </DrawerPanel>

      {/* Bulk Update Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-lg p-4 max-w-sm w-full border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Bulk Update ({selectedOrderIds.length} Orders)
            </h3>
            <p className="text-xs text-slate-500">
              Select a new status to apply to all selected orders.
            </p>
            <select
              value={bulkNewStatus}
              onChange={(e) => setBulkNewStatus(e.target.value)}
              className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-orange"
            >
              <option value="Awaiting Production">Awaiting Production</option>
              <option value="In Production">In Production</option>
              <option value="Preparing">Preparing</option>
              <option value="Ready for Pickup">Ready for Pickup</option>
              <option value="Completed">Completed</option>
            </select>
            <div className="flex justify-end gap-2 pt-1.5">
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                className="h-8 px-3 bg-slate-100 rounded-md text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkUpdate}
                className="h-8 px-3 bg-brand-orange rounded-md text-xs font-semibold text-white hover:bg-brand-orange-dark cursor-pointer"
              >
                Apply to {selectedOrderIds.length} Orders
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
