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
    return saved ? JSON.parse(saved) : []
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
  const stock = item.product.stockMatrix?.[item.color?.name]?.[item.size]
    ?? item.product.qty ?? 0
  return stock > 0
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

  /** Pull the server cart; server wins whenever it responds. */
  const refreshCart = useCallback(async () => {
    if (!custId) return null
    try {
      const rows = await fetchCart(custId)
      return hydrateFromRows(rows)
    } catch (err) {
      console.warn('Cart refresh failed, using local cart:', err.message)
      return null
    }
  }, [custId, hydrateFromRows])

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

  /** Fire-and-forget server sync for one item; local state is the fallback. */
  const pushItem = (item, qtyDelta) => {
    const prodId = prodIdOf(item)
    if (!custId || !prodId) return
    const rows = cartItemsRef.current
    const twin =
      (item.ordId ? null : rows.find((i) => i.ordId && prodIdOf(i) === prodId)) ||
      null

    const run = item.ordId
      ? addProductToOrder(item.ordId, prodId, qtyDelta, amountOf(item))
      : twin
      ? addProductToOrder(twin.ordId, prodId, qtyDelta, amountOf(item))
      : addCartOrder(custId, [
          { prod_id: prodId, item_qty: qtyDelta, item_amount: amountOf(item) },
        ])

    run.then(() => refreshCart()).catch((err) => {
      // API unreachable: keep the local cart as the read-through fallback.
      console.warn('Cart sync failed, keeping local change:', err.message)
    })
  }

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
    pushItem(target, qty)
  }

  // Remove item from cart and return it for undo
  const removeFromCart = (cartItemId) => {
    const removedItem = cartItemsRef.current.find((i) => i.cartItemId === cartItemId)
    applyItems(cartItemsRef.current.filter((item) => item.cartItemId !== cartItemId))
    setSelectedItemIds((prev) => prev.filter((id) => id !== cartItemId))

    if (removedItem && custId && removedItem.ordId && prodIdOf(removedItem)) {
      removeProductFromOrder(removedItem.ordId, prodIdOf(removedItem))
        .then(() => refreshCart())
        .catch((err) => {
          console.warn('Cart remove sync failed:', err.message)
        })
    }
    return removedItem
  }

  // Restore removed item (Undo action)
  const restoreItem = (item) => {
    if (!item) return
    applyItems([item, ...cartItemsRef.current])
    setSelectedItemIds((prev) => (prev.includes(item.cartItemId) ? prev : [...prev, item.cartItemId]))
    // Put the line back on the server row it came from (or recreate it).
    pushItem(item, item.qty)
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

    if (!custId || !current.ordId || !prodIdOf(current)) {
      if (custId) pushItem({ ...current, qty }, qty)
      return
    }

    if (delta > 0) {
      // Merge the extra units into the existing order line.
      addProductToOrder(current.ordId, prodIdOf(current), delta, amountOf(current))
        .then(() => refreshCart())
        .catch((err) => console.warn('Quantity sync failed:', err.message))
    } else {
      // Remove then re-add with the new quantity.
      removeProductFromOrder(current.ordId, prodIdOf(current))
        .then(() =>
          addProductToOrder(current.ordId, prodIdOf(current), qty, amountOf(current))
        )
        .then(() => refreshCart())
        .catch((err) => console.warn('Quantity sync failed:', err.message))
    }
  }

  const clearCart = () => {
    applyItems([])
    setSelectedItemIds([])
    if (!custId) return
    // Only CART- tagged rows are deleted, never a checked-out ORD- order.
    fetchCart(custId)
      .then((rows) =>
        Promise.allSettled(rows.map((row) => removeCartOrder(row.ord_id ?? row.id)))
      )
      .then(() => refreshCart())
      .catch((err) => console.warn('Clear cart sync failed:', err.message))
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
        canCheckoutItem: (item) => {
          if (!item || !item.product) return false
          if (item.product.preOrder) return true
          const stock = item.product.stockMatrix?.[item.color?.name]?.[item.size]
            ?? item.product.qty ?? 0
          return stock > 0
        },
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
