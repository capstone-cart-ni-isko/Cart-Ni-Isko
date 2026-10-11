/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { adminLogin, adminLogout } from '../services/adminAuth.js'
import { getApiToken, setApiToken } from '../services/api.js'
import { clearSession, loadSession, saveSession } from '../services/session.js'
import { useToast } from '../hooks/useToast.js'
import { fetchOrders, updateOrder } from '../services/orders.js'
import { addPosItem, removePosItem, checkoutPos } from '../services/pos.js'
import { fetchAdminProducts, createAdminProduct, updateAdminProduct as updateAdminProductAPI, saveAdminVariant, removeAdminProduct as removeAdminProductAPI, unlistAdminProduct as unlistAdminProductAPI, sellAdminProduct as sellAdminProductAPI } from '../services/adminProducts.js'
import { buildAlerts } from '../services/dashboard.js'

export const AdminContext = createContext(null)

const STORAGE_KEY = 'isko_admin_state_v4'

/** 'prod-12' / 12 / '#CART-12' -> 12 (backend ids are always numeric). */
function toNumericId(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  const numeric = parseInt(digits, 10)
  return Number.isFinite(numeric) ? numeric : null
}

function isSuperAdmin(user) {
  return user?.roleKey === 'SUPER_ADMIN' || user?.role === 'Super Admin'
}

/** Same as toNumericId but understands the mapped catalog ids ('prod-12'). */
const toNumericProductId = (productId) => toNumericId(String(productId).replace('prod-', ''))

/**
 * FLOW-WALKIN-04: a register ticket may hold several variations of the same
 * product (two sizes of one shirt), so a cart line is identified by the
 * variation it points at - `prodvar_id` - and never by the product alone. The
 * backend aggregates same-*variation* rows, so this key is what keeps the
 * server copy and the ticket in step.
 *
 * The local cart used to merge lines by (product, variation NAME) while the
 * server keyed them by (product, prodvar_id). With multi-axis variations two
 * rows can legitimately carry the same name, and a line whose prodvar_id had
 * not resolved yet merged with one that had - the ticket then showed one line
 * where the register held two, and every later sync fought the server over it.
 * One key everywhere fixes both halves.
 */
const posLineKey = (line) => `${line.prodId}:${line.prodvarId ?? ''}`

/** The variation fields the /pos endpoints need to address one exact line. */
const posLineTarget = (line) => ({
  prod_id: line.prodId,
  ...(line.prodvarId != null ? { prodvar_id: line.prodvarId } : {}),
})

export function AdminProvider({ children }) {
  const { showToast } = useToast()

  // ── ADMIN SESSION ──
  // Restored from the staff slot (`isko_staff_session`) so the employee who
  // signed in stays signed in across reloads of the portal - and never from
  // the customer's slot, which rule 71 keeps separate.
  const [currentAdminUser, setCurrentAdminUser] = useState(() => {
    const saved = loadSession('staff')
    if (saved) setApiToken(saved.token, 'staff')
    return saved?.user ?? null
  })

  useEffect(() => {
    if (currentAdminUser) saveSession('staff', getApiToken('staff'), currentAdminUser)
    else clearSession('staff')
  }, [currentAdminUser])

  // Token rejected server-side: end the staff session too. The event names
  // the portal the rejected bearer belonged to (rule 71), so a customer
  // session that 401s never signs the employee out, and an employee token
  // that expires never drops the signed-in customer.
  useEffect(() => {
    const handleExpired = (event) => {
      const kind = event?.detail?.kind
      if (kind && kind !== 'staff') return
      setCurrentAdminUser(null)
    }
    window.addEventListener('auth-expired', handleExpired)
    return () => window.removeEventListener('auth-expired', handleExpired)
  }, [])

  // ── ADMIN STATE (UI preferences only) ──
  // Orders, KPIs, reviews, settings and the account list are server-owned;
  // only the dismissed-alert ids are a local, per-browser preference.
  const [adminState, setAdminState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          dismissedAlertIds: Array.isArray(parsed.dismissedAlertIds) ? parsed.dismissedAlertIds : [],
        }
      }
    } catch (e) {
      console.warn('Failed to parse admin state from localStorage:', e)
    }
    return { dismissedAlertIds: [] }
  })

  // Products state - fetched from backend
  const [products, setProducts] = useState([])
  const [productsRefreshKey, setProductsRefreshKey] = useState(0)

  // Live orders (raw backend rows, CART- rows filtered out) - fetched from backend
  const [orders, setOrders] = useState([])
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0)

  // POS in-memory cart state (mirrored into refs so queued syncs read fresh data)
  const [posCart, setPosCart] = useState([])
  const posCartRef = useRef([])
  const posOrderIdRef = useRef(null) // backend ord_id of the open walk-in order
  const posServerQtyRef = useRef({}) // posLineKey(line) -> qty we believe the server has
  const posQueueRef = useRef(Promise.resolve())

  // Fetch products from backend whenever admin is logged in or refresh key changes.
  // (logoutAdmin() already clears the lists, so no synchronous setState here.)
  useEffect(() => {
    if (!currentAdminUser) return undefined
    let cancelled = false
    fetchAdminProducts()
      .then((rows) => { if (!cancelled) setProducts(rows) })
      .catch(() => { if (!cancelled) setProducts([]) })
    return () => { cancelled = true }
  }, [currentAdminUser, productsRefreshKey])

  const refreshProducts = useCallback(() => {
    setProductsRefreshKey((k) => k + 1)
  }, [])

  // Fetch orders from backend (mount + every refreshOrders() call - the pages
  // re-run this on a 30s interval per REQ-SD-02). logoutAdmin() clears the list,
  // so there is no synchronous setState in this effect body.
  useEffect(() => {
    if (!currentAdminUser) return undefined
    let cancelled = false
    fetchOrders()
      .then((rows) => {
        if (cancelled) return
        const list = (rows || []).filter(
          (row) => !String(row?.ord_tag || '').toUpperCase().startsWith('CART-')
        )
        setOrders(list)
      })
      .catch(() => {
        // Transient failure: keep the last known rows on screen.
      })
    return () => { cancelled = true }
  }, [currentAdminUser, ordersRefreshKey])

  const refreshOrders = useCallback(() => {
    setOrdersRefreshKey((k) => k + 1)
  }, [])

  // Derived alert feed (out-of-stock + pending cancel/return requests).
  const dismissedAlertIds = useMemo(
    () => adminState.dismissedAlertIds || [],
    [adminState.dismissedAlertIds]
  )
  const alerts = useMemo(
    () => buildAlerts(products, orders, dismissedAlertIds),
    [products, orders, dismissedAlertIds]
  )

  // Sync admin state to localStorage - live server data is never written back,
  // so nothing can be seeded from it on the next load.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ dismissedAlertIds: adminState.dismissedAlertIds || [] })
      )
    } catch (e) {
      console.warn('Failed to save admin state:', e)
    }
  }, [adminState])

  // ── ADMIN AUTHENTICATION ACTIONS ──
  const loginAdmin = useCallback(async (emailOrUsername, password) => {
    const result = await adminLogin(emailOrUsername.trim(), password)
    if (result.success && result.user) {
      // REQ-SD-01: Only staff, admin, and super admin can access the dashboard
      const allowedRoles = ['STAFF', 'Staff', 'ADMIN', 'Admin', 'SUPER_ADMIN', 'Super Admin']
      if (!allowedRoles.includes(result.user.role) && !allowedRoles.includes(result.user.roleKey)) {
        return { success: false, error: 'Your account does not have access to the admin panel.' }
      }
      setCurrentAdminUser(result.user)
    }
    return result
  }, [])

  const logoutAdmin = useCallback(() => {
    adminLogout().catch(() => null)
    clearSession('staff')
    setCurrentAdminUser(null)
    setApiToken(null, 'staff')
    setProducts([])
    setOrders([])
    posCartRef.current = []
    posOrderIdRef.current = null
    posServerQtyRef.current = {}
    setPosCart([])
  }, [])

  const updateCurrentAdminProfile = useCallback((updatedFields) => {
    // Employee records are server-owned (PUT /accounts/update); this only
    // refreshes the in-memory session copy.
    setCurrentAdminUser((prev) => (prev ? { ...prev, ...updatedFields } : prev))
  }, [])

  // REQ-EMP_LOGOUT-03: an employee is logged out automatically after thirty
  // minutes without touching the portal. Any real interaction (pointer,
  // keyboard, wheel) restarts the window, and signing out - by hand or by
  // this timer - tears the session down exactly the same way, so the server
  // stamps emp_last_logout and revokes every token of the account
  // (FLOW-EMP_LOGOUT-05/06).
  //
  // The clock lives in a ref and the callbacks are read through refs, so a
  // background data refresh re-rendering the provider can never silently
  // restart the thirty-minute window.
  const idleSinceRef = useRef(0)
  const logoutAdminRef = useRef(logoutAdmin)
  const showToastRef = useRef(showToast)
  useEffect(() => {
    logoutAdminRef.current = logoutAdmin
    showToastRef.current = showToast
  })

  useEffect(() => {
    if (!currentAdminUser) return undefined

    const IDLE_MS = 30 * 60 * 1000
    idleSinceRef.current = Date.now()

    const markActive = () => {
      idleSinceRef.current = Date.now()
    }

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    events.forEach((name) => window.addEventListener(name, markActive, { passive: true }))

    const timer = setInterval(() => {
      if (Date.now() - idleSinceRef.current < IDLE_MS) return
      clearInterval(timer)
      logoutAdminRef.current()
      showToastRef.current('Signed out after 30 minutes of inactivity.', 'info')
    }, 30 * 1000)

    return () => {
      clearInterval(timer)
      events.forEach((name) => window.removeEventListener(name, markActive))
    }
  }, [currentAdminUser])

  // ── ORDER ACTIONS (backend-driven: PUT /orders/update) ──
  const updateOrderStatus = useCallback(
    async (orderId, newStatus) => {
      const ordId = toNumericId(orderId)
      if (ordId === null) {
        return { success: false, error: 'Invalid order id.' }
      }
      try {
        await updateOrder(ordId, { ord_status: String(newStatus || '').trim().toUpperCase() })
        refreshOrders()
        return { success: true }
      } catch (e) {
        return { success: false, error: e?.message || 'Failed to update the order status.' }
      }
    },
    [refreshOrders]
  )

  // ── PRODUCT & INVENTORY ACTIONS (backend-driven) ──

  const addProduct = useCallback(async (productData) => {
    // FLOW-ADD_PROD-05 / REQ-ADD_PROD-08: refuse incomplete or non-positive
    // input here instead of silently coercing a price to 300 or stock to 10 -
    // a placeholder product is worse than no product.
    const name = String(productData.name || '').trim()
    const price = Number(productData.price)
    const stock = Number(productData.stock)
    if (!name) {
      const message = 'Product name is required.'
      showToast(message, 'error')
      return { success: false, error: message }
    }
    if (!(price > 0)) {
      const message = 'Product price must be greater than zero.'
      showToast(message, 'error')
      return { success: false, error: message }
    }
    if (!(stock >= 0)) {
      const message = 'Stock quantity cannot be negative.'
      showToast(message, 'error')
      return { success: false, error: message }
    }
    const variations = Array.isArray(productData.variations) ? productData.variations : []
    if (variations.length === 0) {
      const message = 'A product needs at least one variation.'
      showToast(message, 'error')
      return { success: false, error: message }
    }
    for (const [i, row] of variations.entries()) {
      // A combination names itself from its axes ("Cream / Medium"), so a row
      // that carries options never needs a hand-typed name. Demanding one made
      // every combination the axis matrix generated unsubmittable.
      const options = row?.options
      if (!String(row?.name || '').trim() && !(options && Object.keys(options).length > 0)) {
        const message = `Variation ${i + 1} needs a name.`
        showToast(message, 'error')
        return { success: false, error: message }
      }
      if (!(Number(row?.stock) >= 0)) {
        const message = `Variation ${i + 1} stock cannot be negative.`
        showToast(message, 'error')
        return { success: false, error: message }
      }
      // colour and material), so the option set of a row is checked here the
      // same way ProductsAPI::variationOptions checks it server-side.
      if (options !== undefined && options !== null) {
        const entries = Object.entries(options)
        if (entries.length === 0) {
          const message = `Variation ${i + 1} needs at least one option axis and value.`
          showToast(message, 'error')
          return { success: false, error: message }
        }
        if (entries.length > 4) {
          const message = `Variation ${i + 1} may vary along at most 4 axes at once.`
          showToast(message, 'error')
          return { success: false, error: message }
        }
        const blank = entries.find(
          ([axis, value]) => !String(axis || '').trim() || !String(value || '').trim()
        )
        if (blank) {
          const message = `Variation ${i + 1} needs both an axis name and a value for "${blank[0] || 'every option'}".`
          showToast(message, 'error')
          return { success: false, error: message }
        }
      }
    }

    try {
      // FLOW-ADD_PROD-07: the tag is generated server-side from the name, so
      // no client-made SKU is sent. FLOW-ADD_PROD-08: the confirmation names
      // the new product, which the server returns as prod_id.
      const res = await createAdminProduct({
        name,
        category: productData.category || 'Accessories',
        price,
        stock,
        desc: productData.desc || '',
        photo: productData.photo || '',
        variations: variations.map((row) => ({
          name: String(row.name || '').trim(),
          stock: Number.isFinite(Number(row.stock)) ? Number(row.stock) : 0,
          markup: Number(row.markup) || 0,
          pic: row.pic || '',
          // The {axis: value} pairs of this combination. A product that
          // variates along several axes at once - (cream, medium), (black,
          // metallic) - carries them on every variation row, and the backend
          // derives the row's label from them when no name is given.
          options: row.options && Object.keys(row.options).length > 0 ? row.options : undefined,
        })),
      })
      const created = res?.data?.product ?? res?.data ?? {}
      const prodId = created.prod_id ?? null
      showToast(
        prodId ? `Product "${name}" added to the catalog (#${prodId}).` : `Product "${name}" added to the catalog.`,
        'success'
      )
      refreshProducts()
      return { success: true, prodId }
    } catch (e) {
      console.error('Failed to add product:', e)
      showToast(e.message || 'Failed to add product.', 'error')
      return { success: false, error: e.message || 'Failed to add product.' }
    }
  }, [refreshProducts, showToast])

  const updateProduct = useCallback(async (productId, updatedFields) => {
    const numericId = toNumericProductId(productId)
    if (numericId === null) return { success: false, error: 'Invalid product ID.' }
    try {
      await updateAdminProductAPI(numericId, updatedFields)
      showToast('Product updated successfully!', 'success')
      refreshProducts()
      return { success: true }
    } catch (e) {
      console.error('Failed to update product:', e)
      showToast(e.message || 'Failed to update product.', 'error')
      refreshProducts()
      return { success: false, error: e.message || 'Failed to update product.' }
    }
  }, [refreshProducts, showToast])

  const deleteProduct = useCallback(async (productId) => {
    const numericId = toNumericProductId(productId)
    if (numericId === null) return { success: false, error: 'Invalid product ID.' }
    try {
      await removeAdminProductAPI(numericId)
      showToast('Product removed from the catalog.', 'success')
      refreshProducts()
      return { success: true }
    } catch (e) {
      console.error('Failed to delete product:', e)
      showToast(e.message || 'Failed to remove product.', 'error')
      refreshProducts()
      return { success: false, error: e.message || 'Failed to remove product.' }
    }
  }, [refreshProducts, showToast])

  const unlistProduct = useCallback(async (productId) => {
    const numericId = toNumericProductId(productId)
    if (numericId === null) return { success: false, error: 'Invalid product ID.' }
    try {
      await unlistAdminProductAPI(numericId)
      showToast('Product unlisted from the customer catalog.', 'success')
      refreshProducts()
      return { success: true }
    } catch (e) {
      console.error('Failed to unlist product:', e)
      showToast(e.message || 'Failed to unlist product.', 'error')
      refreshProducts()
      return { success: false, error: e.message || 'Failed to unlist product.' }
    }
  }, [refreshProducts, showToast])

  const sellProduct = useCallback(async (productId) => {
    const numericId = toNumericProductId(productId)
    if (numericId === null) return { success: false, error: 'Invalid product ID.' }
    try {
      await sellAdminProductAPI(numericId)
      showToast('Product listed back for sale.', 'success')
      refreshProducts()
      return { success: true }
    } catch (e) {
      console.error('Failed to list product for sale:', e)
      showToast(e.message || 'Failed to list product for sale.', 'error')
      refreshProducts()
      return { success: false, error: e.message || 'Failed to list product for sale.' }
    }
  }, [refreshProducts, showToast])

  // `prodvarId` (optional) targets ONE variation instead of the product
  // total: the inventory stepper sits on a per-variation row, and the old
  // product-level write only ever moved the delta onto the main variation.
  const adjustStock = useCallback(async (productId, newStock, prodvarId = null) => {
    const numericId = toNumericProductId(productId)
    if (numericId === null) return
    try {
      await updateAdminProductAPI(numericId, {
        prod_qty: Math.max(0, newStock),
        ...(prodvarId !== null && prodvarId !== undefined ? { prodvar_id: prodvarId } : {}),
      })
      refreshProducts()
    } catch (e) {
      console.error('Failed to adjust stock:', e)
      showToast(e.message || 'Failed to adjust stock.', 'error')
      refreshProducts()
    }
  }, [refreshProducts, showToast])

  // ── PER-VARIATION ACTIONS (FLOW-MANAGE_INV-01) ──
  //
  // One variation at a time: add a combination the product does not have yet,
  // edit the stock / markup / photo / options of one it does, or retire it.
  // Every call goes through the `variant` payload of PUT /products/update,
  // which leaves every other prodvar row - and every bag and sales row that
  // hangs off it - untouched.

  /** Add one combination to a product. `variant.options` is {axis: value}. */
  const addVariant = useCallback(
    async (productId, variant) => {
      const numericId = toNumericProductId(productId)
      if (numericId === null) return { success: false, error: 'Invalid product ID.' }
      try {
        await saveAdminVariant(numericId, variant)
        showToast('Product variation added successfully!', 'success')
        refreshProducts()
        return { success: true }
      } catch (e) {
        console.error('Failed to add variation:', e)
        showToast(e.message || 'Failed to add the variation.', 'error')
        return { success: false, error: e.message || 'Failed to add the variation.' }
      }
    },
    [refreshProducts, showToast]
  )

  /** Edit the details of one existing combination. */
  const updateVariant = useCallback(
    async (productId, prodvarId, fields) => {
      const numericId = toNumericProductId(productId)
      if (numericId === null) return { success: false, error: 'Invalid product ID.' }
      try {
        await saveAdminVariant(numericId, { prodvar_id: prodvarId, ...fields })
        showToast('Product variation updated successfully!', 'success')
        refreshProducts()
        return { success: true }
      } catch (e) {
        console.error('Failed to update variation:', e)
        showToast(e.message || 'Failed to update the variation.', 'error')
        return { success: false, error: e.message || 'Failed to update the variation.' }
      }
    },
    [refreshProducts, showToast]
  )

  /**
   * Retire one combination. The backend soft-deletes it when no customer is
   * holding it, and only disables it when someone is - REQ-CW-02 asks that a
   * bag line never disappears on its own - and answers with which of the two
   * happened, so the toast can say so.
   */
  const removeVariant = useCallback(
    async (productId, prodvarId) => {
      const numericId = toNumericProductId(productId)
      if (numericId === null) return { success: false, error: 'Invalid product ID.' }
      try {
        await saveAdminVariant(numericId, { prodvar_id: prodvarId, remove: true })
        showToast('Product variation removed successfully!', 'success')
        refreshProducts()
        return { success: true }
      } catch (e) {
        console.error('Failed to remove variation:', e)
        showToast(e.message || 'Failed to remove the variation.', 'error')
        return { success: false, error: e.message || 'Failed to remove the variation.' }
      }
    },
    [refreshProducts, showToast]
  )

  // ── ALERTS ACTIONS ──
  // Alerts are derived from live data, so "resolving" one records the dismissal
  // (persisted) instead of mutating a list that would reappear on refresh.
  const resolveAlert = useCallback((alertId) => {
    setAdminState((prev) => {
      const current = prev.dismissedAlertIds || []
      if (current.includes(alertId)) return prev
      return { ...prev, dismissedAlertIds: [...current, alertId] }
    })
  }, [])

  // ── POS REGISTER CART ACTIONS (optimistic + queued server sync) ──
  // Every cart change updates local state immediately and then runs through a
  // single-flight queue so /pos/add, /pos/remove and /pos/checkout can never
  // interleave (the backend aggregates same-product rows, so each change is
  // applied as an exact remove + re-set).
  const applyPosCart = useCallback((next) => {
    posCartRef.current = next
    setPosCart(next)
  }, [])

  const enqueuePosTask = useCallback((task) => {
    const run = posQueueRef.current.then(() => task())
    // Keep the chain alive even when a task rejects; callers get the rejection.
    posQueueRef.current = run.then(() => undefined, () => undefined)
    return run
  }, [])

  /** Reconcile the server copy of the walk-in order with the local cart. */
  const syncPosCart = useCallback(() => {
    return enqueuePosTask(async () => {
      const local = posCartRef.current
      const server = posServerQtyRef.current
      let ordId = posOrderIdRef.current

      // 1. Lines dropped from the cart are removed server-side.
      for (const key of Object.keys(server)) {
        if (!local.some((line) => posLineKey(line) === key)) {
          if (ordId) {
            await removePosItem({ ord_id: ordId, ...posLineTarget(server[key]) })
          }
          delete server[key]
        }
      }

      // 2. First add creates the anonymous POS order.
      if (!ordId && local.length > 0) {
        const first = local[0]
        const res = await addPosItem({
          prod_id: first.prodId,
          ...posLineTarget(first),
          item_qty: first.qty,
          item_amount: first.price * first.qty,
        })
        ordId = res?.data?.order?.ord_id ?? res?.order?.ord_id ?? res?.data?.ord_id ?? null
        if (!ordId) throw new Error('The POS order id was missing from the server response.')
        posOrderIdRef.current = ordId
        server[posLineKey(first)] = first.qty
      }

      // 3. Every remaining line is set to the exact quantity in the cart.
      if (ordId) {
        for (const line of local) {
          const key = posLineKey(line)
          const wanted = Number(line.qty) || 0
          if (server[key] === wanted) continue
          if (server[key] !== undefined) {
            await removePosItem({ ord_id: ordId, ...posLineTarget(line) })
            delete server[key]
          }
          if (wanted > 0) {
            await addPosItem({
              ord_id: ordId,
              prod_id: line.prodId,
              ...posLineTarget(line),
              item_qty: wanted,
              item_amount: line.price * wanted,
            })
            server[key] = wanted
          }
        }
      }

      return { success: true, ordId }
    })
  }, [enqueuePosTask])

  const reportPosFailure = useCallback(
    (err) => {
      const message = err?.message || 'Failed to sync the cart with the server.'
      showToast(message, 'error')
      return { success: false, error: message }
    },
    [showToast]
  )

  const posAddToCart = useCallback(
    (product, variantName = 'Standard', qty = 1, prodvarId = null, unitPrice = null) => {
      const prodId = toNumericProductId(product?.id ?? product?.prodId)
      if (prodId === null) {
        return Promise.resolve({ success: false, error: 'Invalid product.' })
      }

      const variationId =
        prodvarId != null && prodvarId !== ''
          ? Number(prodvarId)
          : Number(product?.prodvarId ?? product?.variationId) || null
      const lineVariant = String(variantName || 'Standard')
      // FLOW-ADD_PROD-03: a variation carries its own markup over the product's
      // base price, so the register rings up the variation price when one is
      // given instead of always the base price.
      const price =
        Number(unitPrice) > 0
          ? Number(unitPrice)
          : Number(product?.price) || 0

      const current = posCartRef.current
      // The same key the server uses, so a ticket line and a register line can
      // never drift apart over which variation they are about.
      const key = `${prodId}:${variationId ?? ''}`
      const index = current.findIndex((line) => posLineKey(line) === key)
      let next
      if (index > -1) {
        next = current.map((line, i) =>
          i === index ? { ...line, qty: line.qty + qty } : line
        )
      } else {
        next = [
          ...current,
          {
            id: product?.id || `prod-${prodId}`,
            prodId,
            prodvarId: variationId,
            name: product?.name || 'Item',
            variant: lineVariant,
            price,
            qty,
            image: product?.image || '',
          },
        ]
      }
      applyPosCart(next)
      return syncPosCart().catch(reportPosFailure)
    },
    [applyPosCart, syncPosCart, reportPosFailure]
  )

  const posUpdateQty = useCallback(
    (index, newQty) => {
      const current = posCartRef.current
      const next =
        newQty <= 0
          ? current.filter((_, i) => i !== index)
          : current.map((line, i) => (i === index ? { ...line, qty: newQty } : line))
      applyPosCart(next)
      return syncPosCart().catch(reportPosFailure)
    },
    [applyPosCart, syncPosCart, reportPosFailure]
  )

  const posRemoveItem = useCallback(
    (index) => {
      const next = posCartRef.current.filter((_, i) => i !== index)
      applyPosCart(next)
      return syncPosCart().catch(reportPosFailure)
    },
    [applyPosCart, syncPosCart, reportPosFailure]
  )

  const posClearCart = useCallback(() => {
    applyPosCart([])
    return syncPosCart().catch(reportPosFailure)
  }, [applyPosCart, syncPosCart, reportPosFailure])

  /**
   * Pay the walk-in order at the register (POST /pos/checkout).
   * Returns { success, order } with the receipt on success, or
   * { success: false, error } so the register can keep the modal open.
   */
  const posCheckout = useCallback(
    async ({ paymentMethod = 'Cash', customerName = 'Walk-in Customer', studentId = 'N/A', amountTendered = 0, discount = 0 } = {}) => {
      const snapshot = posCartRef.current
      const subtotal = snapshot.reduce((sum, line) => sum + line.price * line.qty, 0)
      const ordId = posOrderIdRef.current

      if (!ordId || snapshot.length === 0) {
        return { success: false, error: 'The POS cart is empty.' }
      }

      // The cashier's discount: capped at the cart here, re-checked against the
      // server-calculated total and stored on orders.ord_discount there.
      const discountAmount = Math.max(0, Math.min(Number(discount) || 0, subtotal))
      const due = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100)
      const tendered = Number(amountTendered) > 0 ? Number(amountTendered) : due

      try {
        // Drain any pending cart edits first so the server total is final.
        await syncPosCart()
        // FLOW-WALKIN-06 / REQ-WALKIN-02: the tender the cashier picked has to
        // reach the server, otherwise every walk-in sale is recorded as cash
        // and the payment reference can never show which method was used.
        const tender = paymentMethod === 'Digital Wallet' ? 'digital' : 'cash'
        const res = await enqueuePosTask(() =>
          checkoutPos({
            ord_id: ordId,
            pay_given: tendered,
            ord_discount: discountAmount,
            pay_method: tender,
          })
        )

        const payment = res?.data?.payment || {}
        const receipt = {
          id: `#${payment.pay_ref || `POS-${ordId}`}`,
          ordId,
          pickupId: res?.data?.pickup_id ?? null,
          customer: customerName || 'Walk-in Customer',
          paymentMethod,
          payMethod: payment.pay_method || tender,
          payRef: payment.pay_ref || payment.pay_reference || null,
          studentId,
          fulfillment: 'Instant POS',
          total:
            payment.pay_due != null && Number.isFinite(Number(payment.pay_due))
              ? Number(payment.pay_due)
              : due,
          discount: Number(payment.ord_discount) || discountAmount,
          amountTendered: Number(payment.pay_given) || tendered,
          change: Number(payment.pay_change) || 0,
          items: snapshot.map((line) => ({
            name: line.name,
            qty: line.qty,
            price: line.price,
            size: line.variant,
          })),
        }

        // New sale starts from an empty basket and a fresh order id.
        posCartRef.current = []
        posOrderIdRef.current = null
        posServerQtyRef.current = {}
        setPosCart([])

        refreshOrders()
        refreshProducts()
        return { success: true, order: receipt }
      } catch (e) {
        const message = e?.message || 'Failed to checkout the POS order.'
        return { success: false, error: message }
      }
    },
    [syncPosCart, enqueuePosTask, refreshOrders, refreshProducts]
  )

  return (
    <AdminContext.Provider
      value={{
        adminState,
        orders,
        refreshOrders,
        alerts,
        dismissedAlertIds,
        posCart,
        products,
        currentAdminUser,
        isSuperAdmin: isSuperAdmin(currentAdminUser),
        loginAdmin,
        logoutAdmin,
        updateCurrentAdminProfile,
        updateOrderStatus,
        addProduct,
        updateProduct,
        deleteProduct,
        unlistProduct,
        sellProduct,
        adjustStock,
        addVariant,
        updateVariant,
        removeVariant,
        resolveAlert,
        posAddToCart,
        posUpdateQty,
        posRemoveItem,
        posClearCart,
        posCheckout,
        refreshProducts,
      }}
    >
      {children}
    </AdminContext.Provider>
  )
}
