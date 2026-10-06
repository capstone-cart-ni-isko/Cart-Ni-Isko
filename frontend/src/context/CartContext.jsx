/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import {
  addToCart as addCartLines,
  clearCart as clearCartOnServer,
  fetchCart,
  removeFromCart as removeBagRow,
  updateBagQuantity,
} from '../services/cart.js'
import { mapProduct } from '../services/products.js'

export const CartContext = createContext(null)

const OWNER_KEY = 'isko_cart_owner'
const GUEST = 'guest'
const CART_EVENT = 'isko:cart-refresh'

/**
 * Ask every mounted bag surface to re-read the server. Fired after a mutation
 * that happens outside this context (the wishlist's "add to bag") so the badge
 * updates immediately (REQ-BAG-03) without the two providers depending on
 * each other's mount order.
 */
export function notifyCartChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CART_EVENT))
}

function readLocal() {
  try {
    const saved = localStorage.getItem('isko_cart')
    const rows = saved ? JSON.parse(saved) : []
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

/** Server rows embed a presented `product` - accept raw or already-mapped shapes. */
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

/** Color in the catalog shape (`value` is what the bag swatch paints). */
function toColor(raw) {
  if (!raw) return null
  const name = typeof raw === 'string' ? raw : raw.name
  if (!name) return null
  const image = typeof raw === 'object' ? raw.image || raw.gallery?.[0] || '' : ''
  const gallery = typeof raw === 'object' && Array.isArray(raw.gallery) && raw.gallery.length
    ? raw.gallery
    : image ? [image] : []
  return { name, value: image, image, gallery }
}

/**
 * One server bag row -> one local cart line. Rows are NEVER merged or
 * de-duplicated by product: each variation is its own line (REQ-BAG-01) and
 * the server has already ordered them bag_created DESC (FLOW-BAG-04).
 */
function mapServerItem(row) {
  const product = toProduct(row.product)
  if (!product) return null
  const qty = Number(row.qty ?? row.bag_qty ?? 1)
  const amount = Number(row.amount ?? row.bag_amount ?? product.price ?? 0)
  const bagId = row.bag_id ?? row.bag_id_display?.replace?.(/^bag-/, '')

  return {
    cartItemId: row.bag_id_display || (row.bag_id != null ? `bag-${row.bag_id}` : row.id),
    bagId: bagId != null ? Number(bagId) : null,
    prodvarId: row.prodvar_id != null ? Number(row.prodvar_id) : null,
    prodId: row.prod_id ?? product.prodId ?? null,
    product,
    qty,
    amount,
    lineTotal: Number(row.line_total ?? qty * amount),
    size: row.size ?? null,
    color: toColor(row.color),
    available: row.available !== false,
  }
}

function prodIdOf(item) {
  return item?.prodId ?? item?.product?.prodId ?? null
}

/** Line total: `amount` on a cart line is always the UNIT price. */
function amountOf(item) {
  return Number(item?.amount ?? item?.product?.price ?? 0) * (Number(item?.qty) || 1)
}

/** REQ-CW-02 / FLOW-WISHLIST-07: only offered lines may be checked out. */
function isItemAvailable(item) {
  return Boolean(item?.product) && item.available !== false
}

/** The line payload POST /cart/add expects (item_amount is the UNIT price). */
function lineFor(item, qty) {
  const line = {
    prod_id: prodIdOf(item),
    item_qty: Math.max(1, Number(qty) || 1),
    item_amount: Number(item?.amount ?? item?.product?.price ?? 0),
  }
  if (item?.prodvarId) line.prodvar_id = item.prodvarId
  if (item?.size) line.size = item.size
  if (item?.color?.name) line.color = { name: item.color.name, image: item.color.image || item.color.value }
  return line
}

const lower = (value) => String(value ?? '').trim().toLowerCase()

/**
 * Pin a bag line to the variation the customer actually picked so two
 * variations of one product can never collapse into a single row. Only an
 * unambiguous match (or a single-variation product) is sent; otherwise the
 * server derives it from size/color exactly like the catalog does.
 */
function resolveProdvarId(product, size, color) {
  const variations = product?.variations || []
  if (variations.length === 0) return null
  if (variations.length === 1) return variations[0].prodvar_id

  const sizeLabel = lower(size)
  const colorLabel = lower(color?.name)
  if (!sizeLabel && !colorLabel) return null

  const hits = variations.filter((variant) => {
    const opts = variant.prodvar_options || {}
    const name = lower(variant.prodvar_name)
    const sizes = [opts.size, opts.sizes].flat().filter(Boolean).map(lower)
    const colors = [opts.color, opts.colour].filter(Boolean).map(lower)

    const sizeOk = !sizeLabel
      ? false
      : name === sizeLabel || sizes.includes(sizeLabel) || (sizeLabel === 'one size' && sizes.length === 0)
    const colorOk = !colorLabel
      ? false
      : name === colorLabel || colors.includes(colorLabel) || colors.length === 0

    return sizeOk && colorOk
  })

  return hits.length === 1 ? hits[0].prodvar_id : null
}

export function CartProvider({ children }) {
  const { currentUser } = useAuth()

  const custId = currentUser?.cust_id ?? currentUser?.id ?? null
  const owner = custId ? String(custId) : GUEST

  const [cartItems, setCartItems] = useState(readLocal)
  const cartItemsRef = useRef(cartItems)

  // REQ-BAG-03: the number of live bag lines, mirrored from every response.
  const [cartCount, setCartCount] = useState(() =>
    readLocal().reduce((total, item) => total + (Number(item.qty) || 1), 0)
  )
  // FLOW-BAG-06: server total amount due (sum of every live line).
  const [serverSubtotal, setServerSubtotal] = useState(null)

  // Selection state: array of selected cartItemId strings.
  const [selectedItemIds, setSelectedItemIds] = useState(() =>
    readLocal().map((i) => i.cartItemId).filter(Boolean)
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

  /** Adopt a {items, cart_count, subtotal} envelope from any cart response. */
  const applyEnvelope = useCallback(
    (envelope) => {
      const items = (envelope?.items || []).map(mapServerItem).filter(Boolean)
      setCartCount(Number(envelope?.cart_count ?? items.length))
      setServerSubtotal(Number(envelope?.subtotal ?? 0))
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
      const envelope = await fetchCart(custId)
      return applyEnvelope(envelope)
    } catch (err) {
      console.warn('Cart refresh failed, using local cart:', err.message)
      return null
    }
  }, [custId, applyEnvelope])

  // Any surface that mutates the bag outside this context (wishlist card)
  // asks for a re-read so the count is the server's answer immediately.
  useEffect(() => {
    const handler = () => refreshCart()
    window.addEventListener(CART_EVENT, handler)
    return () => window.removeEventListener(CART_EVENT, handler)
  }, [refreshCart])

  /** Fire-and-forget server sync for one line; local state is the fallback. */
  const pushLine = useCallback(
    async (item, qty) => {
      if (!custId || !prodIdOf(item)) return null
      try {
        const envelope = await addCartLines(custId, [lineFor(item, qty)])
        applyEnvelope(envelope)
        return envelope
      } catch (err) {
        console.warn('Cart sync failed, keeping local change:', err.message)
        return null
      }
    },
    [custId, applyEnvelope]
  )

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

      // REQ-BAG-02: guest picks are merged into the server cart once, after
      // signing in. The module-level flag stops StrictMode's second effect run
      // from merging the same guest rows a second time.
      const localItems = cartItemsRef.current
      const mergeable = localItems.filter((i) => !i.bagId && prodIdOf(i))
      if (storedOwner === GUEST && mergeable.length > 0 && !mergeInFlight) {
        mergeInFlight = true
        try {
          await addCartLines(
            custId,
            mergeable.map((i) => lineFor(i, Number(i.qty || 1)))
          )
        } catch (err) {
          console.warn('Guest cart merge failed:', err.message)
        } finally {
          mergeInFlight = false
        }
      }

      try {
        const envelope = await fetchCart(custId)
        if (cancelled) return
        applyEnvelope(envelope)
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
  }, [owner, custId, applyItems, applyEnvelope])

  // Add item to cart (local first, then mirror to the backend)
  const addToCart = (product, qty, size, color) => {
    const prev = cartItemsRef.current
    const prodvarId = resolveProdvarId(product, size, color)
    const existingIndex = prev.findIndex(
      (item) =>
        item.product?.id === product.id &&
        item.size === (size ?? null) &&
        (item.color?.name ?? null) === (color?.name ?? null)
    )

    let next
    let target
    if (existingIndex > -1) {
      next = [...prev]
      target = {
        ...next[existingIndex],
        qty: next[existingIndex].qty + qty,
        amount: Number(product.price ?? next[existingIndex].amount ?? 0),
        available: true,
      }
      next[existingIndex] = target
    } else {
      const newItemId = `local-${product.id}-${size ?? ''}-${color?.name || 'def'}-${Date.now()}`
      target = {
        cartItemId: newItemId,
        bagId: null,
        prodvarId,
        prodId: product.prodId ?? product.id ?? null,
        product,
        qty,
        amount: Number(product.price ?? 0),
        lineTotal: Number(product.price ?? 0) * qty,
        size: size ?? null,
        color: color ? toColor(color) : null,
        available: true,
      }
      next = [...prev, target]
    }

    applyItems(next, { selectNew: true })
    setSelectedItemIds((curr) =>
      curr.includes(target.cartItemId) ? curr : [...curr, target.cartItemId]
    )

    // Signed-in customers also get the server row: /cart/add increments the
    // one live line for this variation, so only the added units are sent.
    if (custId) {
      pushLine(
        {
          ...target,
          prodId: prodIdOf(target) ?? product.prodId ?? product.id,
          prodvarId,
        },
        qty
      )
    }
  }

  // Remove item from cart and return it for undo
  const removeFromCart = (cartItemId) => {
    const removedItem = cartItemsRef.current.find((i) => i.cartItemId === cartItemId)
    applyItems(cartItemsRef.current.filter((item) => item.cartItemId !== cartItemId))
    setSelectedItemIds((prev) => prev.filter((id) => id !== cartItemId))

    // FLOW-BAG-05: the server soft-deletes the row addressed by bag_id.
    if (custId && removedItem?.bagId) {
      removeBagRow(removedItem.bagId)
        .then(() => refreshCart())
        .catch((err) => {
          console.warn('Cart remove sync failed:', err.message)
        })
    }
    return removedItem
  }

  // Restore removed item (Undo action): the deleted row stays deleted, so the
  // line is re-created with its quantity and the envelope replaces the ids.
  const restoreItem = (item) => {
    if (!item) return
    applyItems([item, ...cartItemsRef.current])
    setSelectedItemIds((prev) => (prev.includes(item.cartItemId) ? prev : [...prev, item.cartItemId]))
    if (custId && prodIdOf(item)) pushLine(item, Number(item.qty || 1))
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

    if (!custId) return

    if (current.bagId) {
      // FLOW-BAG-05: absolute quantity on that bag row, clamped server-side.
      updateBagQuantity(current.bagId, qty)
        .then(applyEnvelope)
        .catch((err) => console.warn('Quantity sync failed:', err.message))
      return
    }

    // A line that has not reached the server yet: push the delta so the
    // server-side increment lands on the right total.
    pushLine(current, Math.abs(delta))
  }

  /** FLOW-BAG-07: one visible action empties the whole bag. */
  const clearCart = async () => {
    applyItems([])
    setCartCount(0)
    setServerSubtotal(0)
    setSelectedItemIds([])
    if (!custId) return
    try {
      applyEnvelope(await clearCartOnServer())
    } catch (err) {
      console.warn('Clear cart sync failed, falling back to a refresh:', err.message)
      await refreshCart()
    }
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

  // Select all or deselect all items (REQ-CHECKOUT-01 "all at once")
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
      .filter((item) => (type === 'preorder' ? item.product?.preOrder : !item.product?.preOrder))
      .map((item) => item.cartItemId)
    setSelectedItemIds(matchingIds)
  }

  // Dynamic calculations based strictly on selected items (Requirement 4 & 5)
  const selectedItems = cartItems.filter((item) => selectedItemIds.includes(item.cartItemId))
  const subtotal = selectedItems.reduce((sum, item) => sum + amountOf(item), 0)
  const allItemsSubtotal = cartItems.reduce((sum, item) => sum + amountOf(item), 0)
  const total = subtotal // Requirement 6: No tax, Shipping calculated at checkout

  return (
    <CartContext.Provider
      value={{
        cartItems,
        cartCount,
        serverSubtotal: serverSubtotal ?? (cartItems.length ? allItemsSubtotal : 0),
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
