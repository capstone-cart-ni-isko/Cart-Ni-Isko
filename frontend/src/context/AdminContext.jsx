/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { adminLogin, adminLogout } from '../services/adminAuth.js'
import { getApiToken, setApiToken } from '../services/api.js'
import { clearSession, loadSession, saveSession } from '../services/session.js'
import { useToast } from '../hooks/useToast.js'
import { fetchAllOrders, updateOrder, approveRequest, rejectRequest } from '../services/orders.js'
import { addPosItem, removePosItem, checkoutPos } from '../services/pos.js'
import { fetchAdminProducts, createAdminProduct, updateAdminProduct as updateAdminProductAPI, removeAdminProduct as removeAdminProductAPI, unlistAdminProduct as unlistAdminProductAPI, sellAdminProduct as sellAdminProductAPI } from '../services/adminProducts.js'
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

export function AdminProvider({ children }) {
  const { showToast } = useToast()

  // ── ADMIN SESSION ──
  // Restored from the shared `isko_session` slot so the staff member who
  // signed in last stays signed in across reloads (same slot as customers).
  const [currentAdminUser, setCurrentAdminUser] = useState(() => {
    const saved = loadSession('staff')
    if (saved) setApiToken(saved.token)
    return saved?.user ?? null
  })

  useEffect(() => {
    if (currentAdminUser) saveSession('staff', getApiToken(), currentAdminUser)
    else clearSession('staff')
  }, [currentAdminUser])

  // Token rejected server-side: end the staff session too.
  useEffect(() => {
    const handleExpired = () => setCurrentAdminUser(null)
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
  const posServerQtyRef = useRef({}) // prodId -> qty we believe the server has
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
  // Only the first failure of a streak is toasted, so the 30s polling never
  // stacks the same error.
  const ordersFailingRef = useRef(false)
  useEffect(() => {
    if (!currentAdminUser) return undefined
    let cancelled = false
    fetchAllOrders()
      .then((rows) => {
        if (cancelled) return
        ordersFailingRef.current = false
        setOrders(rows || [])
      })
      .catch((e) => {
        // Keep the last known rows on screen, but say why they are stale.
        if (cancelled || ordersFailingRef.current) return
        ordersFailingRef.current = true
        showToast(e?.message || 'Unable to load orders from the server.', 'error')
      })
    return () => { cancelled = true }
  }, [currentAdminUser, ordersRefreshKey, showToast])

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
    setApiToken(null)
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

  /** Approve / decline a customer CANCEL REQUESTED or RETURN REQUESTED order. */
  const decideRequest = useCallback(
    async (row, approve) => {
      try {
        await (approve ? approveRequest(row) : rejectRequest(row))
        refreshOrders()
        return { success: true }
      } catch (e) {
        return { success: false, error: e?.message || 'Failed to update the request.' }
      }
    },
    [refreshOrders]
  )

  // ── PRODUCT & INVENTORY ACTIONS (backend-driven) ──

  const addProduct = useCallback(async (productData) => {
    try {
      await createAdminProduct({
        name: productData.name,
        sku: productData.sku || `SKU-${Date.now().toString(36).toUpperCase()}`,
        category: productData.category || 'Shirts',
        price: Number(productData.price) || 300,
        stock: Number(productData.stock) || 10,
        desc: productData.desc || '',
        photo: productData.photo || '',
      })
      showToast('Product added to catalog successfully!', 'success')
      refreshProducts()
      return { success: true }
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

  const adjustStock = useCallback(async (productId, newStock) => {
    const numericId = toNumericProductId(productId)
    if (numericId === null) return
    try {
      await updateAdminProductAPI(numericId, { prod_qty: Math.max(0, newStock) })
      refreshProducts()
    } catch (e) {
      console.error('Failed to adjust stock:', e)
      showToast(e.message || 'Failed to adjust stock.', 'error')
      refreshProducts()
    }
  }, [refreshProducts, showToast])

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
      for (const prodId of Object.keys(server)) {
        if (!local.some((line) => String(line.prodId) === prodId)) {
          if (ordId) {
            await removePosItem({ ord_id: ordId, prod_id: Number(prodId) })
          }
          delete server[prodId]
        }
      }

      // 2. First add creates the anonymous POS order.
      if (!ordId && local.length > 0) {
        const first = local[0]
        const res = await addPosItem({
          prod_id: first.prodId,
          item_qty: first.qty,
          item_amount: first.price * first.qty,
        })
        ordId = res?.data?.order?.ord_id ?? res?.order?.ord_id ?? res?.data?.ord_id ?? null
        if (!ordId) throw new Error('The POS order id was missing from the server response.')
        posOrderIdRef.current = ordId
        server[String(first.prodId)] = first.qty
      }

      // 3. Every remaining line is set to the exact quantity in the cart.
      if (ordId) {
        for (const line of local) {
          const key = String(line.prodId)
          const wanted = Number(line.qty) || 0
          if (server[key] === wanted) continue
          if (server[key] !== undefined) {
            await removePosItem({ ord_id: ordId, prod_id: line.prodId })
            delete server[key]
          }
          if (wanted > 0) {
            await addPosItem({
              ord_id: ordId,
              prod_id: line.prodId,
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
    (product, variantName = 'Standard', qty = 1) => {
      const prodId = toNumericProductId(product?.id ?? product?.prodId)
      if (prodId === null) {
        return Promise.resolve({ success: false, error: 'Invalid product.' })
      }

      const current = posCartRef.current
      const index = current.findIndex(
        (line) => line.prodId === prodId && line.variant === variantName
      )
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
            name: product?.name || 'Item',
            variant: variantName,
            price: Number(product?.price) || 0,
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
    async ({ paymentMethod = 'Cash', customerName = 'Walk-in Customer', studentId = 'N/A', amountTendered = 0 } = {}) => {
      const snapshot = posCartRef.current
      const subtotal = snapshot.reduce((sum, line) => sum + line.price * line.qty, 0)
      const ordId = posOrderIdRef.current

      if (!ordId || snapshot.length === 0) {
        return { success: false, error: 'The POS cart is empty.' }
      }

      const tendered = Number(amountTendered) > 0 ? Number(amountTendered) : subtotal

      try {
        // Drain any pending cart edits first so the server total is final.
        await syncPosCart()
        const res = await enqueuePosTask(() => checkoutPos({ ord_id: ordId, pay_given: tendered }))

        const payment = res?.data?.payment || {}
        const order = res?.data?.order || {}
        const receipt = {
          id: `#${order.ord_tag || `POS-${ordId}`}`,
          ordId,
          pickupId: res?.data?.pickup_id ?? null,
          customer: customerName || 'Walk-in Customer',
          paymentMethod,
          studentId,
          fulfillment: 'Instant POS',
          total: Number(payment.pay_due) || subtotal,
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
        decideRequest,
        addProduct,
        updateProduct,
        deleteProduct,
        unlistProduct,
        sellProduct,
        adjustStock,
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
