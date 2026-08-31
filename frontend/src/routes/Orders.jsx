import { useState } from 'react'
import { Link } from 'react-router-dom'
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
  { key: 'pre-order', label: 'Pre-order' },
  { key: 'processing', label: 'Processing' },
  { key: 'receive', label: 'To Receive' },
  { key: 'history', label: 'Completed' },
]

function Orders() {
  const [activeTab, setActiveTab] = useState('all')

  const filtered = activeTab === 'all'
    ? ordersData
    : ordersData.filter((o) => o.type === activeTab)

  return (
    <AppShell>
      <PageHeader title="My Orders" backTo="/profile" />

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 bg-white border-b border-gray-50 scrollbar-none select-none sticky top-0 z-20">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all border ${
              activeTab === tab.key
                ? 'bg-brand-orange border-brand-orange text-white shadow-sm'
                : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 pb-28 animate-fade-in">
        {filtered.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-2">
              <PackageIcon className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-700 mt-3">No orders here</h3>
            <p className="text-sm text-gray-450 mt-2">Orders in this category will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((order) => {
              const matchedProduct = productsData.find((p) => p.id === order.productId)
              const productImage = matchedProduct && matchedProduct.images && matchedProduct.images[0]
                ? getImageUrl(matchedProduct.images[0])
                : null

              return (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="block bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex gap-3.5 items-center">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 overflow-hidden border border-gray-100">
                      {productImage ? (
                        <img src={productImage} alt={order.name} className="w-full h-full object-cover" />
                      ) : (
                        <ShirtIcon className="w-7 h-7 text-brand-orange opacity-40" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-extrabold text-gray-900 truncate">{order.name}</h3>
                        <p className="font-black text-brand-orange text-sm shrink-0">{formatPrice(order.price * order.qty)}</p>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400 font-bold uppercase flex-wrap">
                        <span>{order.size}</span>
                        <span>·</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-gray-200 inline-block shrink-0"
                          style={{ backgroundColor: order.color.value }}
                        />
                        <span className="truncate max-w-[120px]">{order.color.name}</span>
                        <span>·</span>
                        <span>Qty: {order.qty}</span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-end">
                        <StatusBadge status={order.status} />
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default Orders
