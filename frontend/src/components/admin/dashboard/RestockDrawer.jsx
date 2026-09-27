import { useEffect, useMemo, useState } from 'react'
import DrawerPanel from '../DrawerPanel.jsx'
import { useAdmin } from '../../../hooks/useAdmin.js'
import { useToast } from '../../../hooks/useToast.js'
import { fetchSettings } from '../../../services/settings.js'
import { BTN_SECONDARY, INPUT } from '../kit/ui.js'

/*
  Restock from the dashboard: products at or below the low-stock threshold
  come first, and every row adds units through the same adjustStock action
  the inventory page uses (PUT /products/update prod_qty).
*/
export default function RestockDrawer({ isOpen, onClose, onCompleted }) {
  const { products = [], adjustStock } = useAdmin()
  const { showToast } = useToast()
  const [threshold, setThreshold] = useState(5)
  const [query, setQuery] = useState('')
  const [amounts, setAmounts] = useState({})
  const [savingId, setSavingId] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    fetchSettings()
      .then((settings) => {
        const value = Number(settings?.low_stock_threshold)
        if (value > 0) setThreshold(value)
      })
      .catch(() => {})
  }, [isOpen])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter((p) => !p.preOrder)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .sort((a, b) => a.totalStock - b.totalStock)
  }, [products, query])
  const lowCount = rows.filter((p) => p.totalStock <= threshold).length

  const handleAdd = async (product) => {
    const units = Math.floor(Number(amounts[product.id] ?? 10))
    if (!units || units < 1) return
    setSavingId(product.id)
    const saved = await adjustStock(product.id, product.totalStock + units)
    setSavingId(null)
    // adjustStock reports its own failures with a toast
    if (!saved) return
    setAmounts((prev) => ({ ...prev, [product.id]: '' }))
    showToast(`${product.name}: +${units} units`, 'success')
    onCompleted?.()
  }

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Restock inventory"
      subtitle={`${lowCount} product${lowCount === 1 ? '' : 's'} at or below ${threshold} units`}
      footer={<button type="button" onClick={onClose} className={BTN_SECONDARY}>Done</button>}
    >
      <input className={INPUT} placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md">
        {rows.length === 0 && <li className="p-3 text-xs text-slate-400 text-center">No products match.</li>}
        {rows.map((p) => {
          const low = p.totalStock <= threshold
          return (
            <li key={p.id} className="flex items-center gap-2 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                <p className={`text-[11px] ${p.totalStock === 0 ? 'text-rose-600 font-semibold' : low ? 'text-isko-orange-dark font-medium' : 'text-slate-500'}`}>
                  {p.totalStock === 0 ? 'Out of stock' : `${p.totalStock} in stock`}
                </p>
              </div>
              <input
                type="number"
                min="1"
                aria-label={`Units to add to ${p.name}`}
                className="w-16 h-8 px-2 rounded-md border border-slate-200 text-sm text-right tabular-nums focus:outline-none focus:border-isko-blue"
                placeholder="10"
                value={amounts[p.id] ?? ''}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => handleAdd(p)}
                disabled={savingId === p.id}
                className="h-8 px-2.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                {savingId === p.id ? 'Saving…' : 'Add'}
              </button>
            </li>
          )
        })}
      </ul>
    </DrawerPanel>
  )
}
