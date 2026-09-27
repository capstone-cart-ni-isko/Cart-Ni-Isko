import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DrawerPanel from '../DrawerPanel.jsx'
import { useAdmin } from '../../../hooks/useAdmin.js'
import { useToast } from '../../../hooks/useToast.js'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, peso } from './ui.js'

/*
  Quick walk-in sale without leaving the dashboard. It drives the same shared
  POS basket as the full register (AdminContext), so a sale started here can
  be finished on /admin/pos and the other way round.
*/
export default function PosDrawer({ isOpen, onClose, onCompleted }) {
  const { products = [], posCart = [], posAddToCart, posUpdateQty, posRemoveItem, posClearCart, posCheckout } = useAdmin()
  const { showToast } = useToast()
  const [query, setQuery] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [tendered, setTendered] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)

  const sellable = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter((p) => !p.disabled && (p.totalStock > 0 || p.preOrder))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 8)
  }, [products, query])

  const subtotal = posCart.reduce((sum, line) => sum + line.price * line.qty, 0)
  const paid = Number(tendered) || 0
  const change = paid > subtotal ? paid - subtotal : 0
  const short = paymentMethod === 'Cash' && tendered !== '' && paid < subtotal

  const qtyInCart = (product) =>
    posCart.filter((line) => line.id === product.id).reduce((sum, line) => sum + line.qty, 0)

  const handleCheckout = async () => {
    if (busy || posCart.length === 0 || short) return
    setBusy(true)
    setError('')
    const result = await posCheckout({
      paymentMethod,
      customerName: customerName.trim() || 'Walk-in Customer',
      amountTendered: paid,
    })
    setBusy(false)
    if (!result?.success) {
      setError(result?.error || 'The sale could not be completed.')
      return
    }
    setReceipt(result.order)
    showToast(`Sale ${result.order.id} completed.`, 'success')
    onCompleted?.()
  }

  const startNewSale = () => {
    setReceipt(null)
    setCustomerName('')
    setTendered('')
    setQuery('')
    setError('')
  }

  const footer = receipt ? (
    <>
      <button type="button" onClick={onClose} className={BTN_SECONDARY}>Close</button>
      <button type="button" onClick={startNewSale} className={BTN_PRIMARY}>New sale</button>
    </>
  ) : (
    <>
      <Link to="/admin/pos" className={BTN_SECONDARY}>Open full register</Link>
      <button type="button" onClick={handleCheckout} disabled={busy || posCart.length === 0 || short} className={BTN_PRIMARY}>
        {busy ? 'Placing sale…' : `Charge ${peso(subtotal)}`}
      </button>
    </>
  )

  return (
    <DrawerPanel isOpen={isOpen} onClose={onClose} title="New POS order" subtitle="Walk-in sale, paid at the counter" footer={footer}>
      {receipt ? (
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
            <div className="flex justify-between font-semibold text-slate-900">
              <span>{receipt.id}</span>
              <span>{peso(receipt.total)}</span>
            </div>
            <p className="text-xs text-slate-500">{receipt.customer} · {receipt.paymentMethod}</p>
            <ul className="text-xs text-slate-600 divide-y divide-slate-100">
              {receipt.items.map((item, i) => (
                <li key={i} className="flex justify-between py-1">
                  <span>{item.qty} × {item.name}</span>
                  <span className="tabular-nums">{peso(item.price * item.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between text-xs pt-1 border-t border-slate-100">
              <span className="text-slate-500">Tendered / change</span>
              <span className="font-semibold tabular-nums">{peso(receipt.amountTendered)} / {peso(receipt.change)}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className={LABEL} htmlFor="pos-search">Add product</label>
            <input
              id="pos-search"
              className={INPUT}
              placeholder="Search by name or SKU"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <ul className="mt-2 divide-y divide-slate-100 border border-slate-200 rounded-md">
              {sellable.length === 0 && <li className="p-3 text-xs text-slate-400 text-center">No sellable products match.</li>}
              {sellable.map((p) => {
                const atLimit = !p.preOrder && qtyInCart(p) >= p.totalStock
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {peso(p.price)} · {p.preOrder ? 'Pre-order' : `${p.totalStock} in stock`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => posAddToCart(p, 'Standard', 1)}
                      disabled={atLimit}
                      className="h-8 px-2.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    >
                      Add
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className={LABEL}>Basket ({posCart.length})</span>
              {posCart.length > 0 && (
                <button type="button" onClick={() => posClearCart()} className="text-xs text-slate-500 hover:text-rose-600 cursor-pointer">
                  Clear
                </button>
              )}
            </div>
            {posCart.length === 0 ? (
              <p className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-md p-3 text-center">
                The basket is empty.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {posCart.map((line, index) => (
                  <li key={`${line.id}-${line.variant}`} className="flex items-center gap-2 px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-900 truncate">{line.name}</p>
                      <p className="text-[11px] text-slate-500">{peso(line.price)} each</p>
                    </div>
                    <div className="flex items-center border border-slate-200 rounded-md">
                      <button type="button" aria-label="Decrease" onClick={() => posUpdateQty(index, line.qty - 1)} className="w-8 h-8 text-slate-600 hover:bg-slate-50 cursor-pointer">−</button>
                      <span className="w-7 text-center text-sm tabular-nums">{line.qty}</span>
                      <button type="button" aria-label="Increase" onClick={() => posUpdateQty(index, line.qty + 1)} className="w-8 h-8 text-slate-600 hover:bg-slate-50 cursor-pointer">+</button>
                    </div>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">{peso(line.price * line.qty)}</span>
                    <button type="button" aria-label={`Remove ${line.name}`} onClick={() => posRemoveItem(index)} className="w-7 h-7 text-slate-400 hover:text-rose-600 cursor-pointer">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2">
              <label className={LABEL} htmlFor="pos-customer">Customer (optional)</label>
              <input id="pos-customer" className={INPUT} placeholder="Walk-in Customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="pos-method">Payment</label>
              <select id="pos-method" className={INPUT} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option>Cash</option>
                <option>GCash</option>
                <option>Card</option>
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="pos-tendered">Amount tendered</label>
              <input
                id="pos-tendered"
                type="number"
                min="0"
                step="0.01"
                className={INPUT}
                placeholder={subtotal.toFixed(2)}
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-slate-600">Total</span><span className="font-bold tabular-nums">{peso(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Change</span><span className="tabular-nums">{peso(change)}</span></div>
            {short && <p className="text-xs text-rose-600">Amount tendered is less than the total.</p>}
          </div>

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        </>
      )}
    </DrawerPanel>
  )
}
