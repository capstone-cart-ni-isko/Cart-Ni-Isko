import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { formatPrice } from '../components/ui/PriceTag.jsx'
import ordersData from '../data/orders.json'

import { PackageIcon } from '../components/ui/Icons.jsx'

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
            {filtered.map((order) => (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="block bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{order.id}</p>
                    <h3 className="text-sm font-extrabold text-gray-900 mt-0.5 truncate">{order.name}</h3>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400 font-bold uppercase">
                      <span>{order.size}</span>
                      <span>·</span>
                      <span
                        className="w-3 h-3 rounded-full border border-gray-200 inline-block"
                        style={{ backgroundColor: order.color.value }}
                      />
                      <span>{order.color.name}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">{order.date}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-2">
                    <p className="font-black text-brand-orange text-sm">{formatPrice(order.price * order.qty)}</p>
                    <StatusBadge status={order.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default Orders
