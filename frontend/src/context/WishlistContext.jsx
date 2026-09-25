/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import {
  addWishlistItem,
  fetchWishlist,
  removeWishlistItem,
  wishlistKey,
} from '../services/wishlist.js'

export const WishlistContext = createContext(null)

const OWNER_KEY = 'isko_wishlist_owner'
const GUEST = 'guest'

function readLocal() {
  try {
    const saved = localStorage.getItem('isko_wishlist')
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

/** REQ-CW-01: Check if a wishlist product is still offered (not removed from catalog). */
function isProductOffered(product) {
  if (!product) return false
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

  // Persist locally so guests keep their picks across reloads.
  useEffect(() => {
    localStorage.setItem('isko_wishlist', JSON.stringify(wishlistItems))
  }, [wishlistItems])

  // Whenever the signed-in customer changes, reload from the backend so the
  // list always reflects Supabase rather than a stale local copy.
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

      // Optimistic update, reverted if the backend rejects it.
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

  return (
    <WishlistContext.Provider
      value={{
        wishlistItems,
        toggleWishlist,
        isInWishlist,
        isProductOffered,
        canAddToCart: (product) => isProductOffered(product),
      }}
    >
      {children}
    </WishlistContext.Provider>
  )
}
