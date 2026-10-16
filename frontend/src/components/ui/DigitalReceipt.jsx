import { formatPrice } from './PriceTag.jsx'
import { paymentMethodLabel } from '../../services/dashboard.js'

/**
 * Digital receipt of a claimed / received order. Pure view over the order
 * payload from the backend (`orderPayload`), so the customer's Orders tab and
 * the admin Orders tab show exactly the same receipt as the printed copy.
 */
const RECEIPT_STATUSES = ['claimed', 'received']

function hasReceipt(status) {
  return RECEIPT_STATUSES.includes(String(status || '').trim().toLowerCase())
}

function stamp(value) {
  if (!value) return null
  const d = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Row({ label, value, strong = false }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${strong ? 'font-black text-gray-900' : 'text-gray-600'}`}>
      <span>{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  )
}

export default function DigitalReceipt({ order, customer = '' }) {
  if (!order) return null

  const status = String(order.ord_status || order.status || '').toLowerCase()
  if (!hasReceipt(status)) return null

  const items = order.items || []
  const isDelivery = order.dispatch_type === 'delivery'
  const fee = Number(order.deliver_fee_charged || 0)
  const subtotal = items.reduce((sum, i) => sum + (Number(i.line_total) || 0), 0)
  const total = Number(order.ord_amount ?? subtotal + fee)
  const when = stamp(order.appoint_closed || order.deliver_end || order.ord_completed)
  const receiptNo = `RCPT-${String(order.ord_id ?? '').padStart(6, '0')}`

  return (
    <section
      aria-label="Digital receipt"
      className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs font-mono text-xs space-y-3 max-w-md mx-auto w-full"
    >
      <div className="text-center space-y-0.5">
        <p className="text-sm font-black tracking-wide text-gray-900">TINDAHAN NI ISKO</p>
        <p className="text-[11px] text-gray-500">Bicol University Student Council</p>
        <p className="text-[11px] font-bold text-gray-900 pt-1">OFFICIAL RECEIPT</p>
      </div>

      <div className="border-t border-dashed border-slate-300 pt-3 space-y-1">
        <Row label="Receipt No." value={receiptNo} />
        <Row label="Order" value={order.ord_tag || `#${order.ord_id}`} />
        <Row label={status === 'received' ? 'Received on' : 'Claimed on'} value={when || '—'} />
        {customer && <Row label="Customer" value={customer} />}
        <Row label="Fulfillment" value={isDelivery ? 'Courier Delivery' : 'Store Pickup'} />
      </div>

      <div className="border-t border-dashed border-slate-300 pt-3 space-y-2">
        {items.map((item, idx) => {
          const name = item.prod_name || item.product?.prod_name || 'Item'
          return (
            <div key={item.item_id ?? idx}>
              <p className="font-bold text-gray-900">
                {name}
                {item.prodvar_name ? ` (${item.prodvar_name})` : ''}
              </p>
              <Row
                label={`${item.qty} x ${formatPrice(item.amount)}`}
                value={formatPrice(item.line_total)}
              />
            </div>
          )
        })}
      </div>

      <div className="border-t border-dashed border-slate-300 pt-3 space-y-1">
        {fee > 0 && (
          <>
            <Row label="Subtotal" value={formatPrice(subtotal)} />
            <Row label="Delivery fee" value={formatPrice(fee)} />
          </>
        )}
        <Row label="TOTAL" value={formatPrice(total)} strong />
        <Row label="Payment" value={paymentMethodLabel(order.pay_method)} />
        {order.pay_given != null && <Row label="Amount received" value={formatPrice(order.pay_given)} />}
        {order.pay_change != null && <Row label="Change" value={formatPrice(order.pay_change)} />}
        {order.pay_ref && <Row label="Ref" value={order.pay_ref} />}
      </div>

      <div className="border-t border-dashed border-slate-300 pt-3 text-center space-y-0.5">
        <p className="font-bold text-gray-900">Thank you, Iskolar!</p>
        <p className="text-[11px] text-gray-500">Keep this receipt as proof of purchase.</p>
      </div>
    </section>
  )
}
