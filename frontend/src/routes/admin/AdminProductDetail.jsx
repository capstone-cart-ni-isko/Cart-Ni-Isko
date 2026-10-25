import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import ConfirmModal from '../../components/ui/ConfirmModal.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Button from '../../components/ui/Button.jsx'
import BackButton from '../../components/ui/BackButton.jsx'
import PriceTag from '../../components/ui/PriceTag.jsx'
import ProductAccordion from '../../components/ui/ProductAccordion.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import { apiGet } from '../../services/api.js'
import { fetchProductSales, mapAdminProduct, optionLabel } from '../../services/adminProducts.js'
import { uploadImage } from '../../services/upload.js'
import { empIsStaff } from '../../components/admin/schema.js'
import { PRODUCT_CATEGORIES } from '../../data/productCategories.js'
import { CalendarIcon, ShirtIcon } from '../../components/ui/Icons.jsx'
import SkeletonBlock from '../../components/ui/SkeletonBlock.jsx'

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
  { value: 'all', label: 'All time' },
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

/** Rule 67 - the message for a field sits directly beneath that field. */
function FieldError({ message }) {
  if (!message) return null
  return (
    <p className="text-2xs font-medium text-rose-600 mt-1" role="alert">
      {message}
    </p>
  )
}

export default function AdminProductDetail() {
  const { prodId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const {
    updateProduct,
    unlistProduct,
    sellProduct,
    deleteProduct,
    refreshProducts,
    addVariant,
    updateVariant,
    removeVariant,
    setProductPreorder,
    currentAdminUser,
  } = useAdmin()

  const isStaff = empIsStaff(currentAdminUser)

  const [row, setRow] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // The product-level pre-order flag. While it is on, every combination of
  // the product follows it, so the per-combination switch is locked and the
  // "Mark In Stock" button is the way back.
  const productPreorderOn = !!row?.productPreOrder

  // View mode active gallery image
  const [activeImage, setActiveImage] = useState('')

  // Editing mode state (toggled via query param ?edit=1 or page edit button)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState('Shirts')
  const [editPrice, setEditPrice] = useState('')
  const [editPhoto, setEditPhoto] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [editTouched, setEditTouched] = useState({ name: false, price: false })
  const [editFormError, setEditFormError] = useState('')
  const editPhotoRef = useRef(null)
  const [isUploadingEditPhoto, setIsUploadingEditPhoto] = useState(false)

  // Sales history (FLOW-MANAGE_INV-08): a window plus a live date range.
  const [range, setRange] = useState('30')
  const [dateFrom, setDateFrom] = useState(() => daysAgoISO(30))
  const [dateTo, setDateTo] = useState(() => todayISO())
  const [sales, setSales] = useState(null)

  // Sync editing mode with ?edit=1 query parameter
  useEffect(() => {
    if (searchParams.get('edit') === '1') {
      setIsEditing(true)
    }
  }, [searchParams])

  // Reset/populate edit form values whenever row changes
  const populateEditForm = useCallback((productRow) => {
    if (!productRow) return
    setEditName(productRow.name || '')
    setEditDesc(productRow.description || '')
    setEditCategory(productRow.categoryName || 'Shirts')
    setEditPrice(String(productRow.price ?? ''))
    setEditPhoto(productRow.image || '')
    setEditTouched({ name: false, price: false })
    setEditFormError('')
  }, [])

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
      const mapped = mapAdminProduct(data?.data)
      setRow(mapped)
      if (mapped) {
        populateEditForm(mapped)
        setActiveImage(mapped.image || '')
      }
    } catch (err) {
      setRow(null)
      setLoadError(err?.message || 'Unable to load this product.')
    } finally {
      setIsLoading(false)
    }
  }, [prodId, populateEditForm])

  useEffect(() => {
    load()
  }, [load])

  // Keep activeImage in sync when row loads
  useEffect(() => {
    if (row?.image && !activeImage) {
      setActiveImage(row.image)
    }
  }, [row, activeImage])

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
    if (value === 'all') {
      setDateFrom('2020-01-01')
      setDateTo(todayISO())
      return
    }
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
    } catch {
      showToast('Failed to change the listing.', 'error')
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
    } catch {
      showToast('Failed to remove the product.', 'error')
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
      preorder: productPreorderOn ? true : variant ? !!variant.preorderFlag : false,
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
    } catch {
      showToast('Unable to upload the image.', 'error')
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

  // ==========================================
  // EDIT PRODUCT (FLOW-MANAGE_INV-05 / REQ-IM-01)
  // ==========================================

  const handleEditPhotoChange = async (e) => {
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
    setIsUploadingEditPhoto(true)
    try {
      const url = await uploadImage(file, 'product')
      if (url) {
        setEditPhoto(url)
        setActiveImage(url)
      }
    } catch {
      showToast('Unable to upload the image.', 'error')
    } finally {
      setIsUploadingEditPhoto(false)
    }
  }

  const nameError = editTouched.name && !editName.trim() ? 'Product name is required.' : ''
  const parsedPrice = parseFloat(editPrice)
  const priceError = editTouched.price && !(parsedPrice > 0) ? 'Product price must be greater than zero.' : ''

  const handleSaveProduct = async (e) => {
    if (e) e.preventDefault()
    if (!row) return
    setEditTouched({ name: true, price: true })
    if (!editName.trim() || !(parsedPrice > 0)) return

    setIsSaving(true)
    setEditFormError('')
    try {
      const targetId = row.prodId ?? prodId
      const result = await updateProduct(targetId, {
        prod_name: editName.trim(),
        prod_desc: editDesc,
        prod_categ: editCategory,
        prod_price: parsedPrice,
        ...(editPhoto ? { prod_images: [editPhoto] } : {}),
      })
      if (result.success) {
        showToast('Product updated successfully.', 'success')
        setIsEditing(false)
        if (searchParams.get('edit')) {
          const nextParams = new URLSearchParams(searchParams)
          nextParams.delete('edit')
          setSearchParams(nextParams, { replace: true })
        }
        await load()
        refreshProducts()
      } else {
        const msg = result.error || 'Failed to save product changes.'
        setEditFormError(msg)
        showToast(msg, 'error')
      }
    } catch (err) {
      const msg = err?.message || 'Failed to save product changes.'
      setEditFormError(msg)
      showToast(msg, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    populateEditForm(row)
    if (searchParams.get('edit')) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('edit')
      setSearchParams(nextParams, { replace: true })
    }
  }

  /**
   * The product-level pre-order switch.
   *
   * One click moves the whole product - and every variation of it - between
   * "Pre-order" and "In Stock". It is the same switch the inventory list
   * offers, so an admin never has to edit the combinations one by one.
   */
  const handleTogglePreorder = async () => {
    if (!row) return
    const next = !row.preorder
    const result = await setProductPreorder(row.prodId, next)
    if (result.success) {
      await load()
    }
  }

  const editCategoryOptions = useMemo(() => {
    if (!editCategory || PRODUCT_CATEGORIES.includes(editCategory)) {
      return PRODUCT_CATEGORIES
    }
    return [...PRODUCT_CATEGORIES, editCategory]
  }, [editCategory])

  // Images for customer-style gallery
  const galleryImages = useMemo(() => {
    const list = []
    if (row?.image) list.push(row.image)
    if (Array.isArray(row?.variants)) {
      row.variants.forEach((v) => {
        if (v.pic && !list.includes(v.pic)) list.push(v.pic)
      })
    }
    return list
  }, [row])

  return (
    <AdminLayout>
      <div className="space-y-4 animate-fade-in pb-10">
        {/* FLOW-NAV-01: a working back control, top-left, at the page level. */}
        <div className="flex items-center justify-between gap-3">
          <BackButton
            to="/admin/inventory"
          />
          <div className="flex items-center gap-2">
            {!isStaff && (
              <>
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors shadow-2xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveProduct}
                      disabled={isSaving}
                      className="h-8 px-4 rounded-lg bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-semibold cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                    >
                      {isSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    disabled={!row}
                    className="h-8 px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors shadow-2xs disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-500">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    <span>Edit Product</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleTogglePreorder}
                  disabled={!row}
                  title={
                    row?.preorder
                      ? 'Switch this product back to In Stock'
                      : 'Mark this product as a pre-order (no stock needed)'
                  }
                  className={`h-8 px-3 rounded-lg border text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors shadow-2xs ${
                    row?.preorder
                      ? 'border-orange-200 bg-orange-50 text-brand-orange hover:bg-orange-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {row?.preorder ? 'Mark In Stock' : 'Mark Pre-order'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleListing}
                  disabled={!row}
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                >
                  {row?.disabled ? 'Relist product' : 'Unlist product'}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!row}
                  className="h-8 px-3 rounded-lg border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        </div>

        {isLoading ? (
          (isEditing || searchParams.get('edit') === '1') ? (
            /* Product Edit Mode Skeleton */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-pulse" aria-hidden="true">
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 flex flex-col items-center text-center space-y-3">
                <SkeletonBlock className="w-32 h-32 rounded-2xl" />
                <SkeletonBlock className="h-4 w-28 rounded" />
                <SkeletonBlock className="h-3 w-20 rounded" />
                <SkeletonBlock className="h-8 w-28 rounded-lg mt-2" />
              </div>

              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="space-y-1.5">
                    <SkeletonBlock className="h-4 w-32 rounded" />
                    <SkeletonBlock className="h-3 w-48 rounded" />
                  </div>
                  <SkeletonBlock className="h-6 w-24 rounded-full" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <SkeletonBlock className="h-3 w-24 rounded" />
                    <SkeletonBlock className="h-9 w-full rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <SkeletonBlock className="h-3 w-24 rounded" />
                    <SkeletonBlock className="h-9 w-full rounded-xl" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <SkeletonBlock className="h-3 w-20 rounded" />
                  <SkeletonBlock className="h-9 w-full rounded-xl" />
                </div>

                <div className="space-y-1.5">
                  <SkeletonBlock className="h-3 w-28 rounded" />
                  <SkeletonBlock className="h-24 w-full rounded-xl" />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <SkeletonBlock className="h-9 w-20 rounded-xl" />
                  <SkeletonBlock className="h-9 w-28 rounded-xl" />
                </div>
              </div>
            </div>
          ) : (
            /* Product View Mode Skeleton */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start animate-pulse" aria-hidden="true">
              <div className="flex flex-col gap-3">
                <SkeletonBlock className="aspect-square w-full rounded-3xl" />
                <div className="flex items-center gap-2">
                  <SkeletonBlock className="w-16 h-16 rounded-xl" />
                  <SkeletonBlock className="w-16 h-16 rounded-xl" />
                  <SkeletonBlock className="w-16 h-16 rounded-xl" />
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <SkeletonBlock className="h-4 w-24 rounded" />
                  <SkeletonBlock className="h-7 w-3/4 rounded" />
                  <SkeletonBlock className="h-3 w-32 rounded" />
                </div>

                <SkeletonBlock className="h-8 w-36 rounded" />

                <div className="space-y-2 pt-2">
                  <SkeletonBlock className="h-3.5 w-full rounded" />
                  <SkeletonBlock className="h-3.5 w-5/6 rounded" />
                  <SkeletonBlock className="h-3.5 w-2/3 rounded" />
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 mt-2">
                  <SkeletonBlock className="h-4 w-32 rounded" />
                  <div className="grid grid-cols-2 gap-2">
                    <SkeletonBlock className="h-10 rounded-xl" />
                    <SkeletonBlock className="h-10 rounded-xl" />
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 mt-2">
                  <SkeletonBlock className="h-4 w-40 rounded" />
                  <SkeletonBlock className="h-24 rounded-xl" />
                </div>
              </div>
            </div>
          )
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
        ) : isEditing ? (
          /* ============================================================ */
          /* EDITABLE FIELDS SECTION (Styled identically to AdminAccount) */
          /* ============================================================ */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-in">
            {/* Product Photo Upload Card */}
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 flex flex-col items-center text-center space-y-3">
              <div className="w-32 h-32 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center p-2 overflow-hidden relative group">
                {editPhoto ? (
                  <img
                    src={getImageUrl(editPhoto)}
                    alt={editName || 'Product'}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ShirtIcon className="w-16 h-16 text-slate-300" />
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{editName || 'Product'}</p>
                <p className="text-2xs text-slate-400 mt-0.5">SKU: {row.sku}</p>
              </div>
              <button
                type="button"
                disabled={isUploadingEditPhoto}
                onClick={() => editPhotoRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-2xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-500">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>{isUploadingEditPhoto ? 'Uploading…' : 'Change photo'}</span>
              </button>
              <input
                ref={editPhotoRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                onChange={handleEditPhotoChange}
                className="hidden"
              />
              <p className="text-2xs text-slate-400">JPG or PNG · max 2 MB</p>

              {editPhoto && (
                <button
                  type="button"
                  onClick={() => setEditPhoto('')}
                  className="text-2xs font-semibold text-rose-600 hover:underline cursor-pointer pt-1"
                >
                  Remove photo
                </button>
              )}
            </section>

            {/* Editable Fields Form */}
            <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Edit product details</h2>
                  <p className="text-2xs text-slate-400 mt-0.5">
                    Update base information, category, and pricing.
                  </p>
                </div>
                <span className="text-2xs font-mono font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
                  {row.sku}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">
                    Product name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value)
                      setEditTouched((t) => ({ ...t, name: true }))
                    }}
                    onBlur={() => setEditTouched((t) => ({ ...t, name: true }))}
                    aria-invalid={!!nameError}
                    placeholder="e.g. BU Pride Classic Hoodie"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                  />
                  <FieldError message={nameError} />
                </div>

                <div>
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all cursor-pointer"
                  >
                    {editCategoryOptions.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">
                    Base price (₱) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={editPrice}
                    onChange={(e) => {
                      setEditPrice(e.target.value)
                      setEditTouched((t) => ({ ...t, price: true }))
                    }}
                    onBlur={() => setEditTouched((t) => ({ ...t, price: true }))}
                    aria-invalid={!!priceError}
                    placeholder="e.g. 750.00"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                  />
                  <FieldError message={priceError} />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Provide detailed description of materials, sizing, and features..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand-orange focus:ring-1 focus:ring-brand-orange transition-all"
                  />
                </div>
              </div>

              {editFormError && (
                <p className="text-2xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3" role="alert">
                  {editFormError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="h-9 px-4 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProduct}
                  disabled={isSaving}
                  className="h-9 px-4 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </section>
          </div>
        ) : (
          /* ============================================================ */
          /* COMPLETE PRODUCT DETAILS VIEW (Customer-side like aesthetic) */
          /* ============================================================ */
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
              {/* Left Column: Rich Product Image Gallery */}
              <div className="lg:sticky lg:top-6 flex flex-col gap-3">
                <div className="relative aspect-square w-full bg-gradient-to-br from-orange-50/70 via-gray-50 to-blue-50/50 rounded-3xl overflow-hidden border border-gray-100 flex items-center justify-center shadow-2xs group">
                  {/* Status Badge Tag Over Main Image */}
                  <div className="absolute top-4 left-4 z-10 flex flex-col gap-1.5">
                    {row.disabled ? (
                      <span className="inline-flex items-center gap-1 bg-slate-700 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                        Unlisted
                      </span>
                    ) : row.availability === 'Pre-order' ? (
                      <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                        <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>For Pre-order</span>
                      </span>
                    ) : row.totalStock === 0 ? (
                      <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                        Out of Stock
                      </span>
                    ) : row.lowStock ? (
                      <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                        Low Stock ({row.totalStock} left)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                        Active Catalog
                      </span>
                    )}
                  </div>

                  {/* Main Image */}
                  {activeImage ? (
                    <img
                      key={activeImage}
                      src={getImageUrl(activeImage)}
                      alt={row.name}
                      className="w-full h-full object-contain p-4 md:p-8 transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <ShirtIcon className="w-28 h-28 md:w-36 md:h-36 text-brand-orange opacity-40 filter drop-shadow-md" />
                  )}
                </div>

                {/* Thumbnail Strip Gallery */}
                {galleryImages.length > 1 && (
                  <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {galleryImages.map((imgSrc, idx) => {
                      const isActive = activeImage === imgSrc
                      return (
                        <button
                          key={imgSrc + idx}
                          type="button"
                          onClick={() => setActiveImage(imgSrc)}
                          className={`relative w-20 h-20 rounded-2xl overflow-hidden border-2 bg-white shrink-0 transition-all cursor-pointer p-1.5 ${
                            isActive
                              ? 'border-[#FF6A00] shadow-sm'
                              : 'border-gray-200 hover:border-gray-300 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={getImageUrl(imgSrc)}
                            alt={`Preview ${idx + 1}`}
                            className="w-full h-full object-contain"
                          />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Complete Product Details */}
              <div className="flex flex-col gap-5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-brand-orange uppercase tracking-widest">
                      {row.categoryName}
                    </span>
                    <span className="text-2xs font-mono font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-md">
                      SKU: {row.sku}
                    </span>
                  </div>
                  <h1 className="text-xl md:text-2xl font-bold text-gray-900 mt-1 leading-tight">
                    {row.name}
                  </h1>

                  {/* Rating Badge */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="flex text-amber-400 text-sm">★</span>
                    <span className="text-xs font-bold text-gray-800">
                      {row.rating ? row.rating.toFixed(1) : 'No reviews'}
                    </span>
                    <span className="text-xs text-gray-400">
                      ({row.reviewCount} customer reviews)
                    </span>
                  </div>

                  {/* Price Tag & Stock Summary */}
                  <div className="mt-4 flex items-center justify-between flex-wrap gap-2 p-4 bg-orange-50/50 rounded-2xl border border-orange-100">
                    <div>
                      <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Base Price</p>
                      <PriceTag
                        amount={row.price}
                        className="text-2xl font-extrabold text-brand-orange"
                      />
                    </div>
                    <div className="text-right">
                      <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Total Stock</p>
                      <p className="text-base font-bold text-slate-900 mt-0.5">
                        {row.totalStock} units
                      </p>
                    </div>
                  </div>
                </div>

                {/* Metrics 4-Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <div>
                    <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Availability</p>
                    <p className="text-xs font-bold text-slate-800 mt-0.5">{row.availability}</p>
                  </div>
                  <div>
                    <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Total Sold (All-time)</p>
                    <p className="text-xs font-bold text-slate-800 mt-0.5">{row.orders} {row.orders === 1 ? 'unit' : 'units'}</p>
                  </div>
                  <div>
                    <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Variations</p>
                    <p className="text-xs font-bold text-slate-800 mt-0.5">{row.variants.length} combinations</p>
                  </div>
                  <div>
                    <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Threshold</p>
                    <p className="text-xs font-bold text-slate-800 mt-0.5">≤ {row.lowStockThreshold} units</p>
                  </div>
                </div>

                {/* Description */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Description</h3>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {row.description || 'No description provided for this product.'}
                  </p>
                </div>

                {/* Product Accordion for Specs (Customer-Side feature) */}
                <ProductAccordion
                  details={{
                    material: row.description || 'Official Tindahan ni Isko merchandise.',
                    sizeFit: ['Hoodies', 'Jackets', 'Shirts'].includes(row.categoryName)
                      ? 'True to size collegiate unisex fit.'
                      : 'Standard one size specification.',
                    care: 'Wash cold inside out with similar colors. Avoid harsh bleach.',
                    shippingReturns: 'Store pickup at BU Student Center or courier delivery across Albay & nationwide.',
                  }}
                  preOrder={row.availability === 'Pre-order'}
                />
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
                    <p className="text-2xs text-slate-400 mt-0.5">
                      Varies by {axisSummary.map((entry) => entry.axis).join(' × ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-slate-400 hidden sm:inline">
                    Low stock ≤ {row.lowStockThreshold} units
                  </span>
                  <button
                    type="button"
                    onClick={() => openComboEditor(null)}
                    className="h-7 px-2.5 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white text-2xs font-semibold cursor-pointer"
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
                              <div className="text-2xs font-semibold text-slate-400">
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
                                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-2xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                              >
                                {variant.available ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openComboEditor(variant)}
                                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-2xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
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
                  <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Units sold</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{salesEntry?.total_qty ?? 0}</p>
                </div>
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Revenue</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{money(salesEntry?.total_revenue ?? 0)}</p>
                </div>
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Walk-in</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {(salesEntry?.days || []).reduce((sum, day) => sum + (Number(day.walkin) || 0), 0)}
                  </p>
                </div>
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Preorder</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {(salesEntry?.days || []).reduce((sum, day) => sum + (Number(day.preorder) || 0), 0)}
                  </p>
                </div>
                {/* FLOW-MANAGE_INV-08: the trend across the window (second half
                    against the first half), computed from prodsales. */}
                <div>
                  <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">Trend</p>
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
          <Modal
            isOpen={comboEditorOpen && !!row}
            onClose={closeComboEditor}
            title={comboTarget ? 'Edit Combination' : 'Add Combination'}
            subtitle={row.name}
            size="wide"
            bodyClassName="modal-scroll space-y-2.5 text-xs"
            footer={
              <>
                <Button variant="secondary" onClick={closeComboEditor} className="px-3.5">
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleComboSave}
                  disabled={!!comboDuplicate}
                  className="px-3.5"
                >
                  {comboTarget ? 'Save Changes' : 'Add Combination'}
                </Button>
              </>
            }
          >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="field-label mb-0">Ways to vary</label>
                  <span className="text-2xs text-slate-400">
                    {axisSummary.length}/{MAX_OPTION_AXES} axes in use
                  </span>
                </div>
                  <p className="text-2xs text-slate-500">
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
                    <p className="text-2xs font-semibold text-slate-600">
                      This row will be <span className="text-slate-900">{optionLabel({ prodvar_options: comboOptions })}</span>
                    </p>
                  )}
                  {comboDuplicate && (
                    <p className="text-2xs font-semibold text-rose-600">
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

                <label className="flex items-center gap-2 text-2xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={comboDraft.preorder}
                    disabled={productPreorderOn}
                    onChange={(e) => setComboDraft((draft) => ({ ...draft, preorder: e.target.checked }))}
                    className="rounded text-brand-orange focus:ring-0"
                  />
                  Available for pre-order when out of stock
                </label>
                {productPreorderOn && (
                  <p className="text-2xs text-slate-400">
                    The whole product is a pre-order, so every combination follows it. Use
                    “Mark In Stock” on this page to change that.
                  </p>
                )}

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
                      className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-2xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
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
          </Modal>
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
