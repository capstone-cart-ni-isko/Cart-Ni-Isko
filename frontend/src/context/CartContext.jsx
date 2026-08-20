import { createContext, useState, useEffect } from 'react'

export const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(() => {
    const saved = localStorage.getItem('isko_cart')
    return saved ? JSON.parse(saved) : []
  })

  useEffect(() => {
    localStorage.setItem('isko_cart', JSON.stringify(cartItems))
  }, [cartItems])

  const addToCart = (product, qty, size, color) => {
    setCartItems((prev) => {
      // Find if item with same ID, size and color already exists
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
        return next
      }

      return [
        ...prev,
        {
          cartItemId: `${product.id}-${size}-${color.name}-${Date.now()}`,
          product,
          qty,
          size,
          color,
        },
      ]
    })
  }

  const removeFromCart = (cartItemId) => {
    setCartItems((prev) => prev.filter((item) => item.cartItemId !== cartItemId))
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
  }

  const subtotal = cartItems.reduce((sum, item) => sum + item.product.price * item.qty, 0)
  const shipping = subtotal > 0 ? 50 : 0 // flat rate ₱50 shipping
  const tax = Math.round(subtotal * 0.08) // ~8% tax
  const total = subtotal + shipping + tax

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        subtotal,
        shipping,
        tax,
        total,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}
