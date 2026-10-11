import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import ConfirmModal from '../../components/ui/ConfirmModal.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import { apiGet } from '../../services/api.js'
import { fetchProductSales, mapAdminProduct, optionLabel } from '../../services/adminProducts.js'
import { uploadImage } from '../../services/upload.js'

/**
 * FLOW-MANAGE_INV-05 / FLOW-MANAGE_INV-08 / REQ-MANAGE_INV-06 / REQ-MANAGE_INV-07
 *
 * The per-product inventory page: every variation with its own price and stock
 * level, the live metrics aggregated from `prodsales`, and the daily sales
 * history of the product over a date range.
 *
 * The backend has served both halves of this page since the start
 * (GET /products/view for the row, GET /products/sales for the history) but no
 * screen called them, so the domain was only half wired.
 *
 * FLOW-MANAGE_INV-01 also asks for the variations themselves to be editable
 * here - and for a product that variates along several axes at once
 * (colour × size, colour × material) every combination is its own row, so a
 * combination is added, edited and removed on its own rather than by rewriting
 * the whole set.
 */

/** REQ-ADD_PROD-07 / FLOW-ADD_PROD-03: JPG and PNG, at most 2 MB each. */
const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg'
const ACCEPTED_IMAGE_MIME = ['image/png', 'image/jpeg']
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

/** A product can variate along at most four axes at the same time. */
const MAX_OPTION_AXES = 4

/** The axes a product usually varies along, offered first in the picker. */
const SUGGESTED_AXES = ['Color', 'Size', 'Material', 'Fit', 'Edition', 'Style']

/** FLOW-MANAGE_INV-08: the windows the sales history offers. */
const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoISO(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function money(value) {
  return `₱${(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AdminProductDetail() {
  const { prodId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { unlistProduct, sellProduct, deleteProduct, refreshProducts, addVariant, updateVariant, removeVariant } = useAdmin()

  const [row, setRow] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Sales history (FLOW-MANAGE_INV-08): a window plus a live date range.
  const [range, setRange] = useState('30')
  const [dateFrom, setDateFrom] = useState(() => daysAgoISO(30))
  const [dateTo, setDateTo] = useState(() => todayISO())
  const [sales, setSales] = useState(null)

  // FLOW-MANAGE_INV-01: one combination at a time. `editing` holds the row the
  // drawer points at (null = adding a new one) and `draft` its fields.
  const [comboEditorOpen, setComboEditorOpen] = useState(false)
  const [comboTarget, setComboTarget] = useState(null)
  const [comboDraft, setComboDraft] = useState({
    axisValues: {},
    name: '',
    stock: '0',
    markup: '0',
    pic: '',
    preorder: false,
  })
  const [comboRemoveTarget, setComboRemoveTarget] = useState(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const comboPhotoRef = useRef(null)

  const load = useCallback(async () => {
    if (!prodId) return
    setIsLoading(true)
    setLoadError('')
    try {
      const data = await apiGet('/products/view', { prod_id: prodId })
      setRow(mapAdminProduct(data?.data))
    } catch (err) {
      setRow(null)
      setLoadError(err?.message || 'Unable to load this product.')
    } finally {
      setIsLoading(false)
    }
  }, [prodId])

  useEffect(() => {
    load()
  }, [load])

  // FLOW-MANAGE_INV-08: the history is fetched per window, so a date change
  // re-queries instead of slicing a fixed payload in the browser.
  useEffect(() => {
    if (!prodId) return
    let cancelled = false
    fetchProductSales(prodId, { dateFrom, dateTo })
      .then((payload) => {
        if (!cancelled) setSales(payload)
      })
      .catch(() => {
        if (!cancelled) setSales(null)
      })
    return () => {
      cancelled = true
    }
  }, [prodId, dateFrom, dateTo])

  const handleRangeChange = (value) => {
    setRange(value)
    if (value === 'custom') return
    setDateFrom(daysAgoISO(Number(value)))
    setDateTo(todayISO())
  }

  const salesEntry = useMemo(() => {
    if (!sales) return null
    // prod_id was sent, so the endpoint answers with the one matching product.
    if (Array.isArray(sales)) {
      return sales.find((entry) => String(entry.prod_id) === String(prodId)) || sales[0] || null
    }
    return sales
  }, [sales, prodId])

  const days = useMemo(() => {
    const list = Array.isArray(salesEntry?.days) ? salesEntry.days : []
    const max = list.reduce((peak, day) => Math.max(peak, Number(day.qty) || 0), 0)
    return { list, max }
  }, [salesEntry])

  const handleToggleListing = async () => {
    if (!row) return
    try {
      // Both actions go through AdminContext so the shared catalog refreshes.
      if (row.disabled) await sellProduct(row.prodId ?? prodId)
      else await unlistProduct(row.prodId ?? prodId)
      showToast(row.disabled ? 'Product relisted in the catalog.' : 'Product unlisted from the catalog.', 'success')
      load()
    } catch (err) {
      showToast(err?.message || 'Failed to change the listing.', 'error')
    }
  }

  const handleDelete = async () => {
    if (!row) return
    if (!window.confirm(`Remove ${row.name} from the catalog?`)) return
    try {
      await deleteProduct(row.prodId ?? prodId)
      showToast('Product removed from the catalog.', 'success')
      refreshProducts()
      navigate('/admin/inventory')
    } catch (err) {
      showToast(err?.message || 'Failed to remove the product.', 'error')
    }
  }

  // ==========================================
  // COMBINATION EDITING (FLOW-MANAGE_INV-01)
  // ==========================================

  /** Every axis the product varies along, and the values each one takes. */
  const axisSummary = useMemo(() => {
    const summary = []
    ;(row?.variants || []).forEach((variant) => {
      Object.entries(variant.options || {}).forEach(([axis, value]) => {
        const entry = summary.find((e) => e.axis === axis)
        if (entry) {
          if (!entry.values.includes(value)) entry.values.push(value)
          return
        }
        summary.push({ axis, values: [value] })
      })
    })
    return summary
  }, [row])

  /** The combination currently picked in the editor, as an {axis: value} map. */
  const comboOptions = useMemo(() => {
    const out = {}
    Object.entries(comboDraft.axisValues || {}).forEach(([axis, value]) => {
      if (String(value || '').trim()) out[axis] = String(value).trim()
    })
    return out
  }, [comboDraft.axisValues])

  /** Duplicate combinations are refused server-side; say so before saving. */
  const comboDuplicate = useMemo(() => {
    const keys = Object.keys(comboOptions)
    if (keys.length === 0) return null
    return (row?.variants || []).find((variant) => {
      if (comboTarget && variant.prodvarId === comboTarget.prodvarId) return false
      const variantOptions = variant.options || {}
      const variantKeys = Object.keys(variantOptions)
      if (variantKeys.length !== keys.length) return false
      return keys.every((axis) => variantOptions[axis] === comboOptions[axis])
    }) || null
  }, [row, comboTarget, comboOptions])

  const openComboEditor = (variant = null) => {
    setComboTarget(variant)
    setComboDraft({
      axisValues: { ...(variant?.options || {}) },
      name: variant && variant.name !== variant.label ? variant.name : '',
      stock: String(variant?.stock ?? 0),
      markup: String(variant?.markup ?? 0),
      pic: variant?.pic || '',
      preorder: !!variant?.preorder,
    })
    setComboEditorOpen(true)
  }

  const closeComboEditor = () => {
    setComboEditorOpen(false)
    setComboTarget(null)
  }

  const handleComboPhotoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ACCEPTED_IMAGE_MIME.includes(file.type)) {
      showToast('Product images must be PNG or JPEG files.', 'error')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast('Product images must be 2 MB or smaller.', 'error')
      return
    }
    setIsUploadingPhoto(true)
    try {
      const url = await uploadImage(file, 'product')
      if (url) setComboDraft((draft) => ({ ...draft, pic: url }))
    } catch (err) {
      showToast(err?.message || 'Unable to upload the image.', 'error')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const handleComboSave = async () => {
    if (!row) return
    const stock = Number.parseInt(comboDraft.stock, 10)
    const markup = Number.parseFloat(comboDraft.markup)
    if (!Number.isFinite(stock) || stock < 0) {
      showToast('Stock must be zero or more.', 'error')
      return
    }
    if (Number.isFinite(markup) && markup < 0) {
      showToast('Markup cannot be negative.', 'error')
      return
    }
    if (comboDuplicate) {
      showToast(`"${comboDuplicate.label}" already varates this product the same way.`, 'error')
      return
    }

    const fields = {
      prodvar_stock: stock,
      prodvar_markup: Number.isFinite(markup) ? markup : 0,
      prodvar_preorder: !!comboDraft.preorder,
      ...(Object.keys(comboOptions).length > 0 ? { prodvar_options: comboOptions } : {}),
      ...(comboDraft.name.trim() ? { prodvar_name: comboDraft.name.trim() } : {}),
      ...(comboDraft.pic ? { prodvar_pic: comboDraft.pic } : {}),
    }

    const result = comboTarget
      ? await updateVariant(row.prodId, comboTarget.prodvarId, fields)
      : await addVariant(row.prodId, fields)

    if (result.success) {
      closeComboEditor()
      load()
    }
  }

  const handleComboRemove = async () => {
    if (!row || !comboRemoveTarget) return
    const result = await removeVariant(row.prodId, comboRemoveTarget.prodvarId)
    setComboRemoveTarget(null)
    if (result.success) load()
  }

  return (
    <AdminLayout>
      <div className="space-y-4 animate-fade-in pb-10">
        {/* FLOW-NAV-01: a working back control, top-left, at the page level. */}
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/admin/inventory"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to inventory
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleListing}
              disabled={!row}
              className="h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              {row?.disabled ? 'Relist product' : 'Unlist product'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!row}
              className="h-8 px-3 rounded-md border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-xs text-slate-400 font-medium flex items-center gap-2 py-10">
            <span className="spinner-circle !w-3.5 !h-3.5" /> Loading product…
          </p>
        ) : loadError ? (
          <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-red-700">{loadError}</p>
            <button
              type="button"
              onClick={load}
              className="text-xs font-bold text-red-700 border border-red-300 rounded-md px-2 py-1 hover:bg-red-100 cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : !row ? (
          <p className="text-xs text-slate-400 font-medium py-10">Product not found.</p>
        ) : (
          <>
            {/* FLOW-MANAGE_INV-05: the product header with its metrics */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-start gap-4">
              <img
                src={getImageUrl(row.image)}
                alt={row.name}
                className="w-20 h-20 rounded-md border border-slate-200 object-contain bg-slate-50 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-base font-bold text-slate-900 truncate">{row.name}</h1>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {row.sku} • {row.categoryName}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                      row.disabled
                        ? 'bg-slate-100 text-slate-600 border border-slate-200'
                        : row.availability === 'Pre-order'
                        ? 'bg-orange-50 text-brand-orange border border-orange-200/60'
                        : 'bg-blue-50 text-blue-700 border border-blue-200/60'
                    }`}
                  >
                    {row.disabled ? 'Unlisted' : row.status}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Base price</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{money(row.price)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total stock</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{row.totalStock}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Units sold</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{row.orders}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rating</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">
                      {row.rating ? `${row.rating} ★ (${row.reviewCount})` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* FLOW-MANAGE_INV-05: all variations, prices and stock levels.
                A product that variates along several axes at the same time has
                one row per COMBINATION - (cream, medium) and (black, metallic)
                are two rows, each with its own stock and markup. */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-900">
                    Variations{' '}
                    <span className="font-medium text-slate-400">({row.variants.length})</span>
                  </h2>
                  {axisSummary.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Varies by {axisSummary.map((entry) => entry.axis).join(' × ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    Low stock ≤ {row.lowStockThreshold} units
                  </span>
                  <button
                    type="button"
                    onClick={() => openComboEditor(null)}
                    className="h-7 px-2.5 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white text-[11px] font-semibold cursor-pointer"
                  >
                    + Combination
                  </button>
                </div>
              </div>
              {row.variants.length === 0 ? (
                <p className="px-4 py-6 text-xs text-slate-400">This product has no live variation.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">Variation</th>
                        <th className="px-4 py-2 text-left font-semibold">Price</th>
                        <th className="px-4 py-2 text-left font-semibold">Stock</th>
                        <th className="px-4 py-2 text-left font-semibold">Status</th>
                        <th className="px-4 py-2 text-left font-semibold">Last updated</th>
                        <th className="px-4 py-2 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {row.variants.map((variant) => (
                        <tr key={variant.id}>
                          <td className="px-4 py-2">
                            <div className="font-bold text-slate-900">{variant.label || variant.name}</div>
                            {Object.keys(variant.options || {}).length > 0 && (
                              <div className="text-[10px] font-semibold text-slate-400">
                                {Object.entries(variant.options)
                                  .map(([axis, value]) => `${axis}: ${value}`)
                                  .join(' · ')}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-700">{money(variant.price)}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`font-bold ${
                                variant.stock === 0
                                  ? 'text-rose-600'
                                  : variant.lowStock
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                              }`}
                            >
                              {variant.stock}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-600">{variant.status}</td>
                          <td className="px-4 py-2 text-slate-400">{variant.lastUpdated}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  updateVariant(row.prodId, variant.prodvarId, {
                                    prodvar_disabled: variant.available,
                                  })
                                    .then(() => load())
                                }
                                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                              >
                                {variant.available ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openComboEditor(variant)}
                                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                aria-label={`Remove ${variant.label || variant.name}`}
                                onClick={() => setComboRemoveTarget(variant)}
                                className="p-1 rounded-md border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* FLOW-MANAGE_INV-08 / REQ-MANAGE_INV-07: daily sales, revenue and
                trend from prodsales, over the chosen date range. */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">Sales history</h2>
                <div className="flex items-center gap-2">
                  <select
                    value={range}
                    onChange={(e) => handleRangeChange(e.target.value)}
                    className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 cursor-pointer"
                    aria-label="Date range"
                  >
                    {RANGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {range === 'custom' && (
                    <>
                      <input
                        type="date"
                        value={dateFrom}
                        max={dateTo}
                        onChange={(e) => setDateFrom(e.target.value || todayISO())}
                        className="h-8 px-2 rounded-md border border-slate-200 text-xs cursor-pointer"
                        aria-label="From date"
                      />
                      <input
                        type="date"
                        value={dateTo}
                        min={dateFrom}
                        max={todayISO()}
                        onChange={(e) => setDateTo(e.target.value || todayISO())}
                        className="h-8 px-2 rounded-md border border-slate-200 text-xs cursor-pointer"
                        aria-label="To date"
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-4 py-3 border-b border-slate-100">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Units sold</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{salesEntry?.total_qty ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Revenue</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{money(salesEntry?.total_revenue ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Walk-in</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {(salesEntry?.days || []).reduce((sum, day) => sum + (Number(day.walkin) || 0), 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Preorder</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {(salesEntry?.days || []).reduce((sum, day) => sum + (Number(day.preorder) || 0), 0)}
                  </p>
                </div>
                {/* FLOW-MANAGE_INV-08: the trend across the window (second half
                    against the first half), computed from prodsales. */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Trend</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5 flex items-center gap-1">
                    {!salesEntry?.trend || salesEntry.trend.direction === 'flat' ? (
                      <span className="text-slate-500">Flat</span>
                    ) : (
                      <span className={salesEntry.trend.direction === 'up' ? 'text-emerald-600' : 'text-rose-600'}>
                        {salesEntry.trend.direction === 'up' ? '▲' : '▼'} {Math.abs(Number(salesEntry.trend.delta) || 0)}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {days.list.length === 0 ? (
                <p className="px-4 py-6 text-xs text-slate-400">No sales recorded in this window.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">Day</th>
                        <th className="px-4 py-2 text-left font-semibold">Units</th>
                        <th className="px-4 py-2 text-left font-semibold">Revenue</th>
                        <th className="px-4 py-2 text-left font-semibold">Trend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {days.list.map((day) => (
                        <tr key={day.date}>
                          <td className="px-4 py-2 text-slate-700">{day.date}</td>
                          <td className="px-4 py-2 font-bold text-slate-900">{day.qty}</td>
                          <td className="px-4 py-2 text-slate-700">{money(day.revenue)}</td>
                          <td className="px-4 py-2">
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden w-full max-w-[160px]">
                              <div
                                className="h-full bg-brand-orange"
                                style={{ width: `${days.max > 0 ? Math.round(((Number(day.qty) || 0) / days.max) * 100) : 0}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* FLOW-MANAGE_INV-01: one combination at a time. The axis values the
            admin picks here ARE the identity of the combination, and the
            backend de-duplicates on them, so (cream, medium) can never be
            minted twice for the same shirt. */}
        {comboEditorOpen && row && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-900">
                    {comboTarget ? 'Edit Combination' : 'Add Combination'}
                  </h2>
                  <p className="text-[11px] text-slate-400 truncate">{row.name}</p>
                </div>
                <button
                  type="button"
                  aria-label="Close combination editor"
                  onClick={closeComboEditor}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="space-y-2.5 px-4 py-3 text-xs">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700">Ways to vary</label>
                    <span className="text-[10px] text-slate-400">
                      {axisSummary.length}/{MAX_OPTION_AXES} axes in use
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    One combination is one row. Pick a value on each axis you want
                    this row to cover — color&nbsp;×&nbsp;size, or
                    color&nbsp;×&nbsp;material.
                  </p>
                  {(axisSummary.length > 0 ? axisSummary : [{ axis: '', values: [] }]).map((entry, index) => (
                    <div key={`combo-axis-${index}`} className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        list="admin-product-detail-axes"
                        placeholder={index === 0 ? 'Color' : index === 1 ? 'Size' : 'Axis name'}
                        value={entry.axis}
                        onChange={(e) => {
                          const from = entry.axis
                          const to = e.target.value
                          setComboDraft((draft) => {
                            const next = { ...draft.axisValues }
                            if (from && !to) delete next[from]
                            else if (from && to) {
                              const value = next[from]
                              delete next[from]
                              next[to] = value
                            } else if (to) {
                              next[to] = ''
                            }
                            return { ...draft, axisValues: next }
                          })
                        }}
                        className="h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                      />
                      <input
                        type="text"
                        list={`admin-product-detail-values-${entry.axis}`}
                        placeholder="Value (e.g. Cream)"
                        value={comboDraft.axisValues?.[entry.axis] ?? ''}
                        onChange={(e) =>
                          setComboDraft((draft) => ({
                            ...draft,
                            axisValues: { ...draft.axisValues, [entry.axis]: e.target.value },
                          }))
                        }
                        className="h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                      />
                      <datalist id={`admin-product-detail-values-${entry.axis}`}>
                        {(entry.values || []).map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                    </div>
                  ))}
                  <datalist id="admin-product-detail-axes">
                    {[...new Set([...SUGGESTED_AXES, ...axisSummary.map((entry) => entry.axis)])]
                      .filter(Boolean)
                      .map((axis) => (
                        <option key={axis} value={axis} />
                      ))}
                  </datalist>
                  {comboOptions && Object.keys(comboOptions).length > 0 && (
                    <p className="text-[11px] font-semibold text-slate-600">
                      This row will be <span className="text-slate-900">{optionLabel({ prodvar_options: comboOptions })}</span>
                    </p>
                  )}
                  {comboDuplicate && (
                    <p className="text-[11px] font-semibold text-rose-600">
                      {comboDuplicate.label || comboDuplicate.name} already covers this combination.
                    </p>
                  )}
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Display name (optional)</label>
                  <input
                    type="text"
                    placeholder={optionLabel({ prodvar_options: comboOptions }) || 'e.g. Cream / Medium'}
                    value={comboDraft.name}
                    onChange={(e) => setComboDraft((draft) => ({ ...draft, name: e.target.value }))}
                    className="w-full h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={comboDraft.stock}
                      onChange={(e) => setComboDraft((draft) => ({ ...draft, stock: e.target.value }))}
                      className="w-full h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Markup (₱)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={comboDraft.markup}
                      onChange={(e) => setComboDraft((draft) => ({ ...draft, markup: e.target.value }))}
                      className="w-full h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={comboDraft.preorder}
                    onChange={(e) => setComboDraft((draft) => ({ ...draft, preorder: e.target.checked }))}
                    className="rounded text-brand-orange focus:ring-0"
                  />
                  Available for pre-order when out of stock
                </label>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Image (optional)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="/uploads/product/... or data URL"
                      value={comboDraft.pic}
                      onChange={(e) => setComboDraft((draft) => ({ ...draft, pic: e.target.value }))}
                      className="flex-1 h-8 px-2.5 rounded-md border border-slate-200 focus:ring-1 focus:ring-brand-orange"
                    />
                    <button
                      type="button"
                      disabled={isUploadingPhoto}
                      onClick={() => comboPhotoRef.current?.click()}
                      className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingPhoto ? 'Uploading…' : 'Upload'}
                    </button>
                    <input
                      ref={comboPhotoRef}
                      type="file"
                      accept={ACCEPTED_IMAGE_TYPES}
                      className="hidden"
                      onChange={handleComboPhotoChange}
                    />
                  </div>
                  {comboDraft.pic && (
                    <img
                      src={getImageUrl(comboDraft.pic)}
                      alt="Combination preview"
                      className="mt-2 h-14 w-14 rounded-md border border-slate-200 object-contain"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
                <button
                  type="button"
                  onClick={closeComboEditor}
                  className="h-8 px-3 rounded-md border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleComboSave}
                  disabled={!!comboDuplicate}
                  className="h-8 px-3 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {comboTarget ? 'Save Changes' : 'Add Combination'}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={!!comboRemoveTarget}
          onClose={() => setComboRemoveTarget(null)}
          onConfirm={handleComboRemove}
          title="Remove combination"
          message={
            comboRemoveTarget
              ? `"${comboRemoveTarget.label || comboRemoveTarget.name}" will be removed from ${row?.name || 'this product'}. A customer already holding it in a bag keeps it there.`
              : ''
          }
        />
      </div>
    </AdminLayout>
  )
}
