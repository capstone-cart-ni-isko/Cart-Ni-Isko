import { useNavigate } from 'react-router-dom'
import { formatPrice } from '../ui/PriceTag.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import logo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

function formatDateTime(value, withTime = true) {
  if (!value) return null
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

/**
 * Shown on /checkout once the PayMongo return has been CONFIRMED by
 * POST /checkout/payment/status - never on the redirect alone. `order` is the
 * server's orderPayload(), so everything here is what was actually saved.
 */
function OrderPlacedView({ order, payRef, customerName }) {
  const navigate = useNavigate()
  const items = Array.isArray(order?.items) ? order.items : []
  const isDelivery = order?.dispatch_type === 'delivery' || order?.ord_claiming === 'delivery'
  const total = Number(order?.ord_amount ?? order?.total ?? 0)
  const paid = Number(order?.pay_given ?? 0) || total
  const deliveryFee = isDelivery ? Number(order?.deliver_fee_charged ?? 0) : 0
  const firstName = String(customerName || '').trim().split(/\s+/)[0]
  const reference = payRef || order?.pay_ref || order?.pay_reference

  return (
    <div className="w-full max-w-xl bg-white rounded-xl p-6 md:p-8 border border-slate-100 space-y-6 animate-scale-in">
      <div className="flex justify-center">
        <img src={logo} alt="Tindahan ni Isko" className="h-8 object-contain" />
      </div>

      {/* Assurance header */}
      <div className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 text-green-600"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Order placed and paid</h1>
          <p className="text-sm text-gray-500 mt-1">
            {firstName ? `Thank you, ${firstName}! ` : 'Thank you! '}
            We received your payment and your order is now being processed.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 bg-green-50 text-green-700 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
          Payment confirmed
        </span>
      </div>

      {/* Order + payment summary */}
      <div className="rounded-lg border border-slate-100 divide-y divide-slate-100 text-sm">
        <div className="flex justify-between gap-3 p-3.5">
          <span className="text-gray-500">Order number</span>
          <span className="font-semibold text-gray-900">#{order?.ord_id}</span>
        </div>
        {order?.ord_created && (
          <div className="flex justify-between gap-3 p-3.5">
            <span className="text-gray-500">Placed on</span>
            <span className="font-medium text-gray-800">{formatDateTime(order.ord_created)}</span>
          </div>
        )}
        <div className="flex justify-between gap-3 p-3.5">
          <span className="text-gray-500">Paid via</span>
          <span className="font-medium text-gray-800">PayMongo (Online)</span>
        </div>
        {reference && (
          <div className="flex justify-between gap-3 p-3.5">
            <span className="text-gray-500 shrink-0">Payment reference</span>
            <span className="font-mono text-xs text-gray-700 break-all text-right">{reference}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline gap-3 p-3.5 bg-orange-50/60">
          <span className="font-semibold text-gray-900">Amount paid</span>
          <span className="text-lg font-semibold text-brand-orange">{formatPrice(paid)}</span>
        </div>
      </div>

      {/* Claiming details */}
      <div className="p-3.5 bg-slate-50 rounded-lg space-y-1 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {isDelivery ? 'Courier Delivery' : 'Store Pickup'}
        </p>
        {isDelivery ? (
          <>
            <p className="font-semibold text-gray-900">
              {order?.deliver_recipient || customerName || 'Recipient'}
            </p>
            <p className="text-gray-600">{order?.deliver_address || 'Delivery address on file'}</p>
            {order?.deliver_expect && (
              <p className="text-gray-500">
                Expected by {formatDateTime(order.deliver_expect, false)}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-semibold text-gray-900">Tindahan ni Isko · BU Student Center</p>
            {order?.appoint_start && (
              <p className="text-gray-600">Pickup slot: {formatDateTime(order.appoint_start)}</p>
            )}
          </>
        )}
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-900">Items ({items.length})</p>
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg px-3 py-1 bg-slate-50 scrollbar-none">
            {items.map((line, idx) => {
              const name = line.prod_name || line.product?.name || 'Item'
              const variant = line.prodvar_name || line.size
              const image =
                line.prodvar_pic || line.product?.images?.[0] || line.product?.image || null
              return (
                <div
                  key={line.item_id ?? idx}
                  className="py-2.5 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {image && (
                      <img
                        src={getImageUrl(image)}
                        alt={name}
                        className="w-10 h-10 rounded-md object-contain bg-white p-1 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{name}</p>
                      <p className="text-xs text-gray-500">
                        Qty: {Number(line.qty || 1)}
                        {variant ? ` • ${variant}` : ''}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold text-gray-900 shrink-0">
                    {formatPrice(Number(line.line_total ?? 0))}
                  </p>
                </div>
              )
            })}
          </div>
          {deliveryFee > 0 && (
            <p className="text-xs text-gray-500 text-right">
              Includes {formatPrice(deliveryFee)} delivery fee
            </p>
          )}
        </div>
      )}

      {/* What happens next */}
      <div className="p-3.5 rounded-lg border border-orange-200 bg-orange-50/70 text-sm">
        <p className="font-semibold text-gray-900">What happens next</p>
        <p className="text-gray-600 mt-0.5">
          {isDelivery
            ? 'We will notify you once your order is handed to the courier. You can track it any time from your Orders.'
            : 'We will notify you when your order is ready. Show the QR code from your order page at the store to claim it.'}
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => navigate(`/orders/${order?.ord_id}`, { replace: true })}
          className="w-full py-3.5 rounded-lg font-semibold text-sm bg-brand-orange hover:bg-brand-orange-dark text-white transition-colors cursor-pointer"
        >
          View order details
        </button>
        <button
          type="button"
          onClick={() => navigate('/bag', { replace: true })}
          className="w-full py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
        >
          Back to Bag
        </button>
      </div>
    </div>
  )
}

export default OrderPlacedView
