import { createContext, useState, useEffect, useCallback } from 'react'
import { INITIAL_ADMIN_DATA } from '../data/adminMockData.js'
import { employeeLogin, mapEmployee } from '../services/auth.js'
import { ApiError } from '../services/api.js'

export const AdminContext = createContext(null)

const STORAGE_KEY = 'isko_admin_state_v4'
const AUTH_STORAGE_KEY = 'isko_admin_auth_v4'

export const DEFAULT_ADMIN_USERS = [
  {
    id: 'usr-1',
    name: 'Super Admin',
    firstName: 'Super',
    lastName: 'Admin',
    email: 'superadmin@bicol-u.edu.ph',
    phone: '+63 912 345 6789',
    role: 'Super Admin',
    roleKey: 'SUPER_ADMIN',
    avatar: 'SA',
    avatarBg: 'orange',
    status: 'Active',
    permissions: 'Full System Access',
    modules: ['products', 'orders', 'analytics', 'content', 'settings'],
    dateAdded: 'Aug 01, 2026',
    isOriginal: true,
  },
  {
    id: 'usr-2',
    name: 'Maria Santos',
    firstName: 'Maria',
    lastName: 'Santos',
    email: 'm.santos@tindahan.nisko.edu.ph',
    phone: '+63 917 555 1234',
    role: 'Store Administrator',
    roleKey: 'ADMIN',
    avatar: 'MS',
    avatarImage: '/src/assets/avatar.png',
    avatarBg: 'blue',
    status: 'Active',
    permissions: 'Products, Orders, Inventory, Schedule',
    modules: ['products', 'orders', 'analytics'],
    dateAdded: 'Aug 10, 2026',
    isOriginal: false,
  },
  {
    id: 'usr-3',
    name: 'Juan Cruz',
    firstName: 'Juan',
    lastName: 'Cruz',
    email: 'juan.cruz@tindahan.nisko.edu.ph',
    phone: '+63 918 555 4321',
    role: 'Staff Member',
    roleKey: 'STAFF',
    avatar: 'JC',
    avatarBg: 'purple',
    status: 'Active',
    permissions: 'Fulfillment, Orders, POS',
    modules: ['orders'],
    dateAdded: 'Aug 12, 2026',
    isOriginal: false,
  },
  {
    id: 'usr-4',
    name: 'Elena Reyes',
    firstName: 'Elena',
    lastName: 'Reyes',
    email: 'elena.reyes@tindahan.nisko.edu.ph',
    phone: '+63 919 555 9876',
    role: 'Staff Member',
    roleKey: 'STAFF',
    avatar: 'ER',
    avatarBg: 'teal',
    status: 'Active',
    permissions: 'POS Register, Claims',
    modules: ['orders', 'content'],
    dateAdded: 'Aug 15, 2026',
    isOriginal: false,
  },
]

export function AdminProvider({ children }) {
  // Admin Authentication State
  const [currentAdminUser, setCurrentAdminUser] = useState(() => {
    try {
      const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY)
      if (savedAuth) {
        return JSON.parse(savedAuth)
      }
    } catch (e) {
      console.warn('Failed to parse admin auth:', e)
    }
    return DEFAULT_ADMIN_USERS[1] // Maria Santos (Store Administrator)
  })

  // Admin Data State with complete fallback merge
  const [adminState, setAdminState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          ...INITIAL_ADMIN_DATA,
          ...parsed,
          dashboardKPIs: { ...INITIAL_ADMIN_DATA.dashboardKPIs, ...(parsed.dashboardKPIs || {}) },
          fulfillmentKPIs: { ...INITIAL_ADMIN_DATA.fulfillmentKPIs, ...(parsed.fulfillmentKPIs || {}) },
          ordersKPIs: { ...INITIAL_ADMIN_DATA.ordersKPIs, ...(parsed.ordersKPIs || {}) },
          analyticsKPIs: { ...INITIAL_ADMIN_DATA.analyticsKPIs, ...(parsed.analyticsKPIs || {}) },
          storeSettings: { ...INITIAL_ADMIN_DATA.storeSettings, ...(parsed.storeSettings || {}) },
          orders: Array.isArray(parsed.orders) && parsed.orders.length > 0 ? parsed.orders : INITIAL_ADMIN_DATA.orders,
          products: Array.isArray(parsed.products) && parsed.products.length > 0 ? parsed.products : INITIAL_ADMIN_DATA.products,
          logisticsOrders: Array.isArray(parsed.logisticsOrders) && parsed.logisticsOrders.length > 0 ? parsed.logisticsOrders : INITIAL_ADMIN_DATA.logisticsOrders,
          reviews: Array.isArray(parsed.reviews) && parsed.reviews.length > 0 ? parsed.reviews : INITIAL_ADMIN_DATA.reviews,
          officers: Array.isArray(parsed.officers) && parsed.officers.length > 0 ? parsed.officers : INITIAL_ADMIN_DATA.officers,
          dutyRequests: Array.isArray(parsed.dutyRequests) ? parsed.dutyRequests : INITIAL_ADMIN_DATA.dutyRequests,
          alerts: Array.isArray(parsed.alerts) ? parsed.alerts : INITIAL_ADMIN_DATA.alerts,
          adminUsers: Array.isArray(parsed.adminUsers) && parsed.adminUsers.length > 0 ? parsed.adminUsers : DEFAULT_ADMIN_USERS,
        }
      }
    } catch (e) {
      console.warn('Failed to parse admin state from localStorage:', e)
    }
    return {
      ...INITIAL_ADMIN_DATA,
      adminUsers: DEFAULT_ADMIN_USERS,
    }
  })

  // POS in-memory cart state
  const [posCart, setPosCart] = useState([
    {
      id: 'prod-11',
      name: 'Tatak BUEÑO Cap',
      variant: 'One Size, Black',
      price: 300.0,
      qty: 1,
      image: '/src/assets/Branding/Copy of cap.png',
    },
    {
      id: 'prod-7',
      name: 'BUnique Pins',
      variant: 'Standard Metallic',
      price: 50.0,
      qty: 1,
      image: '/src/assets/Branding/Copy of badge.png',
    },
  ])

  // Sync admin state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(adminState))
    } catch (e) {
      console.warn('Failed to save admin state:', e)
    }
  }, [adminState])

  // Sync auth state to localStorage
  useEffect(() => {
    try {
      if (currentAdminUser) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentAdminUser))
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY)
      }
    } catch (e) {
      console.warn('Failed to save admin auth:', e)
    }
  }, [currentAdminUser])

  // ── ADMIN AUTHENTICATION ACTIONS ──
  const loginAdmin = useCallback(async (emailOrUsername, password) => {
    const users = adminState.adminUsers || DEFAULT_ADMIN_USERS
    const cleanInput = (emailOrUsername || '').trim().toLowerCase()

    try {
      const employee = await employeeLogin(emailOrUsername.trim(), password)
      const mapped = mapEmployee(employee)
      setCurrentAdminUser(mapped)
      return { success: true, user: mapped }
    } catch (err) {
      if (err instanceof ApiError) {
        return { success: false, error: err.message || 'Invalid staff credentials. Access denied.' }
      }
    }

    const found = users.find(
      (u) =>
        u.email.toLowerCase() === cleanInput ||
        u.name.toLowerCase() === cleanInput
    )

    if (found) {
      setCurrentAdminUser(found)
      return { success: true, user: found }
    }

    return { success: false, error: 'Invalid staff credentials. Access denied.' }
  }, [adminState.adminUsers])

  const logoutAdmin = useCallback(() => {
    setCurrentAdminUser(null)
  }, [])

  const switchAdminUser = useCallback((userId) => {
    const users = adminState.adminUsers || DEFAULT_ADMIN_USERS
    const target = users.find((u) => u.id === userId)
    if (target) {
      setCurrentAdminUser(target)
    }
  }, [adminState.adminUsers])

  const updateCurrentAdminProfile = useCallback((updatedFields) => {
    setCurrentAdminUser((prev) => {
      if (!prev) return prev
      const updated = { ...prev, ...updatedFields }
      return updated
    })

    setAdminState((prev) => {
      const currentId = currentAdminUser?.id
      if (!currentId) return prev
      return {
        ...prev,
        adminUsers: (prev.adminUsers || DEFAULT_ADMIN_USERS).map((u) =>
          u.id === currentId ? { ...u, ...updatedFields } : u
        ),
      }
    })
  }, [currentAdminUser?.id])

  // ── SUPER ADMIN USER MANAGEMENT ACTIONS ──
  const addAdminUser = useCallback((userData) => {
    const initials = (userData.name || 'Staff')
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || 'ST'

    const colorPalette = ['orange', 'blue', 'purple', 'teal']
    const randomColor = colorPalette[Math.floor(Math.random() * colorPalette.length)]

    const defaultPerm =
      userData.role === 'Super Admin'
        ? 'Full System Access'
        : userData.role === 'Admin'
        ? 'Products, Orders, Inventory, Schedule'
        : 'POS Register, Claims'

    const newUser = {
      id: `usr-${Date.now()}`,
      status: userData.status || 'Active',
      avatar: initials,
      avatarBg: userData.avatarBg || randomColor,
      dateAdded: 'Today',
      isOriginal: false,
      role: userData.role || 'Staff',
      roleKey: userData.role === 'Super Admin' ? 'SUPER_ADMIN' : userData.role === 'Admin' ? 'ADMIN' : 'STAFF',
      permissions: userData.permissions || defaultPerm,
      modules: userData.modules || ['orders'],
      phone: userData.phone || '+63 912 345 6789',
      ...userData,
    }

    setAdminState((prev) => ({
      ...prev,
      adminUsers: [...(prev.adminUsers || DEFAULT_ADMIN_USERS), newUser],
    }))
    return newUser
  }, [])

  const updateAdminUser = useCallback((userId, updatedData) => {
    setAdminState((prev) => ({
      ...prev,
      adminUsers: (prev.adminUsers || DEFAULT_ADMIN_USERS).map((u) => {
        if (u.id !== userId) return u
        const updated = { ...u, ...updatedData }
        if (updatedData.name && !updatedData.avatar) {
          updated.avatar =
            updatedData.name
              .split(' ')
              .filter(Boolean)
              .map((n) => n[0])
              .join('')
              .substring(0, 2)
              .toUpperCase() || u.avatar
        }
        if (updatedData.role) {
          updated.roleKey =
            updatedData.role === 'Super Admin' ? 'SUPER_ADMIN' : updatedData.role === 'Admin' ? 'ADMIN' : 'STAFF'
        }
        return updated
      }),
    }))
  }, [])

  const deleteAdminUser = useCallback((userId) => {
    setAdminState((prev) => ({
      ...prev,
      adminUsers: (prev.adminUsers || DEFAULT_ADMIN_USERS).filter(
        (u) => u.id !== userId && !u.isOriginal
      ),
    }))
  }, [])

  // ── ORDER ACTIONS ──
  const updateOrderStatus = useCallback((orderId, newStatus) => {
    setAdminState((prev) => ({
      ...prev,
      orders: (prev.orders || []).map((order) =>
        order.id === orderId ? { ...order, status: newStatus } : order
      ),
    }))
  }, [])

  const addOrder = useCallback((orderData) => {
    const newOrder = {
      id: `#ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      batch: `BAT-00${Math.floor(18 + Math.random() * 10)}`,
      date: 'Just now',
      timeAgo: 'Just now',
      ...orderData,
    }
    setAdminState((prev) => ({
      ...prev,
      orders: [newOrder, ...(prev.orders || [])],
      dashboardKPIs: {
        ...prev.dashboardKPIs,
        totalOrders: (prev.dashboardKPIs?.totalOrders || 0) + 1,
        grossSales: (prev.dashboardKPIs?.grossSales || 0) + (newOrder.total || 0),
      },
    }))
    return newOrder
  }, [])

  // ── LOGISTICS & FULFILLMENT ACTIONS ──
  const updateLogisticsStage = useCallback((orderId, newStage, extra = {}) => {
    setAdminState((prev) => ({
      ...prev,
      logisticsOrders: (prev.logisticsOrders || []).map((item) =>
        item.id === orderId
          ? {
              ...item,
              stage: newStage,
              ...extra,
              action:
                newStage === 'Ready'
                  ? 'Hand Over Item'
                  : newStage === 'Packing'
                  ? 'Dispatch / Track'
                  : newStage === 'Delayed'
                  ? 'Notify'
                  : newStage === 'Completed'
                  ? 'Fulfilled'
                  : 'Start Packing',
              isCompleted: newStage === 'Completed',
            }
          : item
      ),
    }))
  }, [])

  const batchCompleteLogistics = useCallback((orderIds) => {
    setAdminState((prev) => ({
      ...prev,
      logisticsOrders: (prev.logisticsOrders || []).map((item) =>
        orderIds.includes(item.id)
          ? { ...item, stage: 'Completed', action: 'Fulfilled', isCompleted: true }
          : item
      ),
    }))
  }, [])

  // ── PRODUCT & INVENTORY ACTIONS ──
  const toggleProductPublished = useCallback((productId) => {
    setAdminState((prev) => ({
      ...prev,
      products: (prev.products || []).map((p) =>
        p.id === productId
          ? {
              ...p,
              published: !p.published,
              status: !p.published ? 'Published' : 'Draft',
            }
          : p
      ),
    }))
  }, [])

  const addProduct = useCallback((product) => {
    const newProduct = {
      id: `prod-${Date.now()}`,
      orders: 0,
      published: true,
      status: 'Published',
      image: '/src/assets/Images/unnamed (1).png',
      ...product,
    }
    setAdminState((prev) => ({
      ...prev,
      products: [newProduct, ...(prev.products || [])],
    }))
    return newProduct
  }, [])

  const updateProduct = useCallback((productId, updatedFields) => {
    setAdminState((prev) => ({
      ...prev,
      products: (prev.products || []).map((p) =>
        p.id === productId ? { ...p, ...updatedFields } : p
      ),
    }))
  }, [])

  const deleteProduct = useCallback((productId) => {
    setAdminState((prev) => ({
      ...prev,
      products: (prev.products || []).filter((p) => p.id !== productId),
    }))
  }, [])

  const adjustStock = useCallback((productId, newStock) => {
    setAdminState((prev) => ({
      ...prev,
      products: (prev.products || []).map((p) =>
        p.id === productId
          ? {
              ...p,
              stock: Math.max(0, newStock),
              status: newStock === 0 ? 'Out of Stock' : p.published ? 'Published' : 'Draft',
            }
          : p
      ),
    }))
  }, [])

  // ── REVIEWS MODERATION ACTIONS ──
  const approveReview = useCallback((reviewId) => {
    setAdminState((prev) => ({
      ...prev,
      reviews: (prev.reviews || []).map((r) =>
        r.id === reviewId ? { ...r, status: 'approved', flagged: false } : r
      ),
    }))
  }, [])

  const rejectReview = useCallback((reviewId) => {
    setAdminState((prev) => ({
      ...prev,
      reviews: (prev.reviews || []).map((r) =>
        r.id === reviewId ? { ...r, status: 'rejected' } : r
      ),
    }))
  }, [])

  const assignReviewToSupport = useCallback((reviewId, note = '') => {
    setAdminState((prev) => ({
      ...prev,
      reviews: (prev.reviews || []).map((r) =>
        r.id === reviewId
          ? {
              ...r,
              status: 'assigned_support',
              supportNote: note || 'Assigned to Customer Support Tier 2',
            }
          : r
      ),
    }))
  }, [])

  const replyToReview = useCallback((reviewId, replyText) => {
    setAdminState((prev) => ({
      ...prev,
      reviews: (prev.reviews || []).map((r) =>
        r.id === reviewId ? { ...r, reply: replyText, status: 'approved' } : r
      ),
    }))
  }, [])

  // ── SCHEDULE & SHIFT ACTIONS ──
  const assignDutyShift = useCallback((officerId, shift) => {
    setAdminState((prev) => ({
      ...prev,
      officers: (prev.officers || []).map((off) =>
        off.id === officerId
          ? {
              ...off,
              shifts: [...(off.shifts || []).filter((s) => s.type !== 'open_slot'), shift],
              available: false,
              availability: `${shift.time} (${shift.title})`,
            }
          : off
      ),
    }))
  }, [])

  const approveDutyRequest = useCallback((requestId) => {
    setAdminState((prev) => {
      const req = (prev.dutyRequests || []).find((r) => r.id === requestId)
      return {
        ...prev,
        dutyRequests: (prev.dutyRequests || []).filter((r) => r.id !== requestId),
        officers: (prev.officers || []).map((off) =>
          req && off.name === req.officerName
            ? {
                ...off,
                availability: req.requestedShift,
                shifts: [
                  ...(off.shifts || []),
                  { time: '1:00 PM - 3:00 PM', type: 'desk_duty', title: 'Desk Duty' },
                ],
              }
            : off
        ),
      }
    })
  }, [])

  const rejectDutyRequest = useCallback((requestId) => {
    setAdminState((prev) => ({
      ...prev,
      dutyRequests: (prev.dutyRequests || []).filter((r) => r.id !== requestId),
    }))
  }, [])

  // ── STORE CUSTOMIZATION & SETTINGS ACTIONS ──
  const updateStoreSettings = useCallback((newSettings) => {
    setAdminState((prev) => ({
      ...prev,
      storeSettings: {
        ...(prev.storeSettings || INITIAL_ADMIN_DATA.storeSettings),
        ...newSettings,
      },
    }))
  }, [])

  // ── ALERTS ACTIONS ──
  const resolveAlert = useCallback((alertId) => {
    setAdminState((prev) => ({
      ...prev,
      alerts: (prev.alerts || []).filter((a) => a.id !== alertId),
    }))
  }, [])

  // ── POS REGISTER CART ACTIONS ──
  const posAddToCart = useCallback((product, variantName = 'Standard') => {
    setPosCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.id === product.id && item.variant === variantName
      )
      if (existingIdx > -1) {
        const next = [...prev]
        next[existingIdx].qty += 1
        return next
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          variant: variantName,
          price: product.price,
          qty: 1,
          image: product.image,
        },
      ]
    })
  }, [])

  const posUpdateQty = useCallback((index, newQty) => {
    setPosCart((prev) => {
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== index)
      }
      const next = [...prev]
      next[index] = { ...next[index], qty: newQty }
      return next
    })
  }, [])

  const posRemoveItem = useCallback((index) => {
    setPosCart((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const posClearCart = useCallback(() => {
    setPosCart([])
  }, [])

  const posCheckout = useCallback(
    ({ paymentMethod = 'Cash', customerName = 'Walk-in Customer', studentId = 'N/A', amountTendered = 0 }) => {
      const subtotal = posCart.reduce((sum, item) => sum + item.price * item.qty, 0)
      const newOrder = {
        id: `#ORD-${Math.floor(1000 + Math.random() * 9000)}`,
        batch: 'BAT-POS',
        customer: customerName || 'Walk-in Customer',
        date: 'Just now',
        type: 'Onsite Regular',
        fulfillment: 'Instant POS',
        status: 'Completed',
        total: subtotal,
        timeAgo: 'Just now',
        paymentMethod,
        studentId,
        amountTendered,
        change: amountTendered >= subtotal ? amountTendered - subtotal : 0,
        items: posCart.map((i) => ({ name: i.name, qty: i.qty, price: i.price, size: i.variant })),
      }

      setAdminState((prev) => ({
        ...prev,
        orders: [newOrder, ...(prev.orders || [])],
        logisticsOrders: [
          {
            id: newOrder.id,
            customer: newOrder.customer,
            method: 'Instant POS',
            methodType: 'pos',
            details: 'Instant POS\nWalk-in',
            stage: 'Completed',
            action: 'Fulfilled',
            actionKey: 'fulfilled',
            isCompleted: true,
          },
          ...(prev.logisticsOrders || []),
        ],
        dashboardKPIs: {
          ...(prev.dashboardKPIs || INITIAL_ADMIN_DATA.dashboardKPIs),
          totalOrders: ((prev.dashboardKPIs || {}).totalOrders || 0) + 1,
          grossSales: ((prev.dashboardKPIs || {}).grossSales || 0) + subtotal,
        },
      }))

      setPosCart([])
      return newOrder
    },
    [posCart]
  )

  const isSuperAdmin = currentAdminUser?.roleKey === 'SUPER_ADMIN' || currentAdminUser?.role === 'Super Admin'

  return (
    <AdminContext.Provider
      value={{
        adminState,
        posCart,
        currentAdminUser,
        isSuperAdmin,
        loginAdmin,
        logoutAdmin,
        switchAdminUser,
        updateCurrentAdminProfile,
        addAdminUser,
        updateAdminUser,
        deleteAdminUser,
        updateOrderStatus,
        addOrder,
        updateLogisticsStage,
        batchCompleteLogistics,
        toggleProductPublished,
        addProduct,
        updateProduct,
        deleteProduct,
        adjustStock,
        approveReview,
        rejectReview,
        assignReviewToSupport,
        replyToReview,
        assignDutyShift,
        approveDutyRequest,
        rejectDutyRequest,
        updateStoreSettings,
        resolveAlert,
        posAddToCart,
        posUpdateQty,
        posRemoveItem,
        posClearCart,
        posCheckout,
      }}
    >
      {children}
    </AdminContext.Provider>
  )
}
