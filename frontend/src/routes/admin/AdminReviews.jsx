import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { fetchAdminProducts } from '../../services/adminProducts.js'
import { fetchProductReviews, moderateReview, deleteReview } from '../../services/reviews.js'

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]
const RATING_OPTIONS = [
  { value: 'all', label: 'All Stars' },
  { value: '5', label: '5 Stars' },
  { value: '4', label: '4 Stars' },
  { value: '3', label: '3 Stars' },
  { value: '2', label: '2 Stars' },
  { value: '1', label: '1 Star' },
]
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'rating-asc', label: 'Rating: Low to High' },
  { value: 'rating-desc', label: 'Rating: High to Low' },
]

const SELECT_CLASS =
  'h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300 focus:outline-none cursor-pointer'

function StarIcon({ filled = true, className = 'w-3.5 h-3.5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} ${filled ? 'text-amber-400' : 'text-slate-300'}`}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function Stars({ rating, className }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= rating} className={className} />
      ))}
    </span>
  )
}

// Status indicator: soft dot + label
function getStatusMeta(review) {
  if (review.status === 'pending') return { dot: 'bg-orange-400', label: 'Pending' }
  if (review.status === 'approved') return { dot: 'bg-emerald-500', label: 'Approved' }
  return { dot: 'bg-slate-400', label: 'Rejected' }
}

/**
 * The API returns the moderation state of a row directly (pending | approved |
 * rejected). Nothing here has to infer it from the review text any more, which
 * used to be how a censored row was recognised.
 */
function buildTimestamp(review) {
  return review.postedAt || review.date || 'Recently'
}

const errMsg = (err, fallback) => err?.message || fallback

export default function AdminReviews() {
  const { showToast } = useToast()

  // Real data: every product's reviews, loaded once per reload (Product Reviews)
  const [reviews, setReviews] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [isModerating, setIsModerating] = useState(false)

  // Show the whole queue by default. The server honours `status` only for
  // employee tokens and defaults an admin's empty filter to the whole queue
  // (ProductsAPI::displayReviews), so one request per product already carries
  // pending, approved and rejected rows; the select then filters in memory.
  const [statusFilter, setStatusFilter] = useState('all')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  // Rating is secondary to status and sort; folded so the default toolbar
  // stays three controls wide.
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false) // small screens: list -> detail drill-down
  const [checkedIds, setCheckedIds] = useState([])
  const [bulkOpen, setBulkOpen] = useState(false)

  const mapItem = useCallback((item, product) => {
    // FLOW-MANAGE_REV-05: the canonical review handle travels with the row, so
    // a click on a review of a multi-product order targets that exact review
    // instead of an ambiguous order (ProductsAPI::resolveReview answers 409
    // AMBIGUOUS_REVIEW for a multi-product order without prod_id).
    const revId = item.revId ?? null
    const prodIdBackend = item.prodId ?? null
    // ord_id comes from the payload, never from the row id: ids are now
    // `rev-<rev_id>`, so parsing the old `ord-<ord_id>` shape would read a
    // review id as an order id.
    const ordId = Number(item.ordId) || 0
    const comment = item.comment || ''
    const reviewer = item.custName || item.author || 'Verified Student'
    const reviewerInitials = reviewer
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'VS'
    return {
      id: item.id,
      revId,
      prodId: prodIdBackend,
      ordId,
      productName: product?.name || item.prodName || 'Unnamed Product',
      rating: Number(item.rating) || 0,
      comment,
      title: '',
      status: item.status || 'pending',
      timeAgo: item.date || 'Recently',
      postedAt: item.date || '',
      orderId: ordId ? `ORD-${ordId}` : '',
      reviewer,
      reviewerInitials,
      verifiedPurchase: item.verified !== false,
    }
  }, [])

  const loadReviews = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      // FLOW-MANAGE_REV-01: ONE request for the whole queue. The backend
      // answers an employee token without a product id with every pending,
      // approved and rejected row (ProductsAPI::displayReviews), so the page
      // no longer fires one request per product - a load that scaled with the
      // catalog instead of with the reviews. The catalog is still read so a
      // row whose product was since removed keeps its name.
      const [queue, products] = await Promise.all([
        fetchProductReviews(),
        fetchAdminProducts().catch(() => []),
      ])
      const byProdId = new Map(
        (products || []).map((product) => [String(product.prodId), product])
      )
      const merged = (queue.items || []).map((item) =>
        mapItem(item, byProdId.get(String(item.prodId)) || null)
      )
      setReviews(merged)
      // Partial failures still show data, with the reason surfaced inline.
      setLoadError(!queue.success && merged.length === 0 ? queue.error || 'Unable to load reviews.' : '')
      if (!queue.success && merged.length > 0) {
        showToast(`Some reviews could not be loaded: ${queue.error}`, 'info')
      }
    } catch (err) {
      setReviews([])
      setLoadError(errMsg(err, 'Unable to load reviews.'))
    } finally {
      setIsLoading(false)
    }
  }, [mapItem, showToast])

  useEffect(() => {
    loadReviews()
  }, [loadReviews, reloadKey])

  const filteredReviews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const list = reviews
      .map((r, index) => ({ r, index }))
      .filter(({ r }) => {
        const matchStatus =
          statusFilter === 'all' ||
          (statusFilter === 'pending' && r.status === 'pending') ||
          (statusFilter === 'approved' && r.status === 'approved') ||
          (statusFilter === 'rejected' && r.status === 'rejected')
        const matchRating = ratingFilter === 'all' || r.rating === parseInt(ratingFilter, 10)
        const matchSearch =
          !q ||
          [r.productName, r.reviewer, r.title, r.comment]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q))
        return matchStatus && matchRating && matchSearch
      })

    list.sort((a, b) => {
      if (sortBy === 'oldest') return b.index - a.index
      if (sortBy === 'rating-asc') return a.r.rating - b.r.rating || a.index - b.index
      if (sortBy === 'rating-desc') return b.r.rating - a.r.rating || a.index - b.index
      return a.index - b.index // newest first (data is stored newest first)
    })
    return list.map(({ r }) => r)
  }, [reviews, statusFilter, ratingFilter, sortBy, searchQuery])

  const selected = filteredReviews.find((r) => r.id === selectedId) || filteredReviews[0] || null
  const allChecked =
    filteredReviews.length > 0 && filteredReviews.every((r) => checkedIds.includes(r.id))

  const toggleChecked = (id) =>
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleSelectAll = () =>
    setCheckedIds(allChecked ? [] : filteredReviews.map((r) => r.id))

  const openReview = (id) => {
    setSelectedId(id)
    setDetailOpen(true)
  }

  // POST /reviews/moderate — approve=true publishes, false rejects
  // (FLOW-MANAGE_REV-05 / FLOW-MANAGE_REV-07)
  const applyModeration = async (review, approve) => {
    // rev_id first: the canonical handle. prod_id is sent alongside so a legacy
    // caller that still resolves by order is never ambiguous.
    await moderateReview({
      rev_id: review.revId ?? undefined,
      prod_id: review.prodId ?? undefined,
      ord_id: review.ordId || undefined,
      approve,
    })
    setReviews((list) =>
      list.map((r) =>
        r.id === review.id ? { ...r, status: approve ? 'approved' : 'rejected' } : r
      )
    )
  }

  const handleApprove = async (review) => {
    if (isModerating) return
    setIsModerating(true)
    try {
      await applyModeration(review, true)
      setDetailOpen(false)
      showToast('Review approved and published.', 'success')
    } catch (err) {
      showToast(errMsg(err, 'Failed to approve the review.'), 'error')
    } finally {
      setIsModerating(false)
    }
  }

  const handleReject = async (review) => {
    if (isModerating) return
    setIsModerating(true)
    try {
      await applyModeration(review, false)
      setDetailOpen(false)
      showToast('Review rejected.', 'success')
    } catch (err) {
      showToast(errMsg(err, 'Failed to reject the review.'), 'error')
    } finally {
      setIsModerating(false)
    }
  }

  const handleDelete = async (review) => {
    if (isModerating) return
    if (!window.confirm(`Delete the review for ${review.productName}? This cannot be undone.`)) return
    setIsModerating(true)
    try {
      // REQ-MANAGE_REV-03: the row is soft-deleted and kept for audit, so the
      // same canonical handle the moderation call uses identifies it.
      await deleteReview({
        rev_id: review.revId ?? undefined,
        prod_id: review.prodId ?? undefined,
        ord_id: review.ordId || undefined,
      })
      setReviews((list) => list.filter((r) => r.id !== review.id))
      setDetailOpen(false)
      showToast('Review deleted.', 'success')
    } catch (err) {
      showToast(errMsg(err, 'Failed to delete the review.'), 'error')
    } finally {
      setIsModerating(false)
    }
  }

  const handleBulk = async (action) => {
    const targets = reviews.filter((r) => checkedIds.includes(r.id))
    setCheckedIds([])
    setBulkOpen(false)
    if (targets.length === 0) return
    setIsModerating(true)
    let failed = 0
    for (const review of targets) {
      try {
        await applyModeration(review, action === 'approve')
      } catch {
        failed += 1
      }
    }
    setIsModerating(false)
    if (failed > 0) {
      showToast(`${failed} of ${targets.length} reviews failed to update.`, 'error')
    } else {
      showToast(
        `${targets.length} review${targets.length === 1 ? '' : 's'} ${
          action === 'approve' ? 'approved' : 'rejected'
        }.`,
        'success'
      )
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-3 animate-fade-in">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Reviews Moderation</h1>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Review customer feedback and moderate published ratings for the storefront.
            </p>
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setBulkOpen((v) => !v)}
              className="h-8 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <span>Bulk Actions</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3 text-slate-400">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {bulkOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setBulkOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-md z-40 py-1 text-xs">
                  <button
                    type="button"
                    disabled={checkedIds.length === 0 || isModerating}
                    onClick={() => handleBulk('approve')}
                    className="w-full text-left px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                  >
                    Approve selected
                  </button>
                  <button
                    type="button"
                    disabled={checkedIds.length === 0 || isModerating}
                    onClick={() => handleBulk('reject')}
                    className="w-full text-left px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                  >
                    Reject selected
                  </button>
                  <button
                    type="button"
                    disabled={checkedIds.length === 0}
                    onClick={() => {
                      setCheckedIds([])
                      setBulkOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                  >
                    Clear selection
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Load error banner */}
        {loadError && (
          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            <p className="text-xs font-semibold text-red-700">{loadError}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="text-xs font-bold text-red-700 border border-red-300 rounded-md px-2 py-1 hover:bg-red-100 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Unified search + filter bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
          <div className="relative flex-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              placeholder="Search reviews, products, customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-md bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-300"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT_CLASS} aria-label="Status">
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowMoreFilters((open) => !open)}
              aria-expanded={showMoreFilters}
              className={`h-8 px-2.5 rounded-md border text-xs font-semibold whitespace-nowrap cursor-pointer focus:outline-none ${
                showMoreFilters || ratingFilter !== 'all'
                  ? 'bg-brand-orange text-white border-brand-orange'
                  : SELECT_CLASS
              }`}
            >
              Filters
              {ratingFilter !== 'all' ? ' · 1' : ''}
            </button>
            {showMoreFilters && (
            <>
            <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} className={SELECT_CLASS} aria-label="Rating">
              {RATING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            </>
            )}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={SELECT_CLASS} aria-label="Sort">
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Split pane */}
        <div className="flex flex-col lg:flex-row gap-3 lg:h-[calc(100vh-15rem)] lg:min-h-[480px]">
          {/* LEFT: moderation queue (~35%) */}
          <div
            className={`${detailOpen ? 'hidden lg:flex' : 'flex'} flex-col lg:w-[35%] lg:shrink-0 min-h-0 bg-white border border-slate-200 rounded-lg overflow-hidden`}
          >
            <label className="flex items-center gap-2.5 px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                className="check-plain"
                checked={allChecked}
                onChange={handleSelectAll}
                aria-label="Select all reviews"
              />
              <span>Select all</span>
            </label>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {isLoading ? (
                <p className="px-4 py-10 text-center text-xs text-slate-400 font-medium flex items-center justify-center gap-2">
                  <span className="spinner-circle !w-3.5 !h-3.5" /> Loading reviews…
                </p>
              ) : filteredReviews.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-slate-400 font-medium">
                  {reviews.length === 0
                    ? 'No reviews yet. Reviews appear here once customers submit them.'
                    : 'No reviews match your filters.'}
                </p>
              ) : (
                filteredReviews.map((r) => {
                  const meta = getStatusMeta(r)
                  const isActive = selected?.id === r.id
                  return (
                    <div
                      key={r.id}
                      onClick={() => openReview(r.id)}
                      className={`flex items-start gap-2.5 px-3 py-3 cursor-pointer transition-colors border-l-2 ${
                        isActive
                          ? 'bg-orange-50/60 border-brand-orange'
                          : 'border-transparent hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="check-plain mt-0.5"
                        checked={checkedIds.includes(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleChecked(r.id)}
                        aria-label={`Select review of ${r.productName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900 truncate">{r.productName}</p>
                          <span className="text-[11px] text-slate-400 shrink-0">{r.timeAgo}</span>
                        </div>
                        {/* FLOW-MANAGE_REV-02: the queue lists the customer
                            name per review, not only the product. */}
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">by {r.reviewer}</p>
                        <div className="mt-0.5">
                          <Stars rating={r.rating} className="w-3 h-3" />
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-snug">{r.comment}</p>
                        <span className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-medium text-slate-500">
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* RIGHT: detail workspace (~65%) */}
          <div
            className={`${detailOpen ? 'flex' : 'hidden lg:flex'} flex-col flex-1 min-w-0 min-h-0 bg-white border border-slate-200 rounded-lg overflow-hidden`}
          >
            {!selected ? (
              <div className="flex-1 flex items-center justify-center px-4 py-16 text-xs text-slate-400 font-medium">
                {isLoading ? 'Loading reviews…' : 'Select a review to inspect it.'}
              </div>
            ) : (
              <>
                {/* Top action header */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setDetailOpen(false)}
                      className="lg:hidden inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-2 cursor-pointer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      Back to queue
                    </button>
                    <Link
                      to={`/admin/inventory?search=${encodeURIComponent(selected.productName)}`}
                      className="text-sm font-bold text-slate-900 hover:underline truncate block"
                    >
                      {selected.productName}
                    </Link>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Stars rating={selected.rating} className="w-3.5 h-3.5" />
                      <span className="text-[11px] text-slate-400">{buildTimestamp(selected)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={selected.status === 'approved' || isModerating}
                      onClick={() => handleApprove(selected)}
                      className={`h-8 px-3.5 rounded-md text-xs font-bold transition-colors ${
                        selected.status === 'approved' || isModerating
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer'
                      }`}
                    >
                      {isModerating ? 'Saving…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={selected.status === 'rejected' || isModerating}
                      onClick={() => handleReject(selected)}
                      className={`h-8 px-3.5 rounded-md border text-xs font-semibold transition-colors ${
                        selected.status === 'rejected' || isModerating
                          ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={isModerating}
                      onClick={() => handleDelete(selected)}
                      className="h-8 px-3.5 rounded-md border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {/* Review content (FLOW-MANAGE_REV-05: the full text) */}
                  <div className="space-y-1.5">
                    {selected.title && <h2 className="text-base font-bold text-slate-900">{selected.title}</h2>}
                    <p className="text-sm text-slate-600 leading-relaxed">{selected.comment}</p>
                  </div>

                  {/* Reviewer + order context (FLOW-MANAGE_REV-02) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                    <div className="flex items-center gap-2.5 sm:col-span-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 bg-slate-200 text-slate-600">
                        {selected.reviewerInitials}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">{selected.reviewer}</span>
                        {selected.verifiedPurchase !== false && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                            Verified Purchase
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-slate-400">Order</p>
                      <p className="text-xs font-semibold text-slate-800 mt-0.5">{selected.orderId || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-slate-400">Status</p>
                      <p className="text-xs font-semibold text-slate-800 mt-0.5 capitalize">{selected.status}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
