import { useParams, useNavigate, Link } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { formatPrice } from '../components/ui/PriceTag.jsx'
import ordersData from '../data/orders.json'
import productsData from '../data/products.json'
import { getImageUrl } from '../utils/imageUtils.js'
import { PackageIcon, ShirtIcon } from '../components/ui/Icons.jsx'

function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const order = ordersData.find((o) => o.id === id)

  if (!order) {
    return (
      <AppShell>
        <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in max-w-3xl mx-auto">
          <div className="hidden lg:block mb-8">
            <h1 className="text-3xl font-black text-gray-900">Order Details</h1>
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
      </AppShell>
    )
  }

  const subtotal = order.price * order.qty
  const shipping = order.fulfillment?.method === 'Courier Delivery' ? 50 : 0
  const total = subtotal + shipping

  const handleCopyOrderId = () => {
    navigator.clipboard?.writeText(order.id)
    showToast(`Copied Order ID: #${order.id}`)
  }

  return (
    <AppShell>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in max-w-3xl mx-auto">
        {/* Desktop Header */}
        <div className="hidden lg:flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/orders')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:text-brand-orange hover:border-brand-orange bg-white transition-all shadow-2xs cursor-pointer"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Back to Orders</span>
            </button>
            <h1 className="text-3xl font-black text-gray-900">Order Details</h1>
          </div>
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Order Details" backTo="/orders" />
        </div>

        <div className="space-y-4">
          {/* Order Identity & Status Banner */}
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-2xs space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg sm:text-xl font-black text-gray-900">
                    Order #{order.id}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyOrderId}
                    className="p-1 rounded-md text-gray-400 hover:text-brand-orange hover:bg-orange-50 transition-colors cursor-pointer"
                    title="Copy Order ID"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
              <div className="p-3 bg-gray-50 rounded-2xl text-xs text-gray-700 font-medium">
                💬 {order.statusContext}
              </div>
            )}
          </div>

          {/* Fulfillment Details */}
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-2xs space-y-2">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">
              Fulfillment & Claim Details
            </h3>
            <div className="flex items-start gap-2.5 pt-1">
              <span className="text-base">
                {order.fulfillment?.method === 'Courier Delivery' ? '🚚' : '📍'}
              </span>
              <div className="text-xs space-y-0.5">
                <strong className="text-gray-900 block text-sm">
                  {order.fulfillment?.method || 'Store Pickup'}
                </strong>
                <p className="text-gray-600">
                  {order.fulfillment?.location || 'Tindahan ni Isko · BU Student Center Ground Floor'}
                </p>
                {order.fulfillment?.note && (
                  <p className="text-[11px] text-brand-orange font-medium pt-1">
                    ℹ️ {order.fulfillment.note}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Product Card */}
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-2xs">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-4">
              Items Ordered
            </h3>
            {(() => {
              const matchedProduct = productsData.find((p) => p.id === order.productId)
              const productImage =
                order.image ||
                (matchedProduct?.images?.[0] ? matchedProduct.images[0] : null)

              return (
                <div className="flex gap-4 items-center">
                  <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden border border-gray-100 p-1">
                    {productImage ? (
                      <img
                        src={getImageUrl(productImage)}
                        alt={order.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <ShirtIcon className="w-8 h-8 text-brand-orange opacity-40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-extrabold text-gray-900 text-sm sm:text-base truncate">
                      {order.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 flex-wrap">
                      <span>
                        Size: <strong className="text-gray-800">{order.size}</strong>
                      </span>
                      <span>·</span>
                      {order.color && (
                        <span className="flex items-center gap-1.5">
                          Color:{' '}
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-gray-300 inline-block shrink-0"
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
                    <p className="text-sm font-black text-brand-orange mt-2">
                      {formatPrice(order.price)} each
                    </p>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Pricing Breakdown (No tax, clean calculation) */}
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-2xs space-y-2.5">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1">
              Order Financial Summary
            </h3>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-bold text-gray-800">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-gray-500">
                Shipping ({order.fulfillment?.method || 'Pickup'})
              </span>
              <span className="font-bold text-gray-800">
                {shipping > 0 ? formatPrice(shipping) : 'FREE (Store Pickup)'}
              </span>
            </div>
            <div className="h-px bg-gray-100 my-1" />
            <div className="flex justify-between items-baseline">
              <span className="font-black text-gray-900 text-base">Order Total</span>
              <span className="font-black text-brand-orange text-xl">{formatPrice(total)}</span>
            </div>
          </div>

          {/* Student Recipient Info */}
          <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-2xs space-y-1.5 text-xs">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">
              Claimant / Student Information
            </h3>
            <p className="text-sm font-bold text-gray-900">{order.recipient}</p>
            <p className="text-gray-500">Contact: {order.phone}</p>
            <p className="text-gray-500">{order.campus} · {order.college}</p>
            <p className="text-gray-500">{order.course}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Link
              to="/orders"
              className="flex-1 h-12 rounded-2xl border border-gray-200 bg-white text-gray-700 font-bold text-xs flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              Back to Orders
            </Link>
            <Link
              to={`/product/${order.productId}`}
              className="flex-1 h-12 rounded-2xl bg-brand-orange text-white font-black text-xs flex items-center justify-center hover:bg-brand-orange-dark transition-colors shadow-sm"
            >
              View Product Page
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

export default OrderDetail
