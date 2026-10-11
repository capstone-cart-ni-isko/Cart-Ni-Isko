/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import {
  addWishlistItem,
  addWishlistToBag,
  fetchWishlist,
  removeWishlistItem,
  wishlistKey,
} from '../services/wishlist.js'
import { notifyCartChanged } from './CartContext.jsx'

export const WishlistContext = createContext(null)

const OWNER_KEY = 'isko_wishlist_owner'
const GUEST = 'guest'

function readLocal() {
  try {
    const saved = localStorage.getItem('isko_wishlist')
    const rows = saved ? JSON.parse(saved) : []
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

/**
 * FLOW-WISHLIST-07: a saved product that is no longer offered must stay on the
 * list - the server ships `available` on every row - so it is only flagged
 * here, never filtered out.
 */
function isProductOffered(product) {
  if (!product) return false
  if (product.available === false) return false
  return product.status !== 'Disabled' && product.status !== 'Deleted'
}

export function WishlistProvider({ children }) {
  const { currentUser } = useAuth()
  const { showToast } = useToast()

  // The real customer id from the API - never a hardcoded value.
  const custId = currentUser?.cust_id ?? currentUser?.id ?? null
  const owner = custId ? String(custId) : GUEST

  const [wishlistItems, setWishlistItems] = useState(readLocal)
  const hydratedFor = useRef(null)

  // Persist locally so guests keep their picks across reloads (REQ-WISHLIST-01
  // keeps the server as the source of truth; this mirror covers signed-out use
  // and API outages).
  useEffect(() => {
    localStorage.setItem('isko_wishlist', JSON.stringify(wishlistItems))
  }, [wishlistItems])

  // Whenever the signed-in customer changes, reload from the backend so the
  // list always reflects the API rather than a stale local copy. The server
  // answers wish_created DESC (FLOW-WISHLIST-03) and the array is rendered
  // exactly as it arrives.
  useEffect(() => {
    if (hydratedFor.current === owner) return
    hydratedFor.current = owner

    let cancelled = false

    ;(async () => {
      const storedOwner = localStorage.getItem(OWNER_KEY)

      if (!custId) {
        // Signed out: drop another customer's cached list, keep guest picks.
        if (storedOwner && storedOwner !== GUEST) {
          setWishlistItems([])
        }
        localStorage.setItem(OWNER_KEY, GUEST)
        return
      }

      try {
        const serverItems = await fetchWishlist(custId)
        if (cancelled) return
        setWishlistItems(serverItems)
        localStorage.setItem(OWNER_KEY, String(custId))
      } catch (err) {
        if (cancelled) return
        console.warn('Wishlist hydration failed, using local list:', err.message)
        // A cached list from a different account must never leak across users.
        if (storedOwner && storedOwner !== String(custId)) {
          setWishlistItems([])
        }
        localStorage.setItem(OWNER_KEY, String(custId))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [owner, custId])

  const toggleWishlist = useCallback(
    async (product) => {
      const key = wishlistKey(product)
      if (!key) return

      if (!custId) {
        showToast('Sign in to save items to your wishlist.', 'error')
        return
      }

      const exists = wishlistItems.some((item) => item.id === product.id)

      // Optimistic update, reverted if the backend rejects it. The server
      // soft-deletes (wish_hidden) on remove - REQ-WISHLIST-02 - so the row
      // simply disappears from the next display.
      setWishlistItems((prev) =>
        exists ? prev.filter((item) => item.id !== product.id) : [...prev, product]
      )

      try {
        if (exists) {
          await removeWishlistItem(custId, key)
        } else {
          await addWishlistItem(custId, key, 1, product.price)
        }
      } catch (err) {
        setWishlistItems((prev) =>
          exists
            ? prev.some((item) => item.id === product.id)
              ? prev
              : [...prev, product]
            : prev.filter((item) => item.id !== product.id)
        )
        showToast(err.message || 'Could not update wishlist. Please try again.', 'error')
      }
    },
    [custId, wishlistItems, showToast]
  )

  const isInWishlist = useCallback(
    (productId) => wishlistItems.some((item) => item.id === productId),
    [wishlistItems]
  )

  /**
   * FLOW-WISHLIST-06: put a saved item straight into the bag. The backend
   * creates the live bag line (POST /wishlist/to_order) and answers with the
   * cart envelope, so the bag badge is refreshed from cart_count right away.
   */
  const addToBag = useCallback(
    async (product, qty = 1) => {
      const key = wishlistKey(product)
      if (!key) return false

      if (!custId) {
        showToast('Sign in to add wishlist items to your bag.', 'error')
        return false
      }
      if (!isProductOffered(product)) {
        showToast('This item is no longer available.', 'error')
        return false
      }

      try {
        await addWishlistToBag(custId, key, qty)
        notifyCartChanged()
        showToast(`Added "${product.name}" to your bag.`, 'success')
        return true
      } catch (err) {
        showToast(err.message || 'Could not add this item to your bag.', 'error')
        return false
      }
    },
    [custId, showToast]
  )

  return (
    <WishlistContext.Provider
      value={{
        wishlistItems,
        toggleWishlist,
        isInWishlist,
        isProductOffered,
        canAddToCart: (product) => isProductOffered(product),
        addToBag,
      }}
    >
      {children}
    </WishlistContext.Provider>
  )
}
