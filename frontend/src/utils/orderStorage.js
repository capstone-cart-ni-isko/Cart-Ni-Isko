// Centralized Order & Fulfillment Lifecycle Store
// Implements the principle:
// "Fulfillment is flexible until the delivery fee is paid. Once the delivery fee is paid,
// the customer's fulfillment choice is locked for the remainder of the order."

import initialOrdersData from '../data/orders.json'

const STORAGE_KEY = 'isko_customer_orders_v1'

// Initial pre-seeded orders with rich fulfillment & Lalamove states
const INITIAL_EXTENDED_ORDERS = [
  ...initialOrdersData.map((order) => {
    if (order.id === 'ORD-8912') {
      // Delivery quote generated, payment pending
      return {
        ...order,
        fulfillment: {
          ...order.fulfillment,
          method: 'Courier Delivery',
          location: 'Door-to-door delivery · Legazpi City, Albay',
          note: 'Lalamove quote generated. Awaiting delivery fee payment.',
        },
        deliveryFee: 280,
        deliveryFeePaid: false,
        deliveryPaymentStatus: 'pending',
        lalamoveStatus: 'quote_generated',
        lalamoveQuote: {
          fee: 280,
          vehicle: 'Motorcycle Express',
          distance: '4.2 km',
          pickupAddress: 'Tindahan ni Isko · BU Student Center Ground Floor, Main Campus',
          dropoffAddress: 'Door-to-door delivery · Legazpi City, Albay',
          eta: '30-45 mins upon dispatch',
        },
      }
    }
    if (order.id === 'ORD-8890') {
      // Ready for Pickup - Flexible
      return {
        ...order,
        deliveryFee: 280,
        deliveryFeePaid: false,
        deliveryPaymentStatus: 'unquoted',
        lalamoveStatus: null,
      }
    }
    return {
      ...order,
      deliveryFee: order.fulfillment?.method === 'Courier Delivery' ? 280 : 0,
      deliveryFeePaid: false,
      deliveryPaymentStatus: 'unquoted',
      lalamoveStatus: null,
    }
  }),
  // Dedicated Scenario Order: Booking Failed (Fee paid, but booking failed)
  {
    id: 'ORD-10294',
    productId: 'prod-4',
    name: 'BU Varsity Jacket',
    price: 1200,
    qty: 1,
    size: 'L',
    color: { name: 'Green/White', value: '#16A34A' },
    image: '/src/assets/Images/unnamed (12).png',
    status: 'PROCESSING',
    statusContext: 'Delivery booking issue. Delivery fee confirmed.',
    type: 'processing',
    date: 'September 19, 2026',
    fulfillment: {
      method: 'Courier Delivery',
      location: '15 Rizal St., Daraga, Albay',
      note: 'Lalamove was unable to create the delivery booking. Staff retrying dispatch.',
    },
    recipient: 'Patricia Gomez',
    phone: '0917-889-1029',
    campus: 'Main Campus',
    college: 'College of Arts and Letters',
    course: 'BA Communication',
    deliveryFee: 280,
    deliveryFeePaid: true,
    deliveryPaymentStatus: 'paid',
    lalamoveStatus: 'booking_failed',
    lalamoveError: 'Lalamove was unable to create the delivery booking.',
    lalamoveQuote: {
      fee: 280,
      vehicle: 'Motorcycle Express',
      distance: '5.8 km',
      pickupAddress: 'Tindahan ni Isko · BU Student Center Ground Floor',
      dropoffAddress: '15 Rizal St., Daraga, Albay',
      eta: '45 mins upon dispatch',
    },
  },
  // Dedicated Scenario Order: Booking Succeeded & In Transit
  {
    id: 'ORD-8923',
    productId: 'prod-1',
    name: 'BU Labels 2025 Hoodie',
    price: 750,
    qty: 1,
    size: 'XL',
    color: { name: 'Navy Blue', value: '#1E3A8A' },
    image: '/src/assets/Images/unnamed (4).png',
    status: 'TO RECEIVE',
    statusContext: 'Courier on the way with your order.',
    type: 'receive',
    date: 'September 18, 2026',
    fulfillment: {
      method: 'Courier Delivery',
      location: 'Unit 402, Bicol University Dormitory, Legazpi City',
      note: 'Driver assigned. Please have your ID ready.',
    },
    recipient: 'Alyssa B.',
    phone: '09123456789',
    campus: 'Main Campus',
    college: 'College of Science',
    course: 'BS Computer Science',
    deliveryFee: 280,
    deliveryFeePaid: true,
    deliveryPaymentStatus: 'paid',
    lalamoveStatus: 'in_transit',
    lalamoveBookingId: 'LLM-839201',
    driver: {
      name: 'Jun M.',
      phone: '0917-555-4321',
      plate: 'AB-8921',
      vehicle: 'Honda Click 125i',
    },
    lalamoveQuote: {
      fee: 280,
      vehicle: 'Motorcycle Express',
      distance: '3.1 km',
      pickupAddress: 'Tindahan ni Isko · BU Student Center Ground Floor',
      dropoffAddress: 'Unit 402, Bicol University Dormitory, Legazpi City',
      eta: 'Arriving in ~20 mins',
    },
  },
]

/**
 * Returns true if the order fulfillment cannot be changed.
 * Rule: Fulfillment is locked once delivery fee is paid OR a Lalamove booking has been created.
 */
export function isFulfillmentLocked(order) {
  if (!order) return false

  // 1. Delivery fee paid
  if (order.deliveryFeePaid || order.deliveryPaymentStatus === 'paid') {
    return true
  }

  // 2. Lalamove booking created or in any downstream stage
  if (order.lalamoveBookingId) {
    return true
  }

  const lockedLalamoveStatuses = [
    'booked',
    'driver_assigned',
    'picked_up',
    'in_transit',
    'delivered',
  ]
  if (order.lalamoveStatus && lockedLalamoveStatuses.includes(order.lalamoveStatus)) {
    return true
  }

  // 3. Status is courier active or completed
  const lockedOrderStatuses = [
    'DRIVER ASSIGNED',
    'PICKED UP',
    'IN TRANSIT',
    'DELIVERED',
  ]
  if (lockedOrderStatuses.includes(order.status?.toUpperCase())) {
    return true
  }

  return false
}

/**
 * Returns true if the customer/staff can switch between Pickup and Delivery.
 */
export function canChangeFulfillment(order) {
  return !isFulfillmentLocked(order)
}

/**
 * Read all orders from localStorage (fallback to pre-seeded)
 */
export function getStoredOrders() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (err) {
    console.warn('Failed to parse orders from localStorage:', err)
  }

  // Initialize storage with pre-seeded data
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_EXTENDED_ORDERS))
  } catch (e) {
    console.warn('Failed to initialize orders in localStorage:', e)
  }
  return INITIAL_EXTENDED_ORDERS
}

/**
 * Save orders to localStorage and notify listeners
 */
export function saveStoredOrders(orders) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
    window.dispatchEvent(new CustomEvent('isko_orders_updated', { detail: orders }))
  } catch (err) {
    console.warn('Failed to save orders to localStorage:', err)
  }
}

/**
 * Get a single order by ID
 */
export function getStoredOrderById(id) {
  const orders = getStoredOrders()
  return orders.find((o) => o.id === id) || null
}

/**
 * Switch an order's fulfillment method between 'Store Pickup' and 'Courier Delivery'
 * Fails if the fulfillment is locked.
 */
export function switchFulfillment(orderId, targetMethod) {
  const orders = getStoredOrders()
  const order = orders.find((o) => o.id === orderId)

  if (!order) {
    return { success: false, error: 'Order not found' }
  }

  if (isFulfillmentLocked(order)) {
    return {
      success: false,
      error: 'Delivery method locked. Your delivery payment has been completed, so the fulfillment method can no longer be changed.',
    }
  }

  const isSwitchingToDelivery = targetMethod === 'Courier Delivery'

  const updatedOrders = orders.map((o) => {
    if (o.id !== orderId) return o

    if (isSwitchingToDelivery) {
      return {
        ...o,
        fulfillment: {
          method: 'Courier Delivery',
          location: o.fulfillment?.location?.includes('BU Student Center')
            ? 'Door-to-door delivery · Legazpi City, Albay'
            : o.fulfillment?.location || 'Door-to-door delivery · Legazpi City, Albay',
          note: 'Lalamove quote generated. Review fee and pay to lock courier delivery.',
        },
        deliveryFee: 280,
        deliveryFeePaid: false,
        deliveryPaymentStatus: 'pending',
        lalamoveStatus: 'quote_generated',
        lalamoveQuote: o.lalamoveQuote || {
          fee: 280,
          vehicle: 'Motorcycle Express',
          distance: '4.5 km',
          pickupAddress: 'Tindahan ni Isko · BU Student Center Ground Floor',
          dropoffAddress: 'Door-to-door delivery · Legazpi City, Albay',
          eta: '30-45 mins upon dispatch',
        },
      }
    } else {
      // Switching back to Store Pickup
      return {
        ...o,
        fulfillment: {
          method: 'Store Pickup',
          location: 'Tindahan ni Isko · BU Student Center Ground Floor',
          note: 'Bring your student ID or order QR pass when claiming at the desk.',
        },
        deliveryFee: 0,
        deliveryFeePaid: false,
        deliveryPaymentStatus: 'unquoted',
        lalamoveStatus: null,
      }
    }
  })

  saveStoredOrders(updatedOrders)
  return {
    success: true,
    order: updatedOrders.find((o) => o.id === orderId),
  }
}

/**
 * Pay the delivery fee (₱280).
 * Permanently locks the fulfillment method to Delivery and triggers Lalamove booking.
 */
export function payDeliveryFee(orderId, paymentMethod = 'GCash', shouldSimulateFailure = false) {
  const orders = getStoredOrders()
  const order = orders.find((o) => o.id === orderId)

  if (!order) {
    return { success: false, error: 'Order not found' }
  }

  // Once paid, fulfillment is permanently locked
  const updatedOrders = orders.map((o) => {
    if (o.id !== orderId) return o

    if (shouldSimulateFailure) {
      // Booking failure scenario: payment received, booking failed, fulfillment stays Delivery!
      return {
        ...o,
        deliveryFee: 280,
        deliveryFeePaid: true,
        deliveryPaymentStatus: 'paid',
        deliveryPaymentMethod: paymentMethod,
        lalamoveStatus: 'booking_failed',
        lalamoveError: 'Lalamove was unable to create the delivery booking.',
        fulfillment: {
          ...o.fulfillment,
          method: 'Courier Delivery',
          note: 'Delivery fee confirmed. Resolving courier dispatch with Lalamove.',
        },
      }
    }

    // Booking success scenario
    return {
      ...o,
      deliveryFee: 280,
      deliveryFeePaid: true,
      deliveryPaymentStatus: 'paid',
      deliveryPaymentMethod: paymentMethod,
      lalamoveStatus: 'booked',
      lalamoveBookingId: 'LLM-839201',
      status: o.status === 'CONFIRMED' || o.status === 'PROCESSING' ? 'PROCESSING' : o.status,
      fulfillment: {
        ...o.fulfillment,
        method: 'Courier Delivery',
        note: 'Lalamove booking confirmed (LLM-839201). Awaiting courier dispatch.',
      },
      driver: {
        name: 'Jun M.',
        phone: '0917-555-4321',
        plate: 'AB-8921',
        vehicle: 'Honda Click 125i',
      },
    }
  })

  saveStoredOrders(updatedOrders)
  return {
    success: true,
    order: updatedOrders.find((o) => o.id === orderId),
  }
}

/**
 * Retry Lalamove booking for an order whose delivery fee was already paid
 */
export function retryLalamoveBooking(orderId) {
  const orders = getStoredOrders()
  const order = orders.find((o) => o.id === orderId)

  if (!order) {
    return { success: false, error: 'Order not found' }
  }

  const updatedOrders = orders.map((o) => {
    if (o.id !== orderId) return o

    return {
      ...o,
      deliveryFeePaid: true,
      deliveryPaymentStatus: 'paid',
      lalamoveStatus: 'booked',
      lalamoveBookingId: 'LLM-839201',
      lalamoveError: null,
      status: o.status === 'PROCESSING' ? 'TO RECEIVE' : o.status,
      fulfillment: {
        ...o.fulfillment,
        method: 'Courier Delivery',
        note: 'Lalamove booking successfully confirmed (LLM-839201).',
      },
      driver: {
        name: 'Jun M.',
        phone: '0917-555-4321',
        plate: 'AB-8921',
        vehicle: 'Honda Click 125i',
      },
    }
  })

  saveStoredOrders(updatedOrders)
  return {
    success: true,
    order: updatedOrders.find((o) => o.id === orderId),
  }
}

/**
 * Add a new order created from Customer Checkout
 */
export function addCustomerOrder(orderData) {
  const orders = getStoredOrders()
  const newOrder = {
    id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    type: 'processing',
    status: 'PROCESSING',
    statusContext: 'Order received and being processed by Tindahan ni Isko.',
    deliveryFee: orderData.fulfillment?.method === 'Courier Delivery' ? 280 : 0,
    deliveryFeePaid: false,
    deliveryPaymentStatus: orderData.fulfillment?.method === 'Courier Delivery' ? 'pending' : 'unquoted',
    lalamoveStatus: orderData.fulfillment?.method === 'Courier Delivery' ? 'quote_generated' : null,
    lalamoveQuote: orderData.fulfillment?.method === 'Courier Delivery' ? {
      fee: 280,
      vehicle: 'Motorcycle Express',
      distance: '4.5 km',
      pickupAddress: 'Tindahan ni Isko · BU Student Center Ground Floor',
      dropoffAddress: orderData.fulfillment?.location || 'Legazpi City, Albay',
      eta: '30-45 mins upon dispatch',
    } : null,
    ...orderData,
  }

  const updatedOrders = [newOrder, ...orders]
  saveStoredOrders(updatedOrders)
  return newOrder
}
