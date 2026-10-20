import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../ui/Modal.jsx'
import Button from '../ui/Button.jsx'
import LoadingSpinner from '../ui/LoadingSpinner.jsx'
import { ShirtIcon } from '../ui/Icons.jsx'
import { useToast } from '../../hooks/useToast.js'
import { getImageUrl } from '../../utils/imageUtils.js'
import {
  REVIEW_MAX_LENGTH,
  createReview,
  fetchMyOrderReviews,
  updateReview,
} from '../../services/reviews.js'

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']

/**
 * One row per PRODUCT: reviews are stored per customer per product, so two
 * variations of the same product in one order share a single review.
 */
function productsOf(order) {
  const rows = Array.isArray(order?.raw?.items) ? order.raw.items : []
  const byProduct = new Map()
  rows.forEach((row) => {
    const prodId = row.prod_id ?? row.product?.prod_id ?? row.prodvar?.prod_id
    if (prodId == null) return
    const key = String(prodId)
    const variant = row.prodvar_name || row.prodvar?.prodvar_name || row.size || ''
    const existing = byProduct.get(key)
    if (existing) {
      existing.qty += Number(row.qty ?? row.item_qty ?? 1)
      if (variant && !existing.variants.includes(variant)) existing.variants.push(variant)
      if (!existing.image) existing.image = row.prodvar_pic || row.prodvar?.prodvar_pic || null
      return
    }
    byProduct.set(key, {
      prodId: key,
      name: row.prod_name || row.product?.prod_name || row.product?.name || 'Item',
      image: row.prodvar_pic || row.prodvar?.prodvar_pic || row.product?.main_image || null,
      variants: variant ? [variant] : [],
      qty: Number(row.qty ?? row.item_qty ?? 1),
    })
  })
  return [...byProduct.values()]
}

/** Interactive 1–5 star input: hover preview, arrow keys, screen-reader radios. */
function StarInput({ value, onChange, disabled, label }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value

  const onKeyDown = (event) => {
    if (disabled) return
    let next = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, (value || 0) + 1)
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, (value || 2) - 1)
    if (next == null) return
    event.preventDefault()
    onChange(next)
    event.currentTarget.parentElement?.querySelector(`[data-star="${next}"]`)?.focus()
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div
        role="radiogroup"
        aria-label={label}
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            data-star={star}
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? 's' : ''} - ${RATING_LABELS[star]}`}
            tabIndex={value === star || (!value && star === 1) ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(star)}
            onMouseEnter={() => !disabled && setHover(star)}
            onKeyDown={onKeyDown}
            className="p-1 rounded-md transition-transform enabled:hover:scale-110 enabled:cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-brand-orange"
          >
            <svg
              viewBox="0 0 24 24"
              className={`w-8 h-8 transition-colors ${
                star <= shown ? 'text-amber-400' : 'text-slate-200'
              }`}
              fill="currentColor"
              aria-hidden="true"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        ))}
      </div>
      <span className="text-sm font-semibold text-slate-700 min-w-[5.5rem]" aria-live="polite">
        {RATING_LABELS[shown] || 'Tap a star'}
      </span>
    </div>
  )
}

function StaticStars({ rating }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          viewBox="0 0 24 24"
          className={`w-5 h-5 ${star <= rating ? 'text-amber-400' : 'text-slate-200'}`}
          fill="currentColor"
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  )
}

const STATUS_CHIP = {
  none: { label: 'Not reviewed', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pending: { label: 'Awaiting approval', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Published', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Not approved', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
}

function ReviewItem({ product, saved, orderId, onSaved }) {
  const { showToast } = useToast()
  const status = saved?.status || 'none'
  // An approved review is final (the server refuses edits); a rejected one is
  // replaced by writing a fresh review; a pending one is edited in place.
  const locked = status === 'approved'
  const editing = status === 'pending'

  const [rating, setRating] = useState(editing ? saved.rating : 0)
  const [text, setText] = useState(editing ? saved.message : '')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Re-seed the form whenever the stored review changes (first load, after a
  // save, or after moderation) so the card never shows stale input.
  useEffect(() => {
    const live = saved?.status === 'pending'
    setRating(live ? saved.rating : 0)
    setText(live ? saved.message : '')
    setTouched(false)
    setError('')
  }, [saved?.revId, saved?.status, saved?.rating, saved?.message])

  const unchanged = editing && rating === saved.rating && text.trim() === saved.message.trim()
  const ratingMissing = touched && rating === 0
  const chip = STATUS_CHIP[status]

  const submit = async () => {
    setTouched(true)
    if (rating === 0) {
      setError('')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (editing) {
        await updateReview({
          rev_id: saved.revId,
          ord_id: orderId,
          prod_id: Number(product.prodId),
          rating,
          message: text.trim(),
        })
        showToast(`Your review of ${product.name} was updated.`, 'success')
      } else {
        await createReview({
          ord_id: orderId,
          prod_id: Number(product.prodId),
          rating,
          message: text.trim(),
        })
        showToast(`Thanks! Your review of ${product.name} was submitted.`, 'success')
      }
      await onSaved()
    } catch (err) {
      setError(err?.message || 'We could not save your review. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 space-y-3.5">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
          {product.image ? (
            <img
              src={getImageUrl(product.image)}
              alt={product.name}
              className="w-full h-full object-contain p-1"
            />
          ) : (
            <ShirtIcon className="w-6 h-6 text-brand-orange opacity-40" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 leading-snug">{product.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {[product.variants.join(', '), `Qty ${product.qty}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${chip.cls}`}
        >
          {chip.label}
        </span>
      </div>

      {locked ? (
        <div className="space-y-1.5">
          <StaticStars rating={saved.rating} />
          {saved.message ? (
            <p className="text-sm text-slate-700 leading-relaxed break-words">“{saved.message}”</p>
          ) : (
            <p className="text-xs text-slate-400">No written comment.</p>
          )}
          <p className="text-[11px] text-slate-400">
            Your review is published on the product page and can no longer be edited.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {status === 'rejected' && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 leading-relaxed">
              Your earlier review was not approved by the store. You can write a new one below.
            </p>
          )}
          {editing && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
              Your review is waiting for store approval. You can still change it until then.
            </p>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Your rating
            </p>
            <StarInput
              value={rating}
              onChange={(value) => {
                setRating(value)
                setTouched(true)
              }}
              disabled={busy}
              label={`Rating for ${product.name}`}
            />
            {ratingMissing && (
              <p className="text-xs font-semibold text-rose-600 mt-1" role="alert">
                Please choose a star rating before submitting.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor={`review-text-${product.prodId}`}
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1"
            >
              Your review <span className="normal-case font-medium text-slate-400">(optional)</span>
            </label>
            <textarea
              id={`review-text-${product.prodId}`}
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, REVIEW_MAX_LENGTH))}
              disabled={busy}
              rows={3}
              maxLength={REVIEW_MAX_LENGTH}
              placeholder="How is the quality, fit and value? Help other students decide."
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 resize-none focus:border-brand-orange focus:ring-brand-orange/30 disabled:bg-slate-50"
            />
            <p className="text-[11px] text-slate-400 text-right mt-0.5">
              {text.length}/{REVIEW_MAX_LENGTH}
            </p>
          </div>

          {error && (
            <p className="text-xs font-semibold text-rose-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400 leading-snug">
              Reviews appear on the product page after the store approves them.
            </p>
            <Button
              variant="primary"
              onClick={submit}
              disabled={busy || unchanged}
              className="h-9 px-4 text-xs shrink-0"
            >
              {busy ? (
                <>
                  <LoadingSpinner size={14} /> Saving…
                </>
              ) : editing ? (
                'Update review'
              ) : (
                'Submit review'
              )}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

/**
 * Rate & review every product of a claimed / received order. Each item is
 * saved on its own (so one failure never costs the others), and the header
 * keeps count of how many are done.
 */
export default function OrderReviewModal({ isOpen, order, onClose }) {
  const orderId = order?.id
  const products = useMemo(() => productsOf(order), [order])
  const [saved, setSaved] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!orderId) return
    setLoadError('')
    try {
      const mine = await fetchMyOrderReviews(orderId)
      if (alive.current) setSaved(mine)
    } catch (err) {
      if (alive.current) setLoadError(err?.message || 'We could not load your reviews.')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setSaved({})
    load()
  }, [isOpen, load])

  const done = products.filter((p) => {
    const status = saved[p.prodId]?.status
    return status === 'pending' || status === 'approved'
  }).length

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="wide"
      title={orderId ? `Rate & review · Order #${orderId}` : 'Rate & review'}
      subtitle="Tell other students how each item turned out."
      footer={
        <Button variant="secondary" onClick={onClose} className="h-10 px-5">
          Done
        </Button>
      }
    >
      <div className="modal-scroll space-y-4 pr-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <LoadingSpinner size={18} /> Loading your items…
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            We could not find any items to review on this order.
          </p>
        ) : (
          <>
            {loadError && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {loadError} Existing reviews may not be shown.
              </p>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>
                  {done} of {products.length} {products.length === 1 ? 'item' : 'items'} reviewed
                </span>
                {done === products.length && (
                  <span className="text-emerald-600">All done — thank you!</span>
                )}
              </div>
              <div
                className="h-1.5 rounded-full bg-slate-100 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={products.length}
                aria-valuenow={done}
              >
                <div
                  className="h-full bg-brand-orange transition-all duration-300"
                  style={{ width: `${(done / products.length) * 100}%` }}
                />
              </div>
            </div>

            <ul className="space-y-3">
              {products.map((product) => (
                <ReviewItem
                  key={product.prodId}
                  product={product}
                  saved={saved[product.prodId]}
                  orderId={orderId}
                  onSaved={load}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  )
}
