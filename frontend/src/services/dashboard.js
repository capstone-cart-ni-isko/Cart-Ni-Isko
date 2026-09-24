/**
 * Admin dashboard & analytics aggregation layer (SRS REQ-SD-01/02/03).
 *
 * The admin console reads live data through the existing read-only services and
 * turns those rows into the shapes the Dashboard / Analytics screens already
 * render. Two rules apply to everything below:
 *
 *  1. Only `src/services/*` talks to the network (all requests go through
 *     api.js and its in-memory Bearer token) - no component ever fetches.
 *  2. The builders are pure, so pages can recompute KPIs on every 30s refresh
 *     without touching component state beyond the fetched rows.
 *
 * NOTE (backend contract): GET /cart/display ignores `exclude_prefix` /
 * `tag_prefix`, so CART- rows (open carts) are split from real orders here,
 * client-side.
 */
import { apiGet } from './api.js'
import { CART_PREFIX } from './cart.js'
import { fetchOrders } from './orders.js'
import { fetchAppointments, fetchSlots, SLOT_RULES } from './appointments.js'
import { fetchAccounts } from './accounts.js'
import { fetchAdminProducts } from './adminProducts.js'

/** Store operating hours used to bucket "Today" sales (08:00 - 18:00). */
const OPEN_HOUR = 8
const CLOSE_HOUR = 18

const MS_DAY = 86400000

/* ───────────────────────────── row mapping ───────────────────────────── */

/** Cart rows are orders still tagged `CART-...` (never shown as real orders). */
export function isCartRow(row) {
  return String(row?.ord_tag || '').toUpperCase().startsWith(String(CART_PREFIX).toUpperCase())
}

/** 'TO CLAIM' -> 'To Claim' (the SRS vocabulary shown in pills and selects). */
export function titleCaseStatus(raw) {
  const value = String(raw || '').trim()
  if (!value) return 'Pending'
  return value
    .toLowerCase()
    .replace(/(^|\s|-)([a-z])/g, (_, pre, ch) => `${pre}${ch.toUpperCase()}`)
}

/**
 * Backend timestamps arrive as `YYYY-MM-DD HH:MM:SS`; parsing that string
 * directly is implementation-defined, so normalise to a local ISO datetime.
 */
export function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const text = String(value).trim()
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text)
    ? text.replace(' ', 'T')
    : text
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateLabel(value) {
  const date = parseDate(value)
  if (!date) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function timeAgoLabel(value) {
  const date = parseDate(value)
  if (!date) return 'Just now'
  const diff = Date.now() - date.getTime()
  if (diff < 60000) return 'Just now'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDateLabel(value)
}

function mapItemRow(item) {
  if (!item) return null
  const qty = Number(item.item_qty) || 0
  const lineTotal = Number(item.item_amount) || 0
  const product = item.product || null
  return {
    prodId: item.prod_id,
    name: product?.prod_name || `Item #${item.prod_id}`,
    qty,
    // item_amount is the LINE TOTAL (price x qty) - derive the unit price.
    price: qty > 0 ? lineTotal / qty : lineTotal,
    lineTotal,
    category: product?.prod_categ || 'Accessories',
    image: (Array.isArray(product?.prod_images) && product.prod_images[0]) || '',
    preorder: isTruthy(product?.prod_preorder),
    product,
  }
}

function isTruthy(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

/**
 * Map a backend `Order::with(['items.product','customer'])` row into the shape
 * every admin orders/fulfillment/dashboard table renders.
 */
export function mapOrderRow(row) {
  if (!row) return null
  const items = (row.items || []).map(mapItemRow).filter(Boolean)
  const total = items.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0)
  const customer = row.customer || null
  const custId = row.cust_id ?? null
  const tag = String(row.ord_tag || `ORD-${row.ord_id}`)
  const rawStatus = String(row.ord_status || '').trim().toUpperCase()
  const isPos = custId === null || custId === undefined || tag.toUpperCase().startsWith('POS-')
  const preorder = /PRE/i.test(tag) || items.some((item) => item.preorder)

  return {
    ordId: row.ord_id,
    id: `#${tag}`,
    tag,
    rawStatus,
    status: titleCaseStatus(rawStatus),
    custId,
    custNickname: customer?.cust_nickname || '',
    custEmail: customer?.cust_email || '',
    custPhone: customer?.cust_phone || '',
    customer:
      customer?.cust_nickname ||
      customer?.cust_email ||
      (isPos ? 'Walk-in Customer' : 'Guest'),
    studentId: 'N/A',
    total,
    items,
    preorder,
    isPos,
    type: isPos ? 'Onsite Regular' : preorder ? 'Online Pre-order' : 'Online Regular',
    fulfillment: isPos ? 'Instant POS' : rawStatus === 'TO RECEIVE' ? 'Courier' : 'Store Pickup',
    paymentMethod: 'Cash',
    createdAt: row.ord_created || null,
    completedAt: row.ord_completed || null,
    date: formatDateLabel(row.ord_created),
    timeAgo: timeAgoLabel(row.ord_created),
    batch: `BAT-${row.ord_id}`,
    raw: row,
  }
}

/** Map a page of backend order rows (safe to call twice on the same array). */
export function mapOrderRows(rows = []) {
  return (rows || []).map(mapOrderRow).filter(Boolean)
}

/* ───────────────────────── date-range helpers ───────────────────────── */

const RANGE_WINDOWS = {
  Today: 1,
  Week: 7,
  Month: 30,
  '7D': 7,
  '30D': 30,
}

/**
 * Window boundaries for a range label.
 * 'Today' = since local midnight; the other labels are rolling windows
 * (Week/'7D' = 7 days, Month/'30D' = 30 days) so the charts always have data.
 * Returns { from, duration } so a caller can also cut the *previous* window.
 */
export function rangeBounds(range = 'Today') {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const duration =
    range === 'Today' ? Math.max(now.getTime() - todayStart, 1) : (RANGE_WINDOWS[range] ?? 1) * MS_DAY
  const from = range === 'Today' ? todayStart : now.getTime() - duration
  return { from, duration }
}

function rowTime(row) {
  const date = parseDate(row?.createdAt ?? row?.ord_created)
  return date ? date.getTime() : null
}

/**
 * Keep orders created inside the selected window.
 * Rows without a parseable date are dropped from ranged views.
 */
export function filterOrdersByRange(rows = [], range = 'Today') {
  const { from, duration } = rangeBounds(range)
  return rows.filter((row) => {
    const time = rowTime(row)
    return time !== null && time >= from && time < from + duration
  })
}

/**
 * '+14% vs last period' style KPI trend: the selected window compared with the
 * window of the same length immediately before it.
 */
export function buildTrendLabel(rows = [], range = 'Today', accessor = (row) => row.total) {
  const { from, duration } = rangeBounds(range)
  let current = 0
  let previous = 0
  rows.forEach((row) => {
    const time = rowTime(row)
    if (time === null) return
    const value = Number(accessor(row)) || 0
    if (time >= from && time < from + duration) current += value
    else if (time >= from - duration && time < from) previous += value
  })

  if (previous === 0) {
    return {
      label: current > 0 ? 'New activity this period' : 'No activity yet',
      positive: true,
      current,
      previous,
    }
  }
  const pct = ((current - previous) / previous) * 100
  return {
    label: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% vs last period`,
    positive: pct >= 0,
    current,
    previous,
  }
}

/** { gross, count, avg } for a set of already-mapped orders. */
export function summarizeSales(rows = []) {
  const count = rows.length
  const gross = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0)
  return { gross, count, avg: count ? gross / count : 0 }
}

/** Count of orders in one SRS status ('TO CLAIM', 'CANCELLED', ...). */
export function countByStatus(rows = [], status) {
  const target = String(status || '').toUpperCase()
  return rows.filter((row) => String(row.rawStatus || '').toUpperCase() === target).length
}

/* ────────────────────────────── builders ─────────────────────────────── */

/**
 * Sales trend buckets for the Sales Overview chart: { date, online, pos, total }.
 * Today -> hourly inside operating hours; Week/'7D' -> daily; Month/'30D' -> 5-day buckets.
 */
export function buildSalesTrend(rows = [], range = 'Today') {
  const buckets = []

  if (range === 'Today') {
    for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour += 1) {
      buckets.push({
        key: `h${hour}`,
        label: new Date(2000, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric' }),
        start: hour,
        match: (date) => date.getHours() === hour,
      })
    }
  } else if (range === 'Month' || range === '30D') {
    const days = 30
    const today = new Date()
    const start = new Date(today.getTime() - (days - 1) * MS_DAY)
    for (let i = 0; i < days; i += 5) {
      const chunkStart = new Date(start.getTime() + i * MS_DAY)
      const chunkEnd = new Date(start.getTime() + (i + 5) * MS_DAY)
      buckets.push({
        key: `d${i}`,
        label: chunkStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        match: (date) => date >= chunkStart && date < chunkEnd,
      })
    }
  } else {
    const days = 7
    const today = new Date()
    const start = new Date(today.getTime() - (days - 1) * MS_DAY)
    for (let i = 0; i < days; i += 1) {
      const dayStart = new Date(start.getTime() + i * MS_DAY)
      const dayEnd = new Date(dayStart.getTime() + MS_DAY)
      buckets.push({
        key: `d${i}`,
        label: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
        match: (date) => date >= dayStart && date < dayEnd,
      })
    }
  }

  return buckets.map((bucket) => {
    let online = 0
    let pos = 0
    rows.forEach((row) => {
      const date = parseDate(row.createdAt)
      if (!date || !bucket.match(date)) return
      if (row.isPos) pos += Number(row.total) || 0
      else online += Number(row.total) || 0
    })
    return { date: bucket.label, online, pos, total: online + pos }
  })
}

/** Sales per product category for the "Sales performance" bars. */
export function buildCategorySales(rows = [], limit = 6) {
  const byCategory = new Map()
  rows.forEach((row) => {
    ;(row.items || []).forEach((item) => {
      const key = item.category || 'Accessories'
      const entry = byCategory.get(key) || { category: key, sales: 0, units: 0 }
      entry.sales += Number(item.lineTotal) || 0
      entry.units += Number(item.qty) || 0
      byCategory.set(key, entry)
    })
  })
  return [...byCategory.values()]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit)
}

/** Best sellers (units sold) joined to the catalog for images/categories. */
export function buildTopProducts(rows = [], products = [], limit = 4) {
  const catalog = new Map((products || []).map((p) => [p.id, p]))
  const byProduct = new Map()

  rows.forEach((row) => {
    ;(row.items || []).forEach((item) => {
      const key = item.name
      const entry = byProduct.get(key) || {
        name: item.name,
        category: item.category || 'Accessories',
        sales: 0,
        revenue: 0,
        image: item.image || catalog.get(`prod-${item.prodId}`)?.image || '',
      }
      entry.sales += Number(item.qty) || 0
      entry.revenue += Number(item.lineTotal) || 0
      byProduct.set(key, entry)
    })
  })

  return [...byProduct.values()].sort((a, b) => b.sales - a.sales).slice(0, limit)
}

/**
 * "Fulfillment overview" bars using the SRS order-status vocabulary.
 * (Backend has no In Production / Preparing / Ready-for-Dispatch statuses, so
 * those legacy mock stages are replaced by the statuses the API really has.)
 */
export function buildFulfillmentStages(rows = []) {
  const defs = [
    { key: 'to_process', label: 'To Process', status: 'TO PROCESS', color: '#94A3B8' },
    { key: 'to_claim', label: 'To Claim', status: 'TO CLAIM', color: '#334155' },
    { key: 'to_receive', label: 'To Receive', status: 'TO RECEIVE', color: '#2563EB' },
    { key: 'claimed', label: 'Claimed', status: 'CLAIMED', color: '#059669' },
    { key: 'unclaimed', label: 'Unclaimed', status: 'UNCLAIMED', color: '#E11D48' },
    {
      key: 'closed',
      label: 'Cancelled / Returned',
      status: ['CANCELLED', 'RETURNED', 'CANCEL REQUESTED', 'RETURN REQUESTED', 'REFUNDED'],
      color: '#475569',
    },
  ]

  return defs.map((def) => {
    const statuses = Array.isArray(def.status) ? def.status : [def.status]
    const count = rows.filter((row) => statuses.includes(String(row.rawStatus || '').toUpperCase())).length
    return {
      key: def.key,
      label: def.label,
      count,
      color: def.color,
      bgClass: '',
    }
  })
}

/**
 * Staff currently inside the store (SRS: employees on duty).
 * `emp_instore` is cast to a boolean by the API; 1 / '1' are accepted too.
 */
export function buildOnDuty(accounts = {}) {
  const employees = accounts.employees || []
  return employees
    .filter((emp) => emp.emp_instore === true || Number(emp.emp_instore) === 1)
    .map((emp) => {
      const name = `${emp.emp_givname || ''} ${emp.emp_surname || ''}`.trim() || emp.emp_email || 'Staff'
      const initials = name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase() || 'ST'
      return {
        id: `emp-${emp.emp_id}`,
        name,
        role: emp.emp_type || 'Staff',
        timeSlot: 'In store now',
        status: 'On Duty',
        avatar: initials,
      }
    })
}

/**
 * Alert centre feed: out-of-stock catalog rows plus every customer cancel /
 * return request that still needs a staff decision (SRS staff dashboard).
 * `dismissedIds` are alert ids the admin has dismissed (persisted in context).
 */
export function buildAlerts(products = [], orders = [], dismissedIds = []) {
  const dismissed = new Set((dismissedIds || []).map(String))
  const alerts = []

  const outOfStock = (products || []).filter((product) => {
    const qty = Number(product.totalStock ?? product.stock ?? product.qty)
    return Number.isFinite(qty) && qty <= 0
  })
  if (outOfStock.length > 0) {
    alerts.push({
      id: 'alt-out-of-stock',
      type: 'out_of_stock',
      title: 'Out of Stock',
      description: `${outOfStock.length} product${outOfStock.length > 1 ? 's are' : ' is'} out of stock`,
      severity: 'danger',
      actionLabel: 'Restock',
      actionType: 'restock',
    })
  }

  const pending = (orders || [])
    .map((row) => (row.rawStatus ? row : mapOrderRow(row)))
    .filter((row) => row && ['CANCEL REQUESTED', 'RETURN REQUESTED'].includes(row.rawStatus))
  pending.forEach((row) => {
    const isCancel = row.rawStatus === 'CANCEL REQUESTED'
    alerts.push({
      id: `alt-${isCancel ? 'cancel' : 'return'}-${row.ordId}`,
      type: isCancel ? 'cancel_requested' : 'return_requested',
      title: isCancel ? 'Cancel Requested' : 'Return Requested',
      description: `${row.id} • ${row.customer} is awaiting approval`,
      severity: 'warning',
      actionLabel: 'Review',
      actionType: 'view_order',
      orderId: row.id,
    })
  })

  return alerts.filter((alert) => !dismissed.has(alert.id))
}

/**
 * Conversion funnel proxy. There is no traffic/analytics endpoint, so:
 *  - visitors        = registered customer accounts (proxy for store visitors)
 *  - addedToCart     = customers that ever reached checkout + open cart rows
 *  - checkouts       = orders completed in the last 30 days
 */
export function buildConversion({ orders = [], cartRows = [], accounts = {} } = {}) {
  const visitors = (accounts.customers || []).length
  const buyers = new Set(
    (orders || []).map((row) => row.custId).filter((id) => id !== null && id !== undefined)
  ).size
  const addedToCart = buyers + (cartRows || []).length
  const checkouts = filterOrdersByRange(orders, '30D').length
  const conversionRate = visitors > 0 ? `${((checkouts / visitors) * 100).toFixed(1)}%` : '0.0%'
  return { visitors, addedToCart, checkouts, conversionRate }
}

/** Normalise GET /accounts/display into { customers, employees }. */
export function normalizeAccounts(payload) {
  if (Array.isArray(payload)) {
    return {
      customers: [],
      employees: payload.filter((row) => row && row.emp_id !== undefined),
    }
  }
  return {
    customers: payload?.customers || [],
    employees: payload?.employees || [],
  }
}

/** Normalise GET /appoint/slots (array or { slots: [...] }) into a list. */
export function normalizeSlots(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.slots)) return payload.slots
  return []
}

/**
 * One parallel pull of everything the dashboard needs (SRS REQ-SD-02 asks for
 * automatic refresh; callers re-run this on an interval).
 *
 * Returns { orders, cartRows, appointments, accounts, products, slots, fetchedAt }
 * with `orders` already mapped through mapOrderRow and CART- rows removed.
 */
export async function fetchDashboardSnapshot(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const today = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

  const [orderRows, cartPayload, appointments, accountsPayload, products, slotsPayload] =
    await Promise.all([
      fetchOrders().catch(() => []),
      apiGet('/cart/display', { tag_prefix: CART_PREFIX }).catch(() => ({ data: [] })),
      fetchAppointments({ scope: 'master' }).catch(() => []),
      fetchAccounts().catch(() => ({ customers: [], employees: [] })),
      fetchAdminProducts().catch(() => []),
      fetchSlots(today).catch(() => null),
    ])

  const accounts = normalizeAccounts(accountsPayload)

  return {
    orders: (orderRows || []).filter((row) => !isCartRow(row)).map(mapOrderRow).filter(Boolean),
    cartRows: ((cartPayload && cartPayload.data) || []).filter((row) => isCartRow(row)),
    appointments: appointments || [],
    accounts,
    products: products || [],
    slots: normalizeSlots(slotsPayload),
    claimCapacity: SLOT_RULES.CLAIM.capacity,
    fetchedAt: Date.now(),
  }
}
