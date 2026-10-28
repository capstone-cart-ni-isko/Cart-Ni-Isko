import { useNavigate } from 'react-router-dom'
import { formatPrice } from '../ui/PriceTag.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import logo from '../../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import paymongoLogo from '../../assets/icons/brand/paymongo-logo.png'

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

/** Name only the wallet/card PayMongo actually charged. */
function formatPaymentMethod(value) {
  const method = String(value ?? '').trim().toLowerCase()
  if (method === 'gcash') return 'GCash'
  if (method === 'maya' || method === 'paymaya') return 'Maya'
  if (method === 'card') return 'Card'
  if (method === 'grab_pay' || method === 'grabpay') return 'GrabPay'
  if (method === 'qrph') return 'QR Ph'
  if (method === 'cash') return 'Cash'
  if (method === 'digital') return 'Digital Wallet'
  return 'Online Payment'
}

/**
 * Shown on /checkout once the PayMongo return has completed.
 * Displays comprehensive order summary, PayMongo transaction confirmation,
 * item breakdown, claiming details, and clear action buttons to view details
 * or continue browsing the store.
 */
function OrderPlacedView({ order, payRef, customerName, paymentMethod, confirmed = true, onDismiss }) {
  const navigate = useNavigate()
  // Clearing the saved receipt happens as the shopper leaves this screen, so
  // returning to /checkout later starts a fresh checkout instead of replaying
  // an old success page.
  const leaveTo = (path) => {
    onDismiss?.()
    navigate(path, { replace: true })
  }
  const items = Array.isArray(order?.items) ? order.items : []
  const isDelivery = order?.dispatch_type === 'delivery' || order?.ord_claiming === 'delivery'
  const total = Number(order?.ord_amount ?? order?.total ?? 0)
  const paid = Number(order?.pay_given ?? order?.pay_received ?? 0) || total
  const firstName = String(customerName || '').trim().split(/\s+/)[0]
  const reference = payRef || order?.pay_ref || order?.pay_reference
  const method = formatPaymentMethod(
    paymentMethod || order?.pay_method || order?.payment_method
  )

  return (
    <div className="w-full max-w-xl bg-white rounded-2xl p-6 md:p-8 border border-slate-200/90 shadow-sm space-y-6 animate-scale-in">
      <div className="flex justify-center">
        <img src={logo} alt="Tindahan ni Isko" className="h-9 object-contain" />
      </div>

      {/* Assurance header */}
      <div className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shadow-xs">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 text-emerald-600"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            {confirmed ? 'Order Placed & Paid!' : 'Order Placed!'}
          </h1>
          <p className="text-sm text-gray-600 mt-1.5 max-w-md mx-auto leading-relaxed">
            {firstName ? `Thank you, ${firstName}! ` : 'Thank you! '}
            {confirmed
              ? 'Your transaction has been securely processed via PayMongo. Your order is now confirmed.'
              : 'Your payment went through. We are finishing the confirmation with PayMongo — your order is saved and this receipt is your reference.'}
          </p>
        </div>
      </div>

      {/* Order + payment summary */}
      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm overflow-hidden bg-white shadow-2xs">
        <div className="flex justify-between items-center gap-3 p-3.5 bg-slate-50/70">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Transaction Details</span>
          <span className="text-xs font-semibold text-gray-800 bg-white px-2 py-0.5 rounded border border-slate-200">
            Order #{order?.ord_id}
          </span>
        </div>
        {order?.ord_created && (
          <div className="flex justify-between gap-3 p-3.5">
            <span className="text-gray-500">Date & Time</span>
            <span className="font-medium text-gray-800">{formatDateTime(order.ord_created)}</span>
          </div>
        )}
        <div className="flex justify-between items-center gap-3 p-3.5">
          <span className="text-gray-500">Payment Gateway</span>
          <div className="flex items-center gap-2">
            <img src={paymongoLogo} alt="PayMongo" className="h-4 object-contain" />
            <span className="font-medium text-gray-800">
              PayMongo
            </span>
          </div>
        </div>
        <div className="flex justify-between gap-3 p-3.5">
          <span className="text-gray-500">Payment Method</span>
          <span className="font-medium text-gray-800">{method}</span>
        </div>
        {reference && (
          <div className="flex justify-between items-center gap-3 p-3.5">
            <span className="text-gray-500 shrink-0">Payment Reference</span>
            <span className="font-mono text-xs text-gray-700 break-all text-right bg-slate-50 px-2 py-1 rounded border border-slate-200">
              {reference}
            </span>
          </div>
        )}
        <div className="flex justify-between items-baseline gap-3 p-3.5 bg-orange-50/70">
          <div>
            <span className="font-bold text-gray-900 block">Total Amount Paid</span>
          </div>
          <span className="text-xl font-bold text-brand-orange">{formatPrice(paid)}</span>
        </div>
      </div>

      {/* Claiming details */}
      <div className="p-4 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {isDelivery ? 'Delivery Information' : 'Pickup Information'}
          </p>
          <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
            {isDelivery ? 'Courier Delivery' : 'In-Store Pickup'}
          </span>
        </div>
        {isDelivery ? (
          <>
            <p className="font-semibold text-gray-900 pt-1">
              {order?.deliver_recipient || customerName || 'Recipient'}
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">{order?.deliver_address || 'Delivery address on file'}</p>
            {order?.deliver_expect && (
              <p className="text-xs text-gray-500 font-medium">
                Estimated arrival: {formatDateTime(order.deliver_expect, false)}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-semibold text-gray-900 pt-1">Tindahan ni Isko Physical Store</p>
            <p className="text-xs text-gray-600">Bicol University Student Center Building</p>
            {order?.appoint_start && (
              <div className="pt-1 flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-brand-orange">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Scheduled slot: <strong>{formatDateTime(order.appoint_start)}</strong></span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Order Items ({items.length})
          </p>
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 rounded-xl p-2 bg-slate-50/80 border border-slate-200/70 scrollbar-none">
            {items.map((line, idx) => {
              const name = line.prod_name || line.product?.name || 'Item'
              const variant = line.prodvar_name || line.size
              const image =
                line.prodvar_pic || line.product?.images?.[0] || line.product?.image || null
              return (
                <div
                  key={line.item_id ?? idx}
                  className="py-2.5 px-2 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {image && (
                      <img
                        src={getImageUrl(image)}
                        alt={name}
                        className="w-11 h-11 rounded-lg object-contain bg-white p-1 border border-slate-200/80 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate text-xs sm:text-sm">{name}</p>
                      <p className="text-2xs text-gray-500 mt-0.5">
                        Qty: {Number(line.qty || 1)}
                        {variant ? ` • ${variant}` : ''}
                      </p>
                    </div>
                  </div>
                  <p className="font-bold text-gray-900 shrink-0 text-xs sm:text-sm">
                    {formatPrice(Number(line.line_total ?? 0))}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* What happens next */}
      <div className="p-4 rounded-xl border border-orange-200/90 bg-orange-50/70 text-xs sm:text-sm">
        <p className="font-bold text-gray-900 flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-brand-orange">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          What happens next?
        </p>
        <p className="text-gray-600 mt-1 leading-relaxed">
          {isDelivery
            ? 'We will notify you once your order is dispatched with the courier. You can monitor the real-time fulfillment status directly from your order tracking page.'
            : 'We will notify you when your items are ready for pickup. Simply present your order QR code from your order details screen at the store counter to claim.'}
        </p>
      </div>

      {/* Action buttons: view order details & continue browsing store */}
      <div className="space-y-2.5 pt-2">
        <button
          type="button"
          onClick={() => leaveTo(`/orders/${order?.ord_id}`)}
          className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-brand-orange hover:bg-brand-orange-dark text-white shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <span>View Order Details & QR Code</span>

        </button>

        <button
          type="button"
          onClick={() => leaveTo('/shop')}
          className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-slate-100 hover:bg-slate-200/80 text-slate-800 border border-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-slate-600">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span>Continue Browsing Store</span>
        </button>

        <button
          type="button"
          onClick={() => leaveTo('/home')}
          className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
        >
          Return to Home
        </button>
      </div>
    </div>
  )
}

export default OrderPlacedView
