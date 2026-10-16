import { useState, useMemo, useEffect, useCallback } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'
import StatCard from '../../components/admin/StatCard.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import DataTable from '../../components/admin/DataTable.jsx'
import DrawerPanel from '../../components/admin/DrawerPanel.jsx'
import { searchOrders, sortOrders } from '../../services/orders.js'
import {
  mapOrderRows,
  isCartRow,
  titleCaseStatus,
  parseDate,
} from '../../services/dashboard.js'

// SRS order status vocabulary (staff dashboard / REQ-SD-02) - the statuses a
// staff member may set on an order (ORDER STATE MACHINE, OrdersAPI).
const STATUS_OPTIONS = [
  'To Process',
  'To Claim',
  'To Receive',
  'Claimed',
  'Unclaimed',
  'Cancelled',
  'Returned',
  'Refunded',
]

/**
 * Every display status a row can carry (mapOrderRow), so the Status filter can
 * also surface states that are system- or customer-set and therefore never
 * appear in STATUS_OPTIONS: the cancel/return requests (FLOW-MANAGE_PRE-05),
 * RECEIVED and PAID. Filtering only; nothing here is written back to an order.
 */
const FILTER_STATUS_OPTIONS = [
  'Processing',
  'To Process',
  'To Claim',
  'To Receive',
  'Claimed',
  'Received',
  'Unclaimed',
  'Cancel Requested',
  'Return Requested',
  'Cancelled',
  'Returned',
  'Refunded',
  'Paid',
]

// The customer orders list labels TO PROCESS as "Processing"; accept that
// spelling so a staff filter and a customer status line agree.
const STATUS_FILTER_ALIASES = {
  Processing: ['To Process'],
}

// Sort select choices - backed by GET /cart/sort (sort_by: date|status|id)
const SORT_OPTIONS = [
  { value: 'date:desc', label: 'Sort: Newest first', sortBy: 'date', dir: 'desc' },
  { value: 'date:asc', label: 'Sort: Oldest first', sortBy: 'date', dir: 'asc' },
  { value: 'status:asc', label: 'Sort: Status A-Z', sortBy: 'status', dir: 'asc' },
  { value: 'id:asc', label: 'Sort: Order ID (low to high)', sortBy: 'id', dir: 'asc' },
]

const REFRESH_MS = 30000

function sortClientSide(rows, sortValue) {
  const [sortBy, dir] = String(sortValue).split(':')
  const factor = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (sortBy === 'status') return factor * String(a.rawStatus).localeCompare(String(b.rawStatus))
    if (sortBy === 'id') return factor * ((a.ordId || 0) - (b.ordId || 0))
    const at = parseDate(a.createdAt)?.getTime() ?? 0
    const bt = parseDate(b.createdAt)?.getTime() ?? 0
    return factor * (at - bt)
  })
}

export default function AdminOrders() {
  const { orders: rawOrders = [], refreshOrders, updateOrderStatus, products = [] } = useAdmin()
  const { showToast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [sortValue, setSortValue] = useState('date:desc')
  const [filterType, setFilterType] = useState('All')
  const [filterFulfillment, setFilterFulfillment] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterItem, setFilterItem] = useState('All')
  const [selectedOrderIds, setSelectedOrderIds] = useState([])

  const [activeOrderDetail, setActiveOrderDetail] = useState(null)
  const [adminTab, setAdminTab] = useState('orders')
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkNewStatus, setBulkNewStatus] = useState('To Process')
  // Type / Fulfillment / Item are secondary to search, sort and status, so
  // they open on demand instead of crowding the default toolbar. Their state
  // still shows as chips, so nothing hidden ever becomes invisible.
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)

  // Server-backed search (/cart/search) and sort (/cart/sort) results.
  // null = fall back to the shared order list from AdminContext.
  const [searchRows, setSearchRows] = useState(null)
  const [sortedRows, setSortedRows] = useState(null)

  const orders = useMemo(() => mapOrderRows(rawOrders), [rawOrders])

  // Keep the order list fresh on mount and every 30s (REQ-SD-02).
  useEffect(() => {
    refreshOrders()
    const timer = setInterval(refreshOrders, REFRESH_MS)
    return () => clearInterval(timer)
  }, [refreshOrders])

  // Debounced server-side search. The empty-query reset happens in the input's
  // onChange (an event handler), never synchronously inside this effect.
  useEffect(() => {
    const query = searchQuery.trim()
    if (!query) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      searchOrders(query)
        .then((res) => {
          if (cancelled) return
          setSearchRows(mapOrderRows((res?.data || []).filter((row) => !isCartRow(row))))
        })
        .catch(() => {
          if (!cancelled) setSearchRows([])
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  // Server-side sort (skipped while a search result set is on screen - those
  // rows are sorted locally with the same criteria). The default-sort reset is
  // done in the select's onChange handler, not here.
  useEffect(() => {
    if (searchQuery.trim()) return undefined
    const option = SORT_OPTIONS.find((o) => o.value === sortValue) || SORT_OPTIONS[0]
    if (option.sortBy === 'date' && option.dir === 'desc') return undefined
    let cancelled = false
    sortOrders(option.sortBy, option.dir)
      .then((res) => {
        if (!cancelled) setSortedRows(mapOrderRows((res?.data || []).filter((row) => !isCartRow(row))))
      })
      .catch(() => {
        if (!cancelled) setSortedRows(null)
      })
    return () => {
      cancelled = true
    }
  }, [sortValue, searchQuery])

  const totalOrders = orders.length
  const preOrdersCount = orders.filter((o) => o.preorder).length
  const readyPickupCount = orders.filter((o) => o.rawStatus === 'TO CLAIM').length
  const completedCount = orders.filter((o) => o.rawStatus === 'CLAIMED').length

  // Every distinct product name that appears in any order, for the Item filter.
  const itemOptions = useMemo(() => {
    const names = new Set()
    orders.forEach((o) => (o.items || []).forEach((i) => i?.name && names.add(i.name)))
    ;(products || []).forEach((p) => p?.name && names.add(p.name))
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [orders, products])

  const activeChips = useMemo(() => {
    const chips = []
    if (filterType !== 'All') chips.push({ key: 'type', label: `Type: ${filterType}`, reset: () => setFilterType('All') })
    if (filterFulfillment !== 'All') chips.push({ key: 'fulfillment', label: `Fulfillment: ${filterFulfillment}`, reset: () => setFilterFulfillment('All') })
    if (filterStatus !== 'All') chips.push({ key: 'status', label: `Status: ${filterStatus}`, reset: () => setFilterStatus('All') })
    if (filterItem !== 'All') chips.push({ key: 'item', label: `Item: ${filterItem}`, reset: () => setFilterItem('All') })
    return chips
  }, [filterType, filterFulfillment, filterStatus, filterItem])

  const filteredOrders = useMemo(() => {
    const base = searchRows ?? sortedRows ?? orders
    const rows = base.filter((order) => {
      const matchType =
        filterType === 'All' ||
        (filterType === 'Pre-order' && order.type?.toLowerCase().includes('pre-order')) ||
        (filterType === 'Regular' && order.type?.toLowerCase().includes('regular')) ||
        order.type === filterType

      const matchFulfillment =
        filterFulfillment === 'All' ||
        order.fulfillment?.toLowerCase().includes(filterFulfillment.toLowerCase())

      const matchStatus =
        filterStatus === 'All' ||
        (STATUS_FILTER_ALIASES[filterStatus] || [filterStatus]).includes(order.status)

      const matchItem =
        filterItem === 'All' ||
        (order.items || []).some((i) => i?.name?.toLowerCase() === filterItem.toLowerCase())

      return matchType && matchFulfillment && matchStatus && matchItem
    })

    // Server search always returns newest-first; honour the sort select there.
    return searchRows ? sortClientSide(rows, sortValue) : rows
  }, [orders, searchRows, sortedRows, sortValue, filterType, filterFulfillment, filterStatus, filterItem])

  // "Refunds" subtab (admin "Orders" tab): only return/refund rows.
  const REFUND_STATUSES = ['RETURN REQUESTED', 'RETURNED', 'REFUNDED']
  const visibleOrders = useMemo(() => {
    if (adminTab !== 'refunds') return filteredOrders
    return filteredOrders.filter((order) =>
      REFUND_STATUSES.includes(String(order.rawStatus || '').toUpperCase())
    )
  }, [filteredOrders, adminTab])

  const applyStatus = useCallback(
    async (order, nextStatus) => {
      setActionBusy(true)
      const result = await updateOrderStatus(order.ordId, nextStatus)
      setActionBusy(false)
      if (result.success) {
        setActiveOrderDetail({
          ...order,
          rawStatus: String(nextStatus).toUpperCase(),
          status: titleCaseStatus(nextStatus),
        })
        showToast(`${order.id} is now ${titleCaseStatus(nextStatus)}.`, 'success')
      } else {
        showToast(result?.error || 'Failed to update the order.', 'error')
      }
      return result
    },
    [updateOrderStatus, showToast]
  )

  const handleBulkUpdate = useCallback(async () => {
    setActionBusy(true)
    let updated = 0
    let lastError = ''
    // selectedOrderIds are display ids ("#ORD-0042"); resolve them to rows.
    const byId = new Map(orders.map((o) => [o.id, o]))
    for (const displayId of selectedOrderIds) {
      const order = byId.get(displayId)
      if (!order) continue
      const res = await updateOrderStatus(order.ordId, bulkNewStatus)
      if (res.success) updated += 1
      else lastError = res.error || ''
    }
    setActionBusy(false)
    setSelectedOrderIds([])
    setShowBulkModal(false)
    if (updated > 0) showToast(`${updated} order${updated > 1 ? 's' : ''} updated to ${titleCaseStatus(bulkNewStatus)}.`, 'success')
    if (lastError) showToast(lastError, 'error')
  }, [orders, selectedOrderIds, bulkNewStatus, updateOrderStatus, showToast])

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
    const link = document.createElement('a')
    link.setAttribute('href', encodeURI(csvContent))
    link.setAttribute('download', `Tindahan_Orders_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const columns = [
    {
      header: 'ORDER ID',
      key: 'id',
      render: (row) => (
        <div>
          <button
            type="button"
            onClick={() => setActiveOrderDetail(row)}
            className="font-semibold text-gray-900 hover:text-brand-orange text-left cursor-pointer"
          >
            {row.id}
          </button>
          {row.batch && <p className="text-2xs text-gray-400 font-medium">{row.batch}</p>}
        </div>
      ),
    },
    {
      header: 'CUSTOMER',
      key: 'customer',
      render: (row) => <span className="font-medium text-gray-800">{row.customer}</span>,
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
        const isCourier =
          row.fulfillment?.toLowerCase().includes('courier') ||
          row.fulfillment?.toLowerCase().includes('delivery')
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-700 font-medium">{row.fulfillment}</span>
            {isCourier && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-3.5 h-3.5 text-slate-400 shrink-0"
                title="Delivery fee paid — fulfillment method locked"
                aria-label="Locked"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
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
        <span className="font-semibold text-gray-900 text-xs">
          ₱{(Number(row?.total) || 0).toFixed(2)}
        </span>
      ),
    },
    {
      header: 'ACTION',
      key: 'actions',
      render: (row) => (
        <button
          type="button"
          onClick={() => setActiveOrderDetail(row)}
          className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
        >
          View details
        </button>
      ),
    },
  ]

  const pendingAction =
    activeOrderDetail &&
    ['CANCEL REQUESTED', 'RETURN REQUESTED'].includes(activeOrderDetail.rawStatus)

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="page-title text-slate-900 dark:text-[var(--ink)]">Orders</h1>
            <p className="text-xs font-normal text-slate-500 mt-0.5">
              Manage and track all online and in-store sales.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="btn btn--secondary"
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
                className="btn btn--primary"
              >
                <span>Bulk update ({selectedOrderIds.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Subtabs: Orders vs Refunds (returns and refunds handled here) */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setAdminTab('orders')}
            className={`px-3 h-8 rounded-md text-xs font-bold transition-colors cursor-pointer ${
              adminTab === 'orders'
                ? 'bg-brand-orange text-white'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('refunds')}
            className={`px-3 h-8 rounded-md text-xs font-bold transition-colors cursor-pointer ${
              adminTab === 'refunds'
                ? 'bg-brand-orange text-white'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Refunds
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            title="Total orders"
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
            title="Pre-orders"
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
            title="Ready for pickup"
            value={readyPickupCount}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            }
            iconBg="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            title="Completed"
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

        {/* Filter bar */}
        <div className="bg-white rounded-lg p-3 border border-slate-200 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
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
                placeholder="Search orders, customers, items, batch..."
                value={searchQuery}
                onChange={(e) => {
                  const value = e.target.value
                  setSearchQuery(value)
                  if (!value.trim()) {
                    // Clearing the search falls back to the sorted/default list.
                    setSearchRows(null)
                    const option = SORT_OPTIONS.find((o) => o.value === sortValue) || SORT_OPTIONS[0]
                    if (option.sortBy === 'date' && option.dir === 'desc') setSortedRows(null)
                  }
                }}
                className="w-full h-8 pl-8 pr-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:bg-white focus:ring-1 focus:ring-brand-orange"
              />
            </div>

            {/* Server-backed sort (/cart/sort) - replaces the old hardcoded Batch filter */}
            <select
              value={sortValue}
              onChange={(e) => {
                const value = e.target.value
                setSortValue(value)
                const option = SORT_OPTIONS.find((o) => o.value === value) || SORT_OPTIONS[0]
                if (option.sortBy === 'date' && option.dir === 'desc') setSortedRows(null)
              }}
              className="h-8 px-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-8 px-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="All">Status: All</option>
              {FILTER_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowMoreFilters((open) => !open)}
              aria-expanded={showMoreFilters}
              className={`h-8 px-2.5 rounded-md border text-xs font-semibold cursor-pointer focus:outline-none ${
                showMoreFilters || filterType !== 'All' || filterFulfillment !== 'All' || filterItem !== 'All'
                  ? 'bg-brand-orange text-white border-brand-orange'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Filters
              {filterType !== 'All' || filterFulfillment !== 'All' || filterItem !== 'All'
                ? ` · ${
                    [filterType, filterFulfillment, filterItem].filter((v) => v !== 'All').length
                  }`
                : ''}
            </button>

            {(searchQuery || activeChips.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSearchRows(null)
                  setFilterType('All')
                  setFilterFulfillment('All')
                  setFilterStatus('All')
                  setFilterItem('All')
                }}
                className="text-xs font-semibold text-rose-600 hover:underline px-2 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {showMoreFilters && (
            <div className="flex flex-wrap items-center gap-2.5 pt-2.5 border-t border-slate-100">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="h-8 px-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="All">Type: All</option>
                <option value="Regular">Online Regular</option>
                <option value="Pre-order">Online Pre-order</option>
                <option value="Onsite Regular">Onsite Regular</option>
              </select>

              <select
                value={filterFulfillment}
                onChange={(e) => setFilterFulfillment(e.target.value)}
                className="h-8 px-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="All">Fulfillment: All</option>
                <option value="Courier">Courier</option>
                <option value="Store Pickup">Store Pickup</option>
                <option value="Instant POS">Instant POS</option>
              </select>

              {/* Product item filter */}
              <select
                value={filterItem}
                onChange={(e) => setFilterItem(e.target.value)}
                className="h-8 px-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none max-w-[190px]"
              >
                <option value="All">Item: All</option>
                {itemOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
              <span className="text-2xs font-medium text-slate-400 uppercase tracking-wider">
                Applied:
              </span>
              {activeChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 text-slate-700 text-2xs font-medium border border-slate-200"
                >
                  <span className="max-w-[160px] truncate">{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.reset}
                    className="hover:text-rose-600 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <DataTable
          columns={columns}
          data={visibleOrders}
          keyField="id"
          selectable
          selectedIds={selectedOrderIds}
          onSelectionChange={setSelectedOrderIds}
          defaultPageSize={10}
          emptyTitle={orders.length === 0 ? 'No orders yet' : 'No orders match your filters'}
          emptyHint={
            orders.length === 0
              ? 'Orders appear here once customers check out or a walk-in sale is rung up.'
              : 'Try clearing the search box or the applied filters above.'
          }
        />
      </div>

      {/* Order details drawer */}
      <DrawerPanel
        isOpen={!!activeOrderDetail}
        onClose={() => setActiveOrderDetail(null)}
        title={activeOrderDetail ? `Order ${activeOrderDetail.id}` : ''}
        subtitle={activeOrderDetail ? `Placed: ${activeOrderDetail.date}` : ''}
      >
        {activeOrderDetail && (
          <div className="space-y-6 text-xs">
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
              <p className="font-semibold text-gray-600 uppercase text-2xs tracking-wider">
                Update order status
              </p>
              <select
                value={activeOrderDetail.status}
                disabled={actionBusy}
                onChange={(e) => applyStatus(activeOrderDetail, e.target.value)}
                className="field-input w-full"
              >
                {(() => {
                  const fulfillment = String(activeOrderDetail.fulfillment || '')
                  const isDelivery =
                    fulfillment.toLowerCase().includes('delivery') ||
                    fulfillment.toLowerCase().includes('courier')
                  const allowedChoices = isDelivery
                    ? [
                        { label: 'Processing', value: 'To Process' },
                        { label: 'In Transit', value: 'Delivering' },
                      ]
                    : [
                        { label: 'Processing', value: 'To Process' },
                        { label: 'To claim', value: 'To Claim' },
                      ]
                  const values = allowedChoices.map((c) => c.value)
                  return (
                    <>
                      {!values.includes(activeOrderDetail.status) && (
                        <option value={activeOrderDetail.status}>{activeOrderDetail.status}</option>
                      )}
                      {allowedChoices.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </>
                  )
                })()}
              </select>

              {pendingAction && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() =>
                      applyStatus(
                        activeOrderDetail,
                        activeOrderDetail.rawStatus === 'CANCEL REQUESTED'
                          ? 'Cancelled'
                          : 'Returned'
                      )
                    }
                    className="btn btn--primary flex-1"
                  >
                    Approve {activeOrderDetail.rawStatus === 'CANCEL REQUESTED' ? 'cancel' : 'return'}
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() =>
                      applyStatus(
                        activeOrderDetail,
                        activeOrderDetail.rawStatus === 'CANCEL REQUESTED'
                          ? 'To Process'
                          : 'To Process'
                      )
                    }
                    className="btn btn--secondary flex-1"
                  >
                    Reject request
                  </button>
                </div>
              )}

              <p className="text-2xs text-gray-400 pt-1">
                Status changes are saved on the server and the list re-syncs automatically.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-gray-900 text-sm">Customer &amp; fulfillment info</h4>
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 space-y-2.5">
                <div>
                  <p className="font-semibold text-gray-900">{activeOrderDetail.customer}</p>
                  <p className="text-gray-500">Order type: {activeOrderDetail.type}</p>
                  {activeOrderDetail.custPhone && (
                    <p className="text-gray-500">Contact: {activeOrderDetail.custPhone}</p>
                  )}
                  {activeOrderDetail.batch && (
                    <p className="text-gray-500">Batch code: {activeOrderDetail.batch}</p>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-200/60 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700">Fulfillment method</span>
                    {activeOrderDetail.fulfillment?.toLowerCase().includes('courier') ||
                    activeOrderDetail.fulfillment?.toLowerCase().includes('delivery') ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-2xs font-medium">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <span>Delivery locked</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-2xs font-medium">
                        Store pickup
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 font-medium">{activeOrderDetail.fulfillment}</p>
                  {(activeOrderDetail.fulfillment?.toLowerCase().includes('courier') ||
                    activeOrderDetail.fulfillment?.toLowerCase().includes('delivery')) && (
                    <div className="text-2xs text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200/80 mt-1 space-y-0.5">
                      <p className="font-semibold">Method locked</p>
                      <p className="text-amber-800">
                        Delivery fee paid or courier dispatch confirmed. The fulfillment method can no
                        longer be switched to store pickup.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-gray-900 text-sm">Payment</h4>
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-700">Payment method</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {activeOrderDetail.paymentMethod}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-700">Amount due</span>
                  <span className="text-sm font-semibold text-gray-800">
                    ₱{(Number(activeOrderDetail.payDue) || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-700">Amount received</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {activeOrderDetail.payGiven != null
                      ? `₱${Number(activeOrderDetail.payGiven).toFixed(2)}`
                      : 'Not paid yet'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-700">Change</span>
                  <span className="text-sm font-semibold text-gray-800">
                    {activeOrderDetail.payChange != null
                      ? `₱${Number(activeOrderDetail.payChange).toFixed(2)}`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-2 pt-1 border-t border-gray-200/60">
                  <span className="font-semibold text-gray-700 shrink-0">Payment reference</span>
                  <span className="font-mono text-[11px] text-gray-500 break-all text-right">
                    {activeOrderDetail.payRef || '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-gray-900 text-sm">Ordered items</h4>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                {(activeOrderDetail.items || []).map((item, idx) => (
                  <div key={idx} className="p-3 bg-white flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{item.name}</p>
                      <p className="text-gray-400 text-2xs">
                        Qty: {item.qty} {item.category ? `• ${item.category}` : ''}
                      </p>
                    </div>
                    <span className="font-semibold text-gray-900">
                      ₱{(Number(item?.lineTotal) || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
                {(activeOrderDetail.items || []).length === 0 && (
                  <p className="p-3 bg-white text-gray-400 text-xs">No items recorded.</p>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center text-sm font-bold text-gray-900">
              <span>Grand total</span>
              <span className="text-base">
                ₱{(Number(activeOrderDetail?.total) || 0).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </DrawerPanel>

      {/* Bulk update modal — the shared popup shell (index.css primitives). */}
      {showBulkModal && (
        <Modal
          isOpen={showBulkModal}
          onClose={() => setShowBulkModal(false)}
          title={`Bulk update (${selectedOrderIds.length} orders)`}
          subtitle="Select a new status to apply to all selected orders."
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowBulkModal(false)} className="px-3.5">
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={actionBusy}
                onClick={handleBulkUpdate}
                className="px-3.5"
              >
                Apply to {selectedOrderIds.length} orders
              </Button>
            </>
          }
        >
          <label className="field-label" htmlFor="bulk-status">
            New order status
          </label>
          <select
            id="bulk-status"
            value={bulkNewStatus}
            onChange={(e) => setBulkNewStatus(e.target.value)}
            className="field-input"
          >
            {['To Process', 'To Claim', 'To Receive', 'Cancelled'].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Modal>
      )}
    </AdminLayout>
  )
}
