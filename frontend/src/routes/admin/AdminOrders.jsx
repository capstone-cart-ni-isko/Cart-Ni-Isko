import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'
import StatCard from '../../components/admin/StatCard.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import DataTable from '../../components/admin/DataTable.jsx'
import DrawerPanel from '../../components/admin/DrawerPanel.jsx'
import DigitalReceipt from '../../components/ui/DigitalReceipt.jsx'
import { StatCardsSkeleton } from '../../components/admin/kit/AdminSkeleton.jsx'
import { searchOrders, sortOrders } from '../../services/orders.js'
import { getImageUrl } from '../../utils/imageUtils.js'
import {
  mapOrderRows,
  isCartRow,
  titleCaseStatus,
  parseDate,
} from '../../services/dashboard.js'

const REFUND_STATUSES = ['RETURN REQUESTED', 'RETURNED', 'REFUNDED']

/**
 * Every display status a row can carry (mapOrderRow), so the Status filter can
 * also surface states that are system- or customer-set and therefore never
 * appear in STATUS_OPTIONS: the cancel/return requests (FLOW-MANAGE_PRE-05),
 * RECEIVED and PAID. Filtering only; nothing here is written back to an order.
 */
const FILTER_STATUS_OPTIONS = [
  'Awaiting Payment',
  'Processing',
  'To Process',
  'To Claim',
  'Ready to Ship',
  'To Receive',
  'In Transit',
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
  'Ready to Ship': ['Ready to Ship'],
  'In Transit': ['In Transit', 'Delivering', 'To Receive'],
}

// Sort select choices - backed by GET /cart/sort (sort_by: date|status|id)
const SORT_OPTIONS = [
  { value: 'date:desc', label: 'Sort: Newest first', sortBy: 'date', dir: 'desc' },
  { value: 'date:asc', label: 'Sort: Oldest first', sortBy: 'date', dir: 'asc' },
  { value: 'status:asc', label: 'Sort: Status A-Z', sortBy: 'status', dir: 'asc' },
  { value: 'id:asc', label: 'Sort: Order ID (low to high)', sortBy: 'id', dir: 'asc' },
]

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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { orders: rawOrders = [], ordersLoading, refreshOrders, updateOrderStatus, products = [] } = useAdmin()
  const { showToast } = useToast()

  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '')

  useEffect(() => {
    const q = searchParams.get('search')
    if (q !== null && q !== undefined) {
      setSearchQuery(q)
    }
  }, [searchParams])
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
  const [confirmStatusModal, setConfirmStatusModal] = useState(null) // { order, nextStatus }
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

  // Mount refresh; AdminContext owns the single 30s orders poll.
  useEffect(() => {
    refreshOrders()
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

  // Close order detail handler: if user came from notifications, closing redirects back to notifications
  const handleCloseOrderDetail = useCallback(() => {
    setActiveOrderDetail(null)
    if (searchParams.get('from') === 'notifications') {
      navigate('/admin/notifications')
    }
  }, [searchParams, navigate])

  // Automatically open order detail if orderId query param is provided (e.g. from notification click)
  useEffect(() => {
    const targetOrderId = searchParams.get('orderId')
    if (targetOrderId && orders.length > 0 && !activeOrderDetail) {
      const match = orders.find(
        (o) => String(o.id) === String(targetOrderId) || String(o.ordId) === String(targetOrderId)
      )
      if (match) {
        setActiveOrderDetail(match)
      }
    }
  }, [searchParams, orders, activeOrderDetail])

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
        <div className="leading-tight">
          <span className="font-semibold text-gray-900 text-xs">
            ₱{(Number(row?.grandTotal ?? row?.total) || 0).toFixed(2)}
          </span>
          {row?.deliveryFee > 0 && (
            <span className="block text-2xs text-[var(--muted)] whitespace-nowrap">
              incl. ₱{Number(row.deliveryFee).toFixed(2)} delivery fee
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'ACTION',
      key: 'actions',
      render: (row) => {
        const isCourier =
          row.fulfillment?.toLowerCase().includes('courier') ||
          row.fulfillment?.toLowerCase().includes('delivery')
        const raw = String(row.rawStatus || row.status || '').toUpperCase()
        const isProcessing = raw === 'PROCESSING' || raw === 'TO PROCESS'

        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {isCourier && isProcessing && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => applyStatus(row, 'Ready to Ship')}
                className="h-7 px-2.5 rounded-md bg-brand-orange text-white text-xs font-semibold hover:bg-brand-orange-dark transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
                title="Items are packed: mark Ready to Ship and book the LalaMove courier"
              >
                Ready to Ship
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveOrderDetail(row)}
              className="h-7 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
            >
              View details
            </button>
          </div>
        )
      },
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
          <div className="flex items-center gap-3">
            {searchParams.get('from') === 'notifications' && (
              <button
                type="button"
                onClick={() => navigate('/admin/notifications')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-slate-500">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back to Notifications</span>
              </button>
            )}
            <div>
              <h1 className="page-title text-slate-900 dark:text-[var(--ink)]">Orders</h1>
              <p className="text-xs font-normal text-slate-500 mt-0.5">
                Manage and track all online and in-store sales.
              </p>
            </div>
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
        {ordersLoading && rawOrders.length === 0 ? (
          <StatCardsSkeleton count={4} />
        ) : (
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
        )}

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
          loading={ordersLoading && rawOrders.length === 0 && !searchQuery}
          loadingMessage="Loading orders..."
          emptyTitle={orders.length === 0 ? 'No orders yet' : 'No orders match your filters'}
          emptyHint={
            orders.length === 0
              ? 'Orders appear here once customers check out or a walk-in sale is rung up.'
              : 'Try clearing the search box or the applied filters above.'
          }
        />
      </div>

      {/* Order details popup form */}
      <DrawerPanel
        isOpen={!!activeOrderDetail}
        onClose={handleCloseOrderDetail}
        title={activeOrderDetail ? `Order ${activeOrderDetail.id}` : ''}
        subtitle={activeOrderDetail ? `Placed: ${activeOrderDetail.date}` : ''}
        width="max-w-xl"
        footer={
          <button
            type="button"
            onClick={handleCloseOrderDetail}
            className="btn btn--secondary w-full sm:w-auto"
          >
            Close
          </button>
        }
      >
        {activeOrderDetail && (
          <div className="space-y-4 text-xs">
            {/* Header Hero Banner with order badge & status */}
            <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent border border-orange-500/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white dark:bg-[var(--surface)] text-[var(--ink)] shadow-2xs border border-[var(--line)]">
                      {activeOrderDetail.id}
                    </span>
                    <span className="text-2xs text-[var(--muted)]">
                      Placed {activeOrderDetail.date}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[var(--ink)] tracking-tight">
                    {activeOrderDetail.customer}
                  </h3>
                </div>
                <div className="text-right">
                  <p className="text-2xs uppercase tracking-wider font-semibold text-[var(--muted)]">Grand Total</p>
                  <p className="text-lg font-bold text-brand-orange">
                    ₱{(Number(activeOrderDetail?.grandTotal ?? activeOrderDetail?.total) || 0).toFixed(2)}
                  </p>
                  {activeOrderDetail?.deliveryFee > 0 && (
                    <p className="text-2xs text-[var(--muted)]">
                      Items ₱{(Number(activeOrderDetail.total) || 0).toFixed(2)} + delivery fee ₱{Number(activeOrderDetail.deliveryFee).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Status Manager Card */}
            {(() => {
              const currentStatusNormalized = String(activeOrderDetail.status || activeOrderDetail.rawStatus || '').trim().toLowerCase()
              const isLocked = currentStatusNormalized === 'claimed' || currentStatusNormalized === 'received'

              return (
                <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--line)] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isLocked ? 'bg-emerald-500' : 'bg-brand-orange animate-pulse'}`} />
                      <span className="font-semibold text-[var(--muted)] uppercase text-2xs tracking-wider">
                        {isLocked ? 'Order Status (Completed)' : 'Update Order Status'}
                      </span>
                    </div>
                    <span className={`self-start inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${
                      isLocked
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-brand-orange/10 text-brand-orange border border-brand-orange/20'
                    }`}>
                      {activeOrderDetail.status}
                    </span>
                  </div>

                  {isLocked ? (
                    <div className="flex items-center gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                      <p className="text-2xs font-medium">
                        This order has already been <strong>{activeOrderDetail.status.toLowerCase()}</strong>. The order status is locked and cannot be changed.
                      </p>
                    </div>
                  ) : (
                    <>
                      <select
                        value={activeOrderDetail.status === 'Delivering' ? 'In Transit' : activeOrderDetail.status}
                        disabled={actionBusy}
                        onChange={(e) => {
                          const next = e.target.value
                          if (next !== activeOrderDetail.status && next !== (activeOrderDetail.status === 'Delivering' ? 'In Transit' : activeOrderDetail.status)) {
                            setConfirmStatusModal({ order: activeOrderDetail, nextStatus: next })
                          }
                        }}
                        className="field-input w-full font-semibold text-sm py-2 px-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
                      >
                        {(() => {
                          const fulfillment = String(activeOrderDetail.fulfillment || '')
                          const isDelivery =
                            fulfillment.toLowerCase().includes('delivery') ||
                            fulfillment.toLowerCase().includes('courier')
                          const allowedChoices = isDelivery
                            ? [
                                { label: 'Processing', value: 'To Process' },
                                { label: 'Ready to Ship', value: 'Ready to Ship' },
                                { label: 'In Transit', value: 'In Transit' },
                              ]
                            : [
                                { label: 'Processing', value: 'To Process' },
                                { label: 'To claim', value: 'To Claim' },
                              ]
                          const currentDisplay = activeOrderDetail.status === 'Delivering' ? 'In Transit' : activeOrderDetail.status
                          const values = allowedChoices.map((c) => c.value)
                          return (
                            <>
                              {!values.includes(activeOrderDetail.status) && (
                                <option value={activeOrderDetail.status}>{currentDisplay}</option>
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
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              setConfirmStatusModal({
                                order: activeOrderDetail,
                                nextStatus: activeOrderDetail.rawStatus === 'CANCEL REQUESTED' ? 'Cancelled' : 'Returned',
                              })
                            }
                            className="btn btn--primary flex-1 shadow-2xs hover:shadow-xs py-2 text-xs font-semibold"
                          >
                            Approve {activeOrderDetail.rawStatus === 'CANCEL REQUESTED' ? 'cancel' : 'return'}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() =>
                              setConfirmStatusModal({
                                order: activeOrderDetail,
                                nextStatus: 'To Process',
                              })
                            }
                            className="btn btn--secondary flex-1 py-2 text-xs font-semibold"
                          >
                            Reject request
                          </button>
                        </div>
                      )}

                      <p className="text-2xs text-[var(--muted-2)]">
                        Status changes are confirmed, recorded on the server, and sync in realtime.
                      </p>
                    </>
                  )}
                </div>
              )
            })()}

            {/* Vertically Stacked Customer Details, Fulfillment & Payment Sections (No horizontal 2-column grid, no gray surfaces) */}
            <div className="space-y-3.5">
              {/* Customer Details Card */}
              <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--line)] space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="font-bold text-[var(--ink)] text-sm">Customer Details</span>
                  <span className="self-start text-xs px-2.5 py-0.5 rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] font-medium">
                    {activeOrderDetail.type}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-[var(--muted)] divide-y divide-[var(--line)]">
                  <p className="pt-1"><strong className="text-[var(--ink-2)]">Name:</strong> {activeOrderDetail.customer}</p>
                  {activeOrderDetail.custPhone && (
                    <p className="pt-1.5"><strong className="text-[var(--ink-2)]">Contact:</strong> {activeOrderDetail.custPhone}</p>
                  )}
                  {activeOrderDetail.batch && (
                    <p className="pt-1.5"><strong className="text-[var(--ink-2)]">Batch:</strong> {activeOrderDetail.batch}</p>
                  )}
                </div>
              </div>

              {/* Fulfillment Card */}
              <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--line)] space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                  <span className="font-bold text-[var(--ink)] text-sm">Fulfillment</span>
                  {activeOrderDetail.fulfillment?.toLowerCase().includes('courier') ||
                  activeOrderDetail.fulfillment?.toLowerCase().includes('delivery') ? (
                    <span className="self-start inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-semibold">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <span>Delivery Locked</span>
                    </span>
                  ) : (
                    <span className="self-start inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                      Store Pickup
                    </span>
                  )}
                </div>
                <p className="text-[var(--ink)] font-semibold text-xs sm:text-sm">{activeOrderDetail.fulfillment}</p>
              </div>

              {/* Payment Summary Card */}
              <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--line)] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                  <span className="font-bold text-[var(--ink)] text-sm">Payment Information</span>
                  <span className="self-start text-xs font-semibold text-[var(--ink)] px-2.5 py-0.5 rounded-md border border-[var(--line)] bg-[var(--surface)]">
                    {activeOrderDetail.paymentMethod}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Amount due</span>
                    <span className="font-semibold text-[var(--ink)] text-sm">
                      ₱{(Number(activeOrderDetail.payDue) || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Amount received</span>
                    <span className="font-semibold text-[var(--ink)] text-sm">
                      {activeOrderDetail.payGiven != null && Number(activeOrderDetail.payGiven) > 0
                        ? `₱${Number(activeOrderDetail.payGiven).toFixed(2)}`
                        : !activeOrderDetail.isPos
                          ? `₱${(Number(activeOrderDetail.payDue || activeOrderDetail.total) || 0).toFixed(2)} (Paid Upfront)`
                          : 'Not paid yet'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Change</span>
                    <span className="font-semibold text-[var(--ink)] text-sm">
                      {activeOrderDetail.payChange != null
                        ? `₱${Number(activeOrderDetail.payChange).toFixed(2)}`
                        : '—'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-[var(--line)] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                    <span className="text-[var(--muted)] shrink-0">Reference</span>
                    <span className="font-mono text-xs text-[var(--ink-2)] break-all">
                      {activeOrderDetail.payRef || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ordered Items Section with variation photo and click-to-redirect */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[var(--ink)] text-sm">
                  Ordered Items ({activeOrderDetail.items?.length || 0})
                </h4>
                <span className="text-xs text-[var(--muted)]">Click an item to view product details</span>
              </div>
              <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] overflow-hidden bg-[var(--surface)] shadow-2xs">
                {(activeOrderDetail.items || []).map((item, idx) => {
                  const targetProdId = item.prodId || item.product?.prod_id || item.product?.id
                  const imgSrc = item.image ? getImageUrl(item.image) : ''

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (targetProdId) {
                          setActiveOrderDetail(null)
                          navigate(`/admin/inventory/${targetProdId}`)
                        }
                      }}
                      role={targetProdId ? 'button' : undefined}
                      tabIndex={targetProdId ? 0 : undefined}
                      className={`p-4 flex items-center justify-between gap-3.5 transition-colors ${
                        targetProdId ? 'hover:bg-[var(--surface-2)] cursor-pointer group' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Product Variation Photo */}
                        <div className="w-14 h-14 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-center shrink-0 overflow-hidden relative group-hover:scale-105 transition-transform">
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                                e.currentTarget.nextElementSibling?.classList.remove('hidden')
                              }}
                            />
                          ) : null}
                          <div className={`${imgSrc ? 'hidden' : 'flex'} items-center justify-center w-full h-full text-[var(--muted)]`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-6 h-6">
                              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                              <circle cx="9" cy="9" r="2" />
                              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                            </svg>
                          </div>
                        </div>

                        <div className="space-y-1 min-w-0">
                          <p className="font-bold text-[var(--ink)] text-sm truncate group-hover:text-brand-orange transition-colors">
                            {item.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[var(--muted)] text-xs">
                            {item.prodvarName && (
                              <span className="px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--ink-2)] font-medium">
                                {item.prodvarName}
                              </span>
                            )}
                            <span>Qty: <strong className="text-[var(--ink-2)]">{item.qty}</strong></span>
                            {item.category && <span>• {item.category}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="font-bold text-[var(--ink)] text-base">
                          ₱{(Number(item?.lineTotal) || 0).toFixed(2)}
                        </span>
                        {targetProdId && (
                          <span className="text-[var(--muted)] group-hover:text-brand-orange group-hover:translate-x-0.5 transition-all text-sm">
                            →
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {(activeOrderDetail.items || []).length === 0 && (
                  <p className="p-4 text-center text-[var(--muted)] text-xs">No items recorded.</p>
                )}
              </div>
            </div>

            {/* Digital copy of receipt:
                Rule: receipt must not yet show if the order is for pickup and the order status is not yet "claimed" */}
            {(() => {
              const fulfillmentStr = String(activeOrderDetail.fulfillment || '').toLowerCase()
              const isPickup = fulfillmentStr.includes('pickup') || fulfillmentStr.includes('store')
              const statusStr = String(activeOrderDetail.status || activeOrderDetail.rawStatus || '').toLowerCase()
              const isClaimed = statusStr.includes('claimed')

              if (isPickup && !isClaimed) {
                return (
                  <div className="p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--line)] text-center space-y-1">
                    <p className="font-semibold text-xs text-[var(--ink)]">Digital Receipt Pending</p>
                    <p className="text-2xs text-[var(--muted)]">
                      The official digital receipt is issued once the customer claims their pickup order at the counter.
                    </p>
                  </div>
                )
              }

              return (
                <div className="pt-2">
                  <DigitalReceipt
                    order={activeOrderDetail.raw}
                    customer={activeOrderDetail.customer}
                    alwaysShow={true}
                  />
                </div>
              )
            })()}
          </div>
        )}
      </DrawerPanel>

      {/* Confirmation Modal on top of existing order details popup before changing order status */}
      {confirmStatusModal && (
        <Modal
          isOpen={Boolean(confirmStatusModal)}
          onClose={() => setConfirmStatusModal(null)}
          title="Confirm Status Change"
          subtitle={`Are you sure you want to update ${confirmStatusModal.order?.id}?`}
          size="sm"
          footer={
            <div className="flex items-center justify-end gap-2.5 w-full">
              <Button
                variant="secondary"
                disabled={actionBusy}
                onClick={() => setConfirmStatusModal(null)}
                className="px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={actionBusy}
                onClick={async () => {
                  const target = confirmStatusModal
                  setConfirmStatusModal(null)
                  await applyStatus(target.order, target.nextStatus)
                }}
                className="px-4 py-2 text-xs font-semibold shadow-xs"
              >
                {actionBusy ? 'Updating…' : 'Yes, Update Status'}
              </Button>
            </div>
          }
        >
          <div className="space-y-3 py-1 text-xs">
            <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] space-y-2">
              <div className="flex items-center justify-between text-2xs text-[var(--muted)]">
                <span>Current Status:</span>
                <span className="font-bold text-[var(--ink)] uppercase">
                  {confirmStatusModal.order?.status === 'Delivering' ? 'In Transit' : confirmStatusModal.order?.status}
                </span>
              </div>
              <div className="flex items-center justify-center py-0.5 text-brand-orange">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                  <path d="M12 5v14M19 12l-7 7-7-7" />
                </svg>
              </div>
              <div className="flex items-center justify-between text-2xs text-[var(--muted)]">
                <span>New Status:</span>
                <span className="font-bold text-brand-orange uppercase">
                  {titleCaseStatus(confirmStatusModal.nextStatus)}
                </span>
              </div>
            </div>
            <p className="text-2xs text-[var(--muted)] leading-relaxed">
              This will update the order immediately on the server and notify the customer in realtime.
            </p>
          </div>
        </Modal>
      )}

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
            {[
              { label: 'Processing', value: 'To Process' },
              { label: 'To claim', value: 'To Claim' },
              { label: 'In Transit', value: 'Delivering' },
              { label: 'Cancelled', value: 'Cancelled' },
            ].map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </Modal>
      )}
    </AdminLayout>
  )
}
