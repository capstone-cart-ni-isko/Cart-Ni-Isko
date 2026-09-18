import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { formatPrice } from '../components/ui/PriceTag.jsx'
import ordersData from '../data/orders.json'
import productsData from '../data/products.json'
import { getImageUrl } from '../utils/imageUtils.js'
import { PackageIcon, ShirtIcon } from '../components/ui/Icons.jsx'

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'pre-order', label: 'Pre-orders' },
  { key: 'processing', label: 'Processing' },
  { key: 'receive', label: 'To Receive' },
  { key: 'history', label: 'Completed' },
]

function Orders() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState('all')

  const filteredOrders =
    activeTab === 'all'
      ? ordersData
      : ordersData.filter((o) => o.type === activeTab)

  const handleCopyOrderId = (e, orderId) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard?.writeText(orderId)
    showToast(`Copied Order ID: #${orderId}`)
  }

  return (
    <AppShell>
      <PageHeader title="My Orders" backTo="/profile" />

      {/* Tabs Filter Bar (Sticky) */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-3xl mx-auto flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none select-none">
          {tabs.map((tab) => {
            const count =
              tab.key === 'all'
                ? ordersData.length
                : ordersData.filter((o) => o.type === tab.key).length

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-full text-xs font-bold shrink-0 transition-all border cursor-pointer flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'bg-brand-orange border-brand-orange text-white shadow-xs'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                    activeTab === tab.key ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Single Vertical Column Layout (Chronological Scanning) */}
      <div className="px-4 py-6 pb-32 animate-fade-in max-w-3xl mx-auto space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center justify-center bg-white rounded-3xl border border-gray-100 p-8 shadow-xs">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-2">
              <PackageIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-800 mt-3 text-lg">No orders in this category</h3>
            <p className="text-sm text-gray-450 mt-1 max-w-[260px] mx-auto">
              Your BU campus merchandise orders will show up here as their status updates.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className="mt-5 text-brand-orange font-bold text-xs hover:underline cursor-pointer"
            >
              View All Orders
            </button>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const matchedProduct = productsData.find((p) => p.id === order.productId)
            const productImage =
              order.image ||
              (matchedProduct?.images?.[0] ? matchedProduct.images[0] : null)
            const orderTotal = order.price * order.qty

            return (
              <article
                key={order.id}
                className="bg-white rounded-3xl border border-gray-200/90 shadow-2xs hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* ── Level 1 & 2: Order Identity + Status Row ── */}
                <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50/50 flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base sm:text-lg font-black text-gray-900 tracking-tight">
                        Order #{order.id}
                      </span>
                      {/* Copy Order ID Button */}
                      <button
                        type="button"
                        onClick={(e) => handleCopyOrderId(e, order.id)}
                        className="p-1 rounded-md text-gray-400 hover:text-brand-orange hover:bg-orange-50 transition-colors cursor-pointer"
                        title="Copy Order ID to clipboard"
                        aria-label={`Copy Order ID ${order.id}`}
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

                    <p className="text-xs text-gray-500 mt-0.5">
                      {order.date} · {order.qty} {order.qty === 1 ? 'item' : 'items'}
                    </p>
                  </div>

                  {/* Level 2: Prominent Status Pill & Context */}
                  <div className="text-right">
                    <StatusBadge status={order.status} />
                    {order.statusContext && (
                      <p className="text-[11px] text-gray-500 font-medium mt-1 max-w-[200px] sm:max-w-none">
                        {order.statusContext}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── Level 3: Fulfillment Information ── */}
                <div className="px-4 sm:px-5 py-2.5 bg-blue-50/40 border-b border-blue-100/50 flex items-center gap-2 text-xs text-blue-950 font-medium">
                  <span className="text-sm shrink-0">
                    {order.fulfillment?.method === 'Courier Delivery' ? '🚚' : '📍'}
                  </span>
                  <span className="font-bold">
                    {order.fulfillment?.method || 'Store Pickup'}:
                  </span>
                  <span className="text-blue-900 truncate">
                    {order.fulfillment?.location || 'Tindahan ni Isko · BU Student Center'}
                  </span>
                </div>

                {/* ── Level 4: Product & Variant Information ── */}
                <div className="p-4 sm:p-5">
                  <div className="flex gap-4 items-center">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {productImage ? (
                        <img
                          src={getImageUrl(productImage)}
                          alt={order.name}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <ShirtIcon className="w-8 h-8 text-brand-orange opacity-40" />
                      )}
                    </div>

                    {/* Product Specs with Explicit Labels */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-extrabold text-gray-900 truncate">
                        {order.name}
                      </h3>

                      {/* Explicit Variant Details */}
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-600 flex-wrap">
                        {order.size && (
                          <span>
                            Size: <strong className="text-gray-900">{order.size}</strong>
                          </span>
                        )}
                        {order.size && order.color && <span className="text-gray-300">·</span>}
                        {order.color && (
                          <span className="flex items-center gap-1.5">
                            Color:{' '}
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-gray-300 inline-block shrink-0"
                              style={{ backgroundColor: order.color.value }}
                              title={order.color.name}
                            />
                            <strong className="text-gray-900">{order.color.name}</strong>
                          </span>
                        )}
                        <span className="text-gray-300">·</span>
                        <span>
                          Qty: <strong className="text-gray-900">{order.qty}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Level 5 & 6: Financial Total & Actions ── */}
                <div className="px-4 sm:px-5 py-3.5 bg-gray-50/70 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                      Order Total
                    </span>
                    <span className="text-base sm:text-lg font-black text-gray-900">
                      {formatPrice(orderTotal)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Secondary Contextual Actions */}
                    {order.status === 'TO RECEIVE' && (
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="px-3.5 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-xs font-bold hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        Claim Pass
                      </button>
                    )}

                    {order.status === 'COMPLETED' && (
                      <Link
                        to={`/product/${order.productId}`}
                        className="px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        Buy Again
                      </Link>
                    )}

                    {/* Primary Action */}
                    <Link
                      to={`/orders/${order.id}`}
                      className="px-4 py-2 rounded-xl bg-brand-orange text-white text-xs font-black hover:bg-brand-orange-dark transition-all shadow-2xs hover:shadow-xs active:scale-98 flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>View Order Details</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </AppShell>
  )
}

export default Orders
