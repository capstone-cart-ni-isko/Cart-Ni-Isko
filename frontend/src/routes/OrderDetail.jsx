import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import AccountLayout from '../components/layout/AccountLayout.jsx'
import PageTitle from '../components/ui/PageTitle.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { formatPrice } from '../components/ui/PriceTag.jsx'
import productsData from '../data/products.json'
import { getImageUrl } from '../utils/imageUtils.js'
import { PackageIcon, ShirtIcon, TruckIcon, MapPinIcon, MessageSquareIcon, LockIcon } from '../components/ui/Icons.jsx'
import {
  getStoredOrderById,
  switchFulfillment,
  payDeliveryFee,
  retryLalamoveBooking,
  isFulfillmentLocked,
  canChangeFulfillment,
  canSwitchToPickup,
  canSwitchToDelivery,
} from '../utils/orderStorage.js'

function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [order, setOrder] = useState(() => getStoredOrderById(id))
  const [showPayModal, setShowPayModal] = useState(false)
  const [payMethod, setPayMethod] = useState('GCash')
  const [simulateFailure, setSimulateFailure] = useState(false)
  const [isProcessingPay, setIsProcessingPay] = useState(false)

  // Keep order in sync with storage updates
  useEffect(() => {
    const handleStorageUpdate = () => {
      setOrder(getStoredOrderById(id))
    }
    window.addEventListener('isko_orders_updated', handleStorageUpdate)
    return () => window.removeEventListener('isko_orders_updated', handleStorageUpdate)
  }, [id])

  if (!order) {
    return (
      <AccountLayout>
        <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in">
          <div className="hidden md:block mb-5">
            <PageTitle title="Order Details" />
          </div>
          <div className="lg:hidden -mx-4 -mt-4 mb-4">
            <PageHeader title="Order Details" backTo="/orders" />
          </div>
          <div className="flex flex-col items-center justify-center py-24 text-center px-6 animate-fade-in">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-200 mb-2">
              <PackageIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h2 className="text-lg font-black text-gray-900">Order not found</h2>
            <p className="text-sm text-gray-450 mt-2">This order doesn't exist or may have been removed.</p>
            <button
              onClick={() => navigate('/orders')}
              className="mt-6 text-brand-orange font-bold text-sm hover:underline cursor-pointer"
            >
              Back to Orders
            </button>
          </div>
        </div>
      </AccountLayout>
    )
  }

  const isLocked = isFulfillmentLocked(order)
  const canSwitchPickup = canSwitchToPickup(order)
  const canSwitchDelivery = canSwitchToDelivery(order)
  const isDelivery = order.fulfillment?.method === 'Courier Delivery'
  const isPickup = !isDelivery

  const subtotal = order.price * order.qty
  const deliveryFee = isDelivery ? (order.deliveryFee || 280) : 0
  const total = subtotal + (order.deliveryFeePaid ? deliveryFee : 0)

  const handleCopyOrderId = () => {
    navigator.clipboard?.writeText(order.id)
    showToast(`Copied Order ID: #${order.id}`)
  }

  const handleSwitchToPickup = () => {
    if (isLocked) {
      showToast('Cannot switch: Delivery method is locked.', 'error')
      return
    }
    const res = switchFulfillment(order.id, 'Store Pickup')
    if (res.success) {
      setOrder(res.order)
      showToast('Fulfillment switched to Store Pickup (Free).')
    } else {
      showToast(res.error || 'Failed to switch fulfillment', 'error')
    }
  }

  const handleSwitchToDelivery = () => {
    if (isLocked) {
      showToast('Cannot switch: Fulfillment method is locked.', 'error')
      return
    }
    const res = switchFulfillment(order.id, 'Courier Delivery')
    if (res.success) {
      setOrder(res.order)
      showToast('Fulfillment switched to Courier Delivery. Lalamove quote generated.')
    } else {
      showToast(res.error || 'Failed to switch fulfillment', 'error')
    }
  }

  const handleConfirmDeliveryPayment = () => {
    setIsProcessingPay(true)
    setTimeout(() => {
      const res = payDeliveryFee(order.id, payMethod, simulateFailure)
      setIsProcessingPay(false)
      setShowPayModal(false)
      if (res.success) {
        setOrder(res.order)
        if (simulateFailure) {
          showToast('Delivery fee paid! However, Lalamove booking encountered an issue.', 'warning')
        } else {
          showToast('Delivery fee paid! Fulfillment is now locked to Delivery.', 'success')
        }
      }
    }, 600)
  }

  const handleRetryBooking = () => {
    const res = retryLalamoveBooking(order.id)
    if (res.success) {
      setOrder(res.order)
      showToast('Lalamove booking created successfully (LLM-839201)!', 'success')
    } else {
      showToast('Failed to retry booking. Please try again.', 'error')
    }
  }

  return (
    <AccountLayout>
      <div className="px-4 py-4 pb-8 md:px-0 md:py-0 animate-fade-in">
        {/* Desktop Header */}
        <div className="hidden md:block mb-5">
          <PageTitle title="Order Details" />
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Order Details" backTo="/orders" />
        </div>

        <div className="space-y-3.5">
          {/* Order Identity & Status Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-black text-gray-900">
                    Order #{order.id}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyOrderId}
                    className="p-1 rounded-md text-gray-400 hover:text-brand-orange hover:bg-orange-50 transition-colors cursor-pointer"
                    title="Copy Order ID"
                  >
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Placed on {order.date}</p>
              </div>

              <div className="text-right">
                <StatusBadge status={order.status} />
              </div>
            </div>

            {order.statusContext && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-gray-700 flex items-center gap-2">
                <MessageSquareIcon className="w-4 h-4 text-slate-500 shrink-0" />
                <span>{order.statusContext}</span>
              </div>
            )}
          </div>

          {/* ===================================================================
              FULFILLMENT METHOD & LOCKING CONTROL (Core Requirement)
          =================================================================== */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Fulfillment Method
                </h3>
                {isLocked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black uppercase tracking-wider">
                    <LockIcon className="w-3 h-3 text-amber-700" />
                    Locked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                    Flexible
                  </span>
                )}
              </div>

              {/* Status pill on lock state */}
              {isLocked && order.deliveryFeePaid && (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3"><polyline points="20 6 9 17 4 12"/></svg>
                  ₱{(order.deliveryFee || 280).toFixed(2)} Paid
                </span>
              )}
            </div>

            {/* Current Method Info Card */}
            <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-start gap-3">
              <span className="p-2 rounded-xl bg-white border border-slate-200 text-brand-orange shrink-0 mt-0.5 shadow-2xs">
                {isDelivery ? <TruckIcon className="w-5 h-5" /> : <MapPinIcon className="w-5 h-5" />}
              </span>
              <div className="flex-1 min-w-0 text-xs space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-gray-900 text-sm font-bold">
                    {order.fulfillment?.method || 'Store Pickup'}
                  </strong>
                  {isLocked ? (
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1">
                      <LockIcon className="w-2.5 h-2.5" /> Delivery Locked
                    </span>
                  ) : isDelivery ? (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                      Delivery only
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                      Can change method
                    </span>
                  )}
                </div>
                <p className="text-gray-600">
                  {order.fulfillment?.location || 'Tindahan ni Isko · BU Student Center Ground Floor'}
                </p>
                {order.fulfillment?.note && (
                  <p className="text-[11px] text-gray-500 font-medium">
                    {order.fulfillment.note}
                  </p>
                )}
              </div>
            </div>

            {/* ── CASE 1: FLEXIBLE STORE PICKUP (Can switch to Delivery) ── */}
            {canSwitchDelivery && isPickup && (
              <div className="pt-1 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-gray-500">
                  Prefer door-to-door delivery? You can switch to courier delivery anytime before pickup.
                </p>
                <button
                  type="button"
                  onClick={handleSwitchToDelivery}
                  className="px-4 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 border border-brand-orange text-brand-orange text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <TruckIcon className="w-3.5 h-3.5" />
                  <span>Switch to Courier Delivery</span>
                </button>
              </div>
            )}

            {/* ── CASE 2: FLEXIBLE COURIER DELIVERY (Unpaid Quote, can switch to Pickup or Pay) ── */}
            {/* ── CASE 2: COURIER DELIVERY (quote pending) — cannot switch to store pickup ── */}
            {isDelivery && !order.deliveryFeePaid && !isLocked && (
              <div className="space-y-3 pt-1 border-t border-slate-100">
                {/* Lalamove Quote Card */}
                <div className="p-3.5 bg-orange-50/50 border border-orange-200/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
                      <span className="text-xs font-black text-gray-900 tracking-tight">
                        Lalamove Instant Quote
                      </span>
                    </div>
                    <span className="text-base font-black text-brand-orange">
                      ₱{(order.deliveryFee || 280).toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 pt-1 border-t border-orange-100">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-bold">Courier Service</span>
                      <span className="font-bold text-gray-800">{order.lalamoveQuote?.vehicle || 'Motorcycle Express'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-bold">Estimated Arrival</span>
                      <span className="font-bold text-gray-800">{order.lalamoveQuote?.eta || '30-45 mins'}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-500">
                    Delivery address: <strong className="text-gray-800">{order.fulfillment?.location}</strong>
                  </p>
                </div>

                {/* The Two Decisions */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowPayModal(true)}
                    className="flex-1 min-w-[160px] py-2.5 px-4 bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Pay ₱{(order.deliveryFee || 280).toFixed(2)} Delivery Fee</span>
                  </button>
                </div>

                <p className="text-[11px] text-gray-400 italic">
                  This order is set for delivery and cannot be switched to store pickup.
                </p>
              </div>
            )}

            {/* ── CASE 3: DELIVERY LOCKED (Fee is Paid) ── */}
            {isLocked && isDelivery && (
              <div className="space-y-3 pt-1 border-t border-slate-100">
                {/* Permanently Locked Callout Banner */}
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
                  <LockIcon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold text-amber-900">Delivery method locked</p>
                    <p className="text-amber-800 leading-relaxed">
                      Your delivery payment has been completed, so the fulfillment method can no longer be changed.
                    </p>
                  </div>
                </div>

                {/* Subcase 3A: Booking Failed (Payment Received, but Lalamove Booking Failed) */}
                {order.lalamoveStatus === 'booking_failed' && (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-black uppercase">
                          Booking Failed
                        </span>
                        <h4 className="text-xs font-bold text-rose-900 mt-1">
                          Order #{order.id} · Delivery payment: ₱{(order.deliveryFee || 280).toFixed(2)} (Paid)
                        </h4>
                        <p className="text-xs text-rose-700 mt-0.5">
                          {order.lalamoveError || 'Lalamove was unable to create the delivery booking.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRetryBooking}
                        className="py-2 px-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
                      >
                        Retry Booking
                      </button>
                    </div>
                    <p className="text-[11px] text-rose-600/80 border-t border-rose-200/60 pt-2">
                      Your delivery fee is safely accounted for. Our dispatch system preserves your delivery preference and does not revert to pickup.
                    </p>
                  </div>
                )}

                {/* Subcase 3B: Booking Succeeded (Lalamove Booked / Driver Assigned / In Transit) */}
                {order.lalamoveStatus !== 'booking_failed' && order.lalamoveBookingId && (
                  <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-black text-emerald-900">
                            Lalamove Delivery Booked
                          </span>
                        </div>
                        <p className="text-xs text-emerald-800 mt-0.5">
                          Booking ID: <strong className="font-mono text-emerald-950 font-bold">{order.lalamoveBookingId}</strong>
                        </p>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-white px-2.5 py-1 rounded-lg border border-emerald-200">
                        {order.driver ? 'Driver Assigned' : 'Awaiting Dispatch'}
                      </span>
                    </div>

                    {order.driver && (
                      <div className="p-2.5 bg-white rounded-lg border border-emerald-100 flex items-center justify-between text-xs">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-gray-400">Assigned Driver</p>
                          <p className="font-bold text-gray-900">{order.driver.name} · {order.driver.phone}</p>
                          <p className="text-[10px] text-gray-500">{order.driver.vehicle} ({order.driver.plate})</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-brand-orange">In Transit</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Items Ordered Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Items Ordered
            </h3>
            {(() => {
              const matchedProduct = productsData.find((p) => p.id === order.productId)
              const productImage =
                order.image ||
                (matchedProduct?.images?.[0] ? matchedProduct.images[0] : null)

              return (
                <div className="flex gap-3.5 items-center">
                  <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden border border-slate-200 p-1">
                    {productImage ? (
                      <img
                        src={getImageUrl(productImage)}
                        alt={order.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <ShirtIcon className="w-6 h-6 text-brand-orange opacity-40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-gray-900 text-sm truncate">
                      {order.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                      <span>
                        Size: <strong className="text-gray-800">{order.size}</strong>
                      </span>
                      <span>·</span>
                      {order.color && (
                        <span className="flex items-center gap-1.5">
                          Color:{' '}
                          <span
                            className="w-2.5 h-2.5 rounded-sm border border-gray-300 inline-block shrink-0"
                            style={{ backgroundColor: order.color.value }}
                          />
                          <strong className="text-gray-800">{order.color.name}</strong>
                        </span>
                      )}
                      <span>·</span>
                      <span>
                        Qty: <strong className="text-gray-800">{order.qty}</strong>
                      </span>
                    </div>
                    <p className="text-xs font-bold text-brand-orange mt-1">
                      {formatPrice(order.price)} each
                    </p>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Pricing Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-2.5 shadow-2xs">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Order Financial Summary
            </h3>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-semibold text-gray-800">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs items-center">
              <span className="text-gray-500">
                Delivery Fee ({isDelivery ? 'Lalamove Courier' : 'Store Pickup'})
              </span>
              <span className="font-semibold text-gray-800">
                {!isDelivery
                  ? 'FREE (Store Pickup)'
                  : order.deliveryFeePaid
                  ? `₱${deliveryFee.toFixed(2)} (Paid)`
                  : `₱${deliveryFee.toFixed(2)} (Pending Payment)`}
              </span>
            </div>
            <div className="h-px bg-slate-200 my-1" />
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-gray-900 text-xs">Order Total</span>
              <span className="font-black text-brand-orange text-base">
                {formatPrice(total)}
              </span>
            </div>
          </div>

          {/* Student Recipient Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-1 text-xs shadow-2xs">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Claimant / Student Information
            </h3>
            <p className="text-xs font-bold text-gray-900">{order.recipient}</p>
            <p className="text-gray-500">Contact: {order.phone}</p>
            <p className="text-gray-500">{order.campus} · {order.college}</p>
            <p className="text-gray-500">{order.course}</p>
          </div>

          {/* Navigation Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Link
              to="/orders"
              className="flex-1 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs flex items-center justify-center hover:bg-slate-50 transition-colors shadow-2xs"
            >
              Back to Orders
            </Link>
            <Link
              to={`/product/${order.productId}`}
              className="flex-1 h-9 rounded-xl bg-brand-orange text-white font-bold text-xs flex items-center justify-center hover:bg-brand-orange-dark transition-colors shadow-xs"
            >
              View Product Page
            </Link>
          </div>
        </div>
      </div>

      {/* ===================================================================
          DELIVERY FEE PAYMENT MODAL
      =================================================================== */}
      {showPayModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-4 animate-scale-in">
            <div className="flex items-start justify-between pb-2 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-black text-gray-900">Pay Delivery Fee</h3>
                <p className="text-xs text-gray-400 mt-0.5">Order #{order.id} • Lalamove Courier</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="p-3.5 bg-orange-50/70 border border-orange-100 rounded-2xl flex justify-between items-center">
              <span className="text-xs font-bold text-gray-700">Amount Due</span>
              <span className="text-lg font-black text-brand-orange">
                ₱{(order.deliveryFee || 280).toFixed(2)}
              </span>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Select Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                {['GCash', 'Maya', 'BU Student Wallet', 'Card'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPayMethod(m)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      payMethod === m
                        ? 'bg-brand-orange text-white border-brand-orange shadow-2xs'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Testing Option: Simulate Booking Failure */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateFailure}
                  onChange={(e) => setSimulateFailure(e.target.checked)}
                  className="rounded text-brand-orange focus:ring-brand-orange"
                />
                <span className="text-xs font-bold text-gray-700">Simulate Lalamove Booking Failure</span>
              </label>
              <p className="text-[10px] text-gray-400 pl-5">
                Tests scenario: Delivery payment is received (₱280 Paid), but courier booking fails. Fulfillment remains locked to Delivery.
              </p>
            </div>

            <div className="text-[11px] text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex items-start gap-1.5">
              <LockIcon className="w-3.5 h-3.5 text-amber-800 shrink-0 mt-0.5" />
              <span><strong>Locking Rule:</strong> Once you pay the ₱280 fee, the fulfillment method is permanently locked to Delivery.</span>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowPayModal(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingPay}
                onClick={handleConfirmDeliveryPayment}
                className="flex-1 py-2.5 bg-brand-orange hover:bg-brand-orange-dark text-white font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isProcessingPay ? 'Processing...' : `Pay ₱${(order.deliveryFee || 280).toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AccountLayout>
  )
}

export default OrderDetail
