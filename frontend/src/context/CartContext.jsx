/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect } from 'react'

export const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(() => {
    const saved = localStorage.getItem('isko_cart')
    return saved ? JSON.parse(saved) : []
  })

  // Selection state: array of selected cartItemId strings
  const [selectedItemIds, setSelectedItemIds] = useState(() => {
    const saved = localStorage.getItem('isko_cart')
    const items = saved ? JSON.parse(saved) : []
    return items.map((i) => i.cartItemId)
  })

  // Save cart items to local storage
  useEffect(() => {
    localStorage.setItem('isko_cart', JSON.stringify(cartItems))
  }, [cartItems])

  // Add item to cart
  const addToCart = (product, qty, size, color) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.product.id === product.id &&
          item.size === size &&
          (item.color?.name ?? null) === (color?.name ?? null)
      )

      if (existingIndex > -1) {
        const next = [...prev]
        next[existingIndex] = {
          ...next[existingIndex],
          qty: next[existingIndex].qty + qty,
        }
        // Ensure it is selected
        setSelectedItemIds((curr) =>
          curr.includes(next[existingIndex].cartItemId)
            ? curr
            : [...curr, next[existingIndex].cartItemId]
        )
        return next
      }

      const newItemId = `${product.id}-${size}-${color?.name || 'def'}-${Date.now()}`
      setSelectedItemIds((curr) => [...curr, newItemId])

      return [
        ...prev,
        {
          cartItemId: newItemId,
          product,
          qty,
          size,
          color,
        },
      ]
    })
  }

  // Remove item from cart and return it for undo
  const removeFromCart = (cartItemId) => {
    const removedItem = cartItems.find((i) => i.cartItemId === cartItemId)
    setCartItems((prev) => prev.filter((item) => item.cartItemId !== cartItemId))
    setSelectedItemIds((prev) => prev.filter((id) => id !== cartItemId))
    return removedItem
  }

  // Restore removed item (Undo action)
  const restoreItem = (item) => {
    if (!item) return
    setCartItems((prev) => [item, ...prev])
    setSelectedItemIds((prev) => [...prev, item.cartItemId])
  }

  const updateQuantity = (cartItemId, qty) => {
    if (qty <= 0) {
      removeFromCart(cartItemId)
      return
    }
    setCartItems((prev) =>
      prev.map((item) => (item.cartItemId === cartItemId ? { ...item, qty } : item))
    )
  }

  const clearCart = () => {
    setCartItems([])
    setSelectedItemIds([])
  }

  // Clear only selected items (upon checkout)
  const clearSelectedItems = () => {
    setCartItems((prev) => prev.filter((i) => !selectedItemIds.includes(i.cartItemId)))
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
  const subtotal = selectedItems.reduce((sum, item) => sum + item.product.price * item.qty, 0)
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
        subtotal,
        total,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}
