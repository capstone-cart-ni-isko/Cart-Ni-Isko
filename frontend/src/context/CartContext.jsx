/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import {
  addToCart as addCartOrder,
  fetchCart,
  removeFromCart as removeCartOrder,
} from '../services/cart.js'
import { addProductToOrder, removeProductFromOrder } from '../services/orders.js'
import { mapProduct } from '../services/products.js'

export const CartContext = createContext(null)

const OWNER_KEY = 'isko_cart_owner'
const GUEST = 'guest'

function readLocal() {
  try {
    const saved = localStorage.getItem('isko_cart')
    const items = saved ? JSON.parse(saved) : []
    // Lines picked from the old offline sample catalog carry no real product
    // id and can never be saved to the server, so they are dropped.
    return Array.isArray(items)
      ? items.filter((i) => (i?.prodId ?? i?.product?.prodId) != null)
      : []
  } catch {
    return []
  }
}

/** Server rows embed a `product` relation - accept raw or already-mapped shapes. */
function toProduct(raw) {
  if (!raw) return null
  if (raw.name !== undefined && raw.price !== undefined) return raw
  const mapped = mapProduct(raw)
  if (mapped) return mapped
  return {
    id: `prod-${raw.prod_id ?? 'x'}`,
    prodId: raw.prod_id,
    name: raw.prod_name || 'Product',
    price: Number(raw.prod_price ?? 0),
    images: [],
    preOrder: false,
  }
}

function prodIdOf(item) {
  return item?.prodId ?? item?.product?.prodId ?? null
}

/** Line total. The server stores `item_amount` as prod_price * qty, so the
 *  catalog unit price is what both sides agree on. */
function amountOf(item) {
  return (item?.product?.price ?? 0) * (Number(item?.qty) || 1)
}

/** REQ-CW-02: Check if a cart item is available for checkout. */
function isItemAvailable(item) {
  if (!item || !item.product) return false
  if (item.product.preOrder) return true
  // One stock number per product (prod_qty); sizes/colours share it.
  return (Number(item.product.qty) || 0) > 0
}

/**
 * Flatten `GET /cart/display` orders (tagged CART-...) into the local cart-item
 * shape the UI renders. Variant details (size/color) are not stored server-side,
 * so they are read back out of the local cache by product id.
 */
function mapServerRows(rows, cachedItems) {
  const items = []
  const claimed = new Set()

  for (const row of rows || []) {
    const ordId = row.ord_id ?? row.id
    for (const entry of row.items || []) {
      const product = toProduct(entry.product)
      if (!product) continue
      const prodId = entry.prod_id ?? product.prodId ?? null
      const cartItemId = `${ordId}:${prodId}`
      const exact = cachedItems.find(
        (c) => c.cartItemId === cartItemId && !claimed.has(c.cartItemId)
      )
      const byProduct = cachedItems.find(
        (c) =>
          !claimed.has(c.cartItemId) &&
          (c.product?.id === product.id || c.prodId === prodId)
      )
      const cached = exact || byProduct
      if (cached) claimed.add(cached.cartItemId)

      items.push({
        cartItemId,
        ordId,
        prodId,
        product,
        qty: Number(entry.item_qty ?? 1),
        size: exact?.size ?? byProduct?.size ?? null,
        color: exact?.color ?? byProduct?.color ?? null,
      })
    }
  }
  return items
}

export function CartProvider({ children }) {
  const { currentUser } = useAuth()

  const custId = currentUser?.cust_id ?? currentUser?.id ?? null
  const owner = custId ? String(custId) : GUEST

  const [cartItems, setCartItems] = useState(readLocal)
  const cartItemsRef = useRef(cartItems)

  // Selection state: array of selected cartItemId strings
  const [selectedItemIds, setSelectedItemIds] = useState(() =>
    readLocal().map((i) => i.cartItemId)
  )

  // Ids we have already seen, so a refetch only auto-selects brand-new items.
  const seenIdsRef = useRef(new Set())

  const applyItems = useCallback((next, { selectNew = false } = {}) => {
    // Capture the id snapshot before the ref is replaced: the state updater
    // below runs later (at render time) and must compare against the old set.
    const prevSeen = seenIdsRef.current
    cartItemsRef.current = next
    setCartItems(next)
    const newIds = next.map((i) => i.cartItemId)
    setSelectedItemIds((prev) => {
      const kept = prev.filter((id) => newIds.includes(id))
      const added = newIds.filter(
        (id) => !prev.includes(id) && (selectNew || !prevSeen.has(id))
      )
      return [...kept, ...added]
    })
    seenIdsRef.current = new Set(newIds)
  }, [])

  const hydrateFromRows = useCallback(
    (rows) => {
      // Removing a row's last line (or checking out its lines through a temp
      // order) leaves an empty CART- order behind; delete those as they surface.
      const empty = (rows || []).filter((row) => (row.items || []).length === 0)
      empty.forEach((row) => removeCartOrder(row.ord_id ?? row.id).catch(() => null))
      const items = mapServerRows(rows, cartItemsRef.current)
      applyItems(items)
      return items
    },
    [applyItems]
  )

  // Cache every change locally so guests (and API outages) keep their bag.
  useEffect(() => {
    localStorage.setItem('isko_cart', JSON.stringify(cartItems))
    cartItemsRef.current = cartItems
  }, [cartItems])

  // ── Server sync ──
  // Every cart write runs through one serial queue, so a later step always
  // sees the order id an earlier "add" created (no duplicate orders), and the
  // cart is re-read from the server only once the queue is empty.
  const syncQueueRef = useRef(Promise.resolve())
  const pendingSyncsRef = useRef(0)
  const refreshSeqRef = useRef(0)
  // cartItemId -> server ord_id learned from /cart/add, for lines not yet refreshed
  const knownOrdIdsRef = useRef({})

  /** Pull the server cart; server wins whenever it responds. */
  const refreshCart = useCallback(async () => {
    if (!custId) return null
    const seq = ++refreshSeqRef.current
    try {
      const rows = await fetchCart(custId)
      // A newer refresh or a queued write supersedes this response: applying
      // it would briefly revert changes the user has already made.
      if (seq !== refreshSeqRef.current || pendingSyncsRef.current > 0) return null
      knownOrdIdsRef.current = {}
      return hydrateFromRows(rows)
    } catch (err) {
      console.warn('Cart refresh failed, using local cart:', err.message)
      return null
    }
  }, [custId, hydrateFromRows])

  const enqueueSync = useCallback(
    (task) => {
      pendingSyncsRef.current += 1
      const run = syncQueueRef.current.then(task)
      syncQueueRef.current = run
        .catch((err) => {
          // API unreachable: the local cart stays as the read-through fallback.
          console.warn('Cart sync failed, keeping local change:', err?.message)
        })
        .finally(() => {
          pendingSyncsRef.current -= 1
          if (pendingSyncsRef.current === 0) refreshCart()
        })
      return run
    },
    [refreshCart]
  )

  /** Server ord_id of a line: from the last refresh, or learned from /cart/add since. */
  const ordIdOf = (item) => item?.ordId ?? knownOrdIdsRef.current[item?.cartItemId] ?? null

  /** Latest local copy of a line (with its known ord_id). */
  const lineOf = (cartItemId, fallback = null) => {
    const item = cartItemsRef.current.find((i) => i.cartItemId === cartItemId) || fallback
    return item ? { ...item, ordId: ordIdOf(item) } : null
  }

  /** Add qty units of a line to the server cart (its row, a twin row, or a new order). */
  const syncAdd = (target, qty, { reuseOrder = true } = {}) =>
    enqueueSync(async () => {
      const item = lineOf(target.cartItemId, target)
      const prodId = prodIdOf(item)
      if (!prodId) return
      const twin = cartItemsRef.current.find(
        (i) => i.cartItemId !== item.cartItemId && prodIdOf(i) === prodId && ordIdOf(i)
      )
      const ordId = reuseOrder ? item.ordId ?? ordIdOf(twin) : null
      if (ordId) {
        await addProductToOrder(ordId, prodId, qty, amountOf(item))
        knownOrdIdsRef.current[item.cartItemId] = ordId
        return
      }
      const res = await addCartOrder(custId, [
        { prod_id: prodId, item_qty: qty, item_amount: amountOf(item) },
      ])
      const newOrdId = res?.data?.order?.ord_id ?? null
      if (newOrdId) knownOrdIdsRef.current[item.cartItemId] = newOrdId
    })

  // Whenever the signed-in customer changes, reload from the backend.
  useEffect(() => {
    if (hydratedForOwner(owner)) return
    markHydrated(owner)

    let cancelled = false

    ;(async () => {
      const storedOwner = localStorage.getItem(OWNER_KEY)

      if (!custId) {
        // Signed out: drop another customer's cached cart, keep guest picks.
        if (storedOwner && storedOwner !== GUEST) {
          applyItems([])
        }
        localStorage.setItem(OWNER_KEY, GUEST)
        return
      }

      // Guest picks are merged into the server cart once, after signing in.
      // The module-level flag stops StrictMode's second effect run from
      // merging the same guest rows a second time.
      const localItems = cartItemsRef.current
      const mergeable = localItems.filter((i) => !i.ordId && prodIdOf(i))
      if (storedOwner === GUEST && mergeable.length > 0 && !mergeInFlight) {
        mergeInFlight = true
        try {
          await addCartOrder(
            custId,
            mergeable.map((i) => ({
              prod_id: prodIdOf(i),
              item_qty: Number(i.qty || 1),
              item_amount: amountOf(i),
            }))
          )
        } catch (err) {
          console.warn('Guest cart merge failed:', err.message)
        } finally {
          mergeInFlight = false
        }
      }

      try {
        const rows = await fetchCart(custId)
        if (cancelled) return
        hydrateFromRows(rows)
        localStorage.setItem(OWNER_KEY, String(custId))
      } catch (err) {
        if (cancelled) return
        console.warn('Cart hydration failed, using local cart:', err.message)
        // A cached list from a different account must never leak across users.
        const stored = localStorage.getItem(OWNER_KEY)
        if (stored && stored !== String(custId) && stored !== GUEST) {
          applyItems([])
        }
        localStorage.setItem(OWNER_KEY, String(custId))
      }
    })()

    return () => {
      cancelled = true
      releaseHydration(owner)
    }
  }, [owner, custId, applyItems, hydrateFromRows])

  // Add item to cart (local first, then mirror to the backend)
  const addToCart = (product, qty, size, color) => {
    const prev = cartItemsRef.current
    const existingIndex = prev.findIndex(
      (item) =>
        item.product.id === product.id &&
        item.size === size &&
        (item.color?.name ?? null) === (color?.name ?? null)
    )

    let next
    let target
    if (existingIndex > -1) {
      next = [...prev]
      target = {
        ...next[existingIndex],
        qty: next[existingIndex].qty + qty,
      }
      next[existingIndex] = target
    } else {
      const newItemId = `${product.id}-${size}-${color?.name || 'def'}-${Date.now()}`
      target = {
        cartItemId: newItemId,
        product,
        qty,
        size,
        color,
        prodId: product.prodId ?? null,
      }
      next = [...prev, target]
    }

    applyItems(next, { selectNew: true })
    setSelectedItemIds((curr) =>
      curr.includes(target.cartItemId) ? curr : [...curr, target.cartItemId]
    )
    if (custId) syncAdd(target, qty)
  }

  // Remove item from cart and return it for undo
  const removeFromCart = (cartItemId) => {
    const removedItem = cartItemsRef.current.find((i) => i.cartItemId === cartItemId)
    applyItems(cartItemsRef.current.filter((item) => item.cartItemId !== cartItemId))
    setSelectedItemIds((prev) => prev.filter((id) => id !== cartItemId))

    if (removedItem && custId && prodIdOf(removedItem)) {
      enqueueSync(async () => {
        const ordId = ordIdOf(removedItem)
        if (ordId) await removeProductFromOrder(ordId, prodIdOf(removedItem))
        delete knownOrdIdsRef.current[cartItemId]
      })
    }
    return removedItem
  }

  // Restore removed item (Undo action)
  const restoreItem = (item) => {
    if (!item) return
    applyItems([item, ...cartItemsRef.current])
    setSelectedItemIds((prev) => (prev.includes(item.cartItemId) ? prev : [...prev, item.cartItemId]))
    // Put the line back on the server row it came from. If that row was the
    // item's alone it is swept once empty, so recreate it as a new cart order.
    if (!custId) return
    const rowSurvived = cartItemsRef.current.some(
      (i) => i.ordId && i.ordId === item.ordId && i.cartItemId !== item.cartItemId
    )
    syncAdd(rowSurvived ? item : { ...item, ordId: null }, item.qty, { reuseOrder: rowSurvived })
  }

  const updateQuantity = (cartItemId, qty) => {
    if (qty <= 0) {
      removeFromCart(cartItemId)
      return
    }
    const prev = cartItemsRef.current
    const current = prev.find((i) => i.cartItemId === cartItemId)
    if (!current) return
    const delta = qty - current.qty
    if (delta === 0) return

    applyItems(
      prev.map((item) => (item.cartItemId === cartItemId ? { ...item, qty } : item))
    )

    if (!custId || !prodIdOf(current)) return

    // Set the server line to the quantity shown *when this step runs*, so a
    // burst of +/- clicks settles on the final number.
    enqueueSync(async () => {
      const item = lineOf(cartItemId)
      if (!item) return // removed meanwhile; its own queued step updates the server
      const prodId = prodIdOf(item)
      if (!item.ordId) {
        const res = await addCartOrder(custId, [
          { prod_id: prodId, item_qty: item.qty, item_amount: amountOf(item) },
        ])
        const newOrdId = res?.data?.order?.ord_id ?? null
        if (newOrdId) knownOrdIdsRef.current[cartItemId] = newOrdId
        return
      }
      await removeProductFromOrder(item.ordId, prodId)
      await addProductToOrder(item.ordId, prodId, item.qty, amountOf(item))
    })
  }

  const clearCart = () => {
    applyItems([])
    setSelectedItemIds([])
    if (!custId) return
    // Only CART- tagged rows are deleted, never a checked-out ORD- order.
    enqueueSync(async () => {
      const rows = await fetchCart(custId)
      await Promise.allSettled(rows.map((row) => removeCartOrder(row.ord_id ?? row.id)))
      knownOrdIdsRef.current = {}
    })
  }

  /**
   * Clear only selected items (upon checkout). Server-side cleanup is done by
   * the checkout flow itself, so this only updates the local view; call
   * `refreshCart()` afterwards to re-sync with the backend truth.
   */
  const clearSelectedItems = () => {
    const selected = new Set(selectedItemIds)
    applyItems(cartItemsRef.current.filter((i) => !selected.has(i.cartItemId)))
    setSelectedItemIds([])
  }

  // Toggle selection for a single item
  const toggleSelectItem = (cartItemId) => {
    setSelectedItemIds((prev) =>
      prev.includes(cartItemId) ? prev.filter((id) => id !== cartItemId) : [...prev, cartItemId]
    )
  }

  // Select all or deselect all items
  const selectAllItems = (select = true) => {
    if (select) {
      setSelectedItemIds(cartItems.map((i) => i.cartItemId))
    } else {
      setSelectedItemIds([])
    }
  }

  // Filter selection: select only regular or only pre-order items
  const selectOnlyType = (type) => {
    const matchingIds = cartItems
      .filter((item) => (type === 'preorder' ? item.product.preOrder : !item.product.preOrder))
      .map((item) => item.cartItemId)
    setSelectedItemIds(matchingIds)
  }

  // Dynamic calculations based strictly on selected items (Requirement 4 & 5)
  const selectedItems = cartItems.filter((item) => selectedItemIds.includes(item.cartItemId))
  const subtotal = selectedItems.reduce((sum, item) => sum + amountOf(item), 0)
  const total = subtotal // Requirement 6: No tax, Shipping calculated at checkout

  return (
    <CartContext.Provider
      value={{
        cartItems,
        selectedItemIds,
        selectedItems,
        addToCart,
        removeFromCart,
        restoreItem,
        updateQuantity,
        clearCart,
        clearSelectedItems,
        toggleSelectItem,
        selectAllItems,
        selectOnlyType,
        refreshCart,
        subtotal,
        total,
        isItemAvailable,
        canCheckoutItem: isItemAvailable,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

/* ------------------------------------------------------------------ *
 * Owner tracking (module scope) - mirrors WishlistContext's guard so
 * StrictMode's double-invoked effect never skips or doubles hydration.
 * ------------------------------------------------------------------ */
let hydratedOwner = null
let mergeInFlight = false
function hydratedForOwner(owner) {
  return hydratedOwner === owner
}
function markHydrated(owner) {
  hydratedOwner = owner
}
function releaseHydration(owner) {
  if (hydratedOwner === owner) hydratedOwner = null
}
