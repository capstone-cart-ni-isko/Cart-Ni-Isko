/*
 * Shared new-schema helpers for the admin portal.
 *
 * The backend answers with the NEW column names as canonical and also
 * emits the legacy aliases the old UI read. Every accessor below prefers
 * the new name and falls back to the legacy alias, so the portal works
 * against either response shape.
 */

/** First non-empty value among the given field names. */
export function first(row, ...names) {
  if (!row) return null
  for (const name of names) {
    const value = row[name]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

export function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

/* ── Employee ─────────────────────────────────────────────────────── */

/** emp_categ (canonical) with the legacy emp_type fallback, lower-cased. */
export function empCateg(row) {
  return String(first(row, 'emp_categ', 'emp_type') || 'staff').trim().toLowerCase()
}

export function isSuperAdminRow(row) {
  return empCateg(row) === 'super admin' || empCateg(row) === 'super_admin' || empCateg(row) === 'superadmin'
}

export function isAdminRow(row) {
  const categ = empCateg(row)
  return categ === 'admin' || categ === 'super admin' || categ === 'super_admin'
}

/**
 * REQ-EMP_HOME-01 - is this employee a regular staff member?
 *
 * `roleKey` (set by mapEmployee) is authoritative when present; otherwise the
 * category decides, defaulting to 'staff' so an unidentified employee is
 * treated with the least privilege rather than the most.
 */
export function empIsStaff(row) {
  if (!row) return true
  const key = String(row.roleKey || '').toUpperCase()
  if (key) return key === 'STAFF'
  return empCateg(row) === 'staff'
}

/**
 * Where the ribbon's "home" icon and the post-login redirect take this
 * employee.
 *
 * FLOW-EMP_HOME-06 sends every employee to "the home page", but
 * REQ-EMP_HOME-01 forbids the Dashboard icon/label from ever showing to
 * staff - so a staff member's home is the first screen they are actually
 * allowed to open: the Orders board. Keeping it in one helper is what stops
 * the login screen, the ribbon, the route guard and the sidebar from
 * disagreeing and bouncing staff back into the dashboard.
 */
export function empHomePath(row) {
  return empIsStaff(row) ? '/admin/orders' : '/admin/dashboard'
}

export function empFullName(row) {
  const given = String(first(row, 'emp_givname') || '')
  const surname = String(first(row, 'emp_surname') || '')
  return `${given} ${surname}`.trim() || String(first(row, 'emp_email') || 'Unnamed employee')
}

/** Active = not deleted and not suspended. */
export function empIsActive(row) {
  return !first(row, 'emp_deleted') && !first(row, 'emp_suspended', 'emp_disabled')
}

export function empStatus(row) {
  if (first(row, 'emp_deleted')) return 'deleted'
  if (first(row, 'emp_suspended', 'emp_disabled')) return 'suspended'
  return 'active'
}

/* ── Product / prodvar ────────────────────────────────────────────── */

/**
 * Sum of prodvar_stock. The backend may pre-aggregate this into
 * `total_stock` / `prod_qty`; otherwise the `variations` array of
 * prodvar rows is summed client-side.
 */
export function productStock(row) {
  const pre = first(row, 'total_stock', 'prod_qty', 'stock')
  if (pre !== null && pre !== undefined) return toNumber(pre)
  const variations = Array.isArray(row?.variations) ? row.variations : []
  return variations.reduce((sum, v) => sum + toNumber(first(v, 'prodvar_stock')), 0)
}

export function productVariations(row) {
  if (Array.isArray(row?.variations)) return row.variations
  if (Array.isArray(row?.prodvars)) return row.prodvars
  return []
}

/** A product is visible in the catalog while prod_disabled/prod_deleted are null. */
export function productIsActive(row) {
  return !first(row, 'prod_disabled') && !first(row, 'prod_deleted')
}

export function productStatus(row) {
  return productIsActive(row) ? 'active' : 'disabled'
}

/* ── Order ────────────────────────────────────────────────────────── */

export function orderStatus(row) {
  return String(first(row, 'ord_status', 'status') || 'processing').toLowerCase()
}

/**
 * Preorder vs walk-in: an order WITH a pickup or delivery row is a
 * preorder; an order with neither is a walk-in.
 */
export function orderIsPreorder(row) {
  return !!(row?.pickup || row?.delivery || row?.pickup_id || row?.deliver_id)
}

/* ── Review ───────────────────────────────────────────────────────── */

/** rev_approved IS NULL = pending, NOT NULL = approved. Rejected rows carry a [REJECTED] prefix. */
export function reviewStatus(row) {
  const msg = String(first(row, 'rev_msg', 'message', 'ord_review') || '')
  const approved = first(row, 'rev_approved')
  if (approved === null || approved === undefined) {
    return msg.startsWith('[REJECTED]') ? 'rejected' : 'pending'
  }
  return 'approved'
}

/** The rating is stored as a leading '<rating>|<message>' token in rev_msg. */
export function reviewRating(row) {
  const direct = first(row, 'rating', 'ord_rating')
  if (direct !== null && direct !== undefined && direct !== '') {
    const num = Number(direct)
    if (Number.isFinite(num)) return num
  }
  const msg = String(first(row, 'rev_msg', 'ord_review') || '')
  const match = msg.match(/^\s*(\d)\s*\|/)
  return match ? Number(match[1]) : 0
}

/** Message with the leading rating token and the [REJECTED] prefix stripped. */
export function reviewMessage(row) {
  let msg = String(first(row, 'rev_msg', 'ord_review', 'message') || '')
  msg = msg.replace(/^\s*\d\s*\|/, '').trim()
  if (msg.startsWith('[REJECTED]')) msg = msg.slice('[REJECTED]'.length).trim()
  return msg
}

/* ── Appointment ──────────────────────────────────────────────────── */

export function appointType(row) {
  return String(first(row, 'appoint_type', 'type') || 'visit').toLowerCase()
}

export function appointStatus(row) {
  return String(first(row, 'appoint_status', 'status') || 'upcoming').toLowerCase()
}

/* ── Schedule ─────────────────────────────────────────────────────── */

export function scheduleDisabled(row) {
  return !!first(row, 'sched_disabled')
}

/* ── Dates / times ────────────────────────────────────────────────── */

export function fmtDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export function fmtMoney(value) {
  const num = toNumber(value)
  return `₱${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 'YYYY-MM-DD' local date key for a Date. */
export function dayKey(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local 'YYYY-MM-DDTHH:MM' for datetime-local inputs. */
export function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Case-insensitive containment across several fields. */
export function matchesQuery(row, query, fields) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  return fields.some((field) => String(row?.[field] ?? '').toLowerCase().includes(q))
}
