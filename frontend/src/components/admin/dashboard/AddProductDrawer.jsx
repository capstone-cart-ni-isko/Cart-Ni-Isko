import { useState } from 'react'
import DrawerPanel from '../DrawerPanel.jsx'
import { useAdmin } from '../../../hooks/useAdmin.js'
import { uploadImage } from '../../../services/upload.js'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './ui.js'

const CATEGORIES = ['Shirts', 'Hoodie', 'Varsity Jacket', 'Cap', 'Lanyard', 'Pins', 'Accessories']
const EMPTY = { name: '', category: 'Shirts', price: '', stock: '', desc: '', photo: '' }

/* Adds a catalog product through the same addProduct action as Inventory. */
export default function AddProductDrawer({ isOpen, onClose, onCompleted }) {
  const { addProduct } = useAdmin()
  const [form, setForm] = useState(EMPTY)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const url = await uploadImage(file, 'product')
      setForm((prev) => ({ ...prev, photo: url }))
    } catch (err) {
      setError(err?.message || 'Photo upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const price = Number(form.price)
  const stock = Number(form.stock)
  const valid = form.name.trim().length >= 2 && price > 0 && Number.isInteger(stock) && stock >= 0 && form.stock !== ''

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    const result = await addProduct({
      name: form.name.trim(),
      category: form.category,
      price,
      stock,
      desc: form.desc.trim(),
      photo: form.photo,
    })
    setBusy(false)
    if (!result?.success) {
      setError(result?.error || 'The product could not be added.')
      return
    }
    // addProduct already confirms with its own toast
    setForm(EMPTY)
    onCompleted?.()
    onClose()
  }

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Add new product"
      subtitle="Published to the storefront immediately"
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={!valid || busy || uploading} className={BTN_PRIMARY}>
            {busy ? 'Adding…' : 'Add product'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={LABEL} htmlFor="np-name">Product name</label>
          <input id="np-name" className={INPUT} value={form.name} onChange={set('name')} placeholder="e.g. BU Centennial Shirt" autoFocus required />
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className={LABEL} htmlFor="np-category">Category</label>
            <select id="np-category" className={INPUT} value={form.category} onChange={set('category')}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="np-price">Price (₱)</label>
            <input id="np-price" type="number" min="1" step="0.01" className={INPUT} value={form.price} onChange={set('price')} required />
          </div>
          <div>
            <label className={LABEL} htmlFor="np-stock">Stock</label>
            <input id="np-stock" type="number" min="0" step="1" className={INPUT} value={form.stock} onChange={set('stock')} required />
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="np-desc">Description</label>
          <textarea id="np-desc" rows={3} className={`${INPUT} h-auto py-2`} value={form.desc} onChange={set('desc')} />
        </div>
        <div>
          <label className={LABEL} htmlFor="np-photo">Photo (optional)</label>
          <input id="np-photo" type="file" accept="image/*" onChange={handlePhoto} className="block w-full text-xs text-slate-600 file:mr-2 file:h-8 file:px-3 file:rounded-md file:border file:border-slate-200 file:bg-white file:text-xs file:font-medium" />
          {uploading && <p className="text-[11px] text-slate-500 mt-1">Uploading…</p>}
          {form.photo && !uploading && (
            <img src={form.photo} alt="Product preview" className="mt-2 w-20 h-20 object-contain rounded-md border border-slate-200" />
          )}
        </div>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </form>
    </DrawerPanel>
  )
}
