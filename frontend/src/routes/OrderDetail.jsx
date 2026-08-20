import { useParams, useNavigate } from 'react-router-dom'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import { formatPrice } from '../components/ui/PriceTag.jsx'
import ordersData from '../data/orders.json'

import { PackageIcon, ShirtIcon } from '../components/ui/Icons.jsx'

function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const order = ordersData.find((o) => o.id === id)

  if (!order) {
    return (
      <AppShell showNav={false}>
        <PageHeader title="Order Details" backTo="/orders" />
        <div className="flex flex-col items-center justify-center py-24 text-center px-6 animate-fade-in">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-2">
            <PackageIcon className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-lg font-black text-gray-900">Order not found</h2>
          <p className="text-sm text-gray-450 mt-2">This order doesn't exist or may have been removed.</p>
          <button onClick={() => navigate('/orders')} className="mt-6 text-brand-orange font-bold text-sm hover:underline">
            Back to Orders
          </button>
        </div>
      </AppShell>
    )
  }

  const subtotal = order.price * order.qty
  const shipping = 50
  const tax = Math.round(subtotal * 0.08)
  const total = subtotal + shipping + tax

  return (
    <AppShell showNav={false}>
      <PageHeader title="Order Details" backTo="/orders" />

      <div className="px-4 py-4 pb-12 space-y-4 animate-fade-in">
        {/* Status Header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{order.id}</p>
            <p className="text-xs text-gray-500 mt-1">{order.date}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>

        {/* Product Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Item Ordered</h3>
          <div className="flex gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-orange-50 to-blue-50 flex items-center justify-center shrink-0">
              <ShirtIcon className="w-7 h-7 text-brand-orange opacity-40" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-extrabold text-gray-900 text-sm truncate">{order.name}</h4>
              <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400 font-bold uppercase">
                <span>{order.size}</span>
                <span>·</span>
                <span
                  className="w-3 h-3 rounded-full border border-gray-200 inline-block shrink-0"
                  style={{ backgroundColor: order.color.value }}
                />
                <span>{order.color.name}</span>
                <span>·</span>
                <span>Qty: {order.qty}</span>
              </div>
              <p className="text-sm font-black text-brand-orange mt-2">{formatPrice(order.price)} / item</p>
            </div>
          </div>
        </div>

        {/* Pricing Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-2.5">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Order Summary</h3>
          {[
            { label: 'Subtotal', value: subtotal },
            { label: 'Shipping', value: shipping },
            { label: 'Tax (8%)', value: tax },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-500">{label}</span>
              <span className="font-bold text-gray-800">{formatPrice(value)}</span>
            </div>
          ))}
          <div className="h-px bg-gray-100 my-1" />
          <div className="flex justify-between">
            <span className="font-extrabold text-gray-900">Total</span>
            <span className="font-black text-brand-orange text-base">{formatPrice(total)}</span>
          </div>
        </div>

        {/* Recipient Info */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Recipient</h3>
          <p className="text-sm font-bold text-gray-900">{order.recipient}</p>
          <p className="text-xs text-gray-500">{order.phone}</p>
          <p className="text-xs text-gray-500">{order.campus}</p>
          <p className="text-xs text-gray-500">{order.college}</p>
          <p className="text-xs text-gray-500">{order.course}</p>
        </div>
      </div>
    </AppShell>
  )
}

export default OrderDetail
