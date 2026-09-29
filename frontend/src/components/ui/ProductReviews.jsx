import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import { useToast } from '../../hooks/useToast.js'
import LoginPromptModal from './LoginPromptModal.jsx'
import { CloseIcon } from './Icons.jsx'
import { createReview, fetchProductReviews } from '../../services/reviews.js'

function StarRating({ rating = 0, size = 'sm' }) {
  const sizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
  }
  const cls = sizeClasses[size] || 'text-sm'

  return (
    <div className={`flex items-center gap-0.5 text-amber-400 ${cls}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rating ? 'text-amber-400' : 'text-gray-200'}>
          ★
        </span>
      ))}
    </div>
  )
}

export default function ProductReviews({ product }) {
  const { currentUser } = useAuth()
  const { showToast } = useToast()

  const [reviewsList, setReviewsList] = useState(product.reviews || [])
  const [showWriteModal, setShowWriteModal] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  // Filters & Sorting
  const [starFilter, setStarFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  // New review form state
  const [rating, setRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [authorName, setAuthorName] = useState(currentUser?.nickname || currentUser?.name || '')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const prodId = product.prodId ?? product.id ?? null
  const custId = currentUser?.cust_id ?? currentUser?.id ?? null

  // Refresh reviews on mount or product change
  useEffect(() => {
    if (prodId == null) return undefined
    let alive = true
    fetchProductReviews(prodId).then((res) => {
      if (alive && res.success) {
        setReviewsList(res.items || [])
      }
    })
    return () => {
      alive = false
    }
  }, [prodId])

  // Identify the customer's own review (whether pending, approved, or censored)
  const ownReview = useMemo(() => {
    return reviewsList.find((r) => r.isOwn || (custId && Number(r.custId) === Number(custId))) || null
  }, [reviewsList, custId])

  // Public approved reviews (excluding user's pending review from the public tally)
  const approvedReviews = useMemo(() => {
    return reviewsList.filter((r) => r.status === 'approved' || (!r.status && !r.isOwn))
  }, [reviewsList])

  // Computed summary based on approved reviews (or all if fallback)
  const totalApproved = approvedReviews.length
  const avgRating = totalApproved > 0
    ? (approvedReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / totalApproved).toFixed(1)
    : (product.rating ? Number(product.rating).toFixed(1) : '5.0')

  // Star counts for the breakdown bars
  const starCounts = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    approvedReviews.forEach((r) => {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)))
      counts[star] = (counts[star] || 0) + 1
    })
    return counts
  }, [approvedReviews])

  // Filtered and sorted reviews for display
  const displayedReviews = useMemo(() => {
    let list = [...approvedReviews]

    if (starFilter !== 'all') {
      const targetStar = parseInt(starFilter, 10)
      list = list.filter((r) => Math.round(Number(r.rating) || 0) === targetStar)
    }

    list.sort((a, b) => {
      if (sortBy === 'highest') return (Number(b.rating) || 0) - (Number(a.rating) || 0)
      if (sortBy === 'lowest') return (Number(a.rating) || 0) - (Number(b.rating) || 0)
      // Default: newest
      return (b.ordId || 0) - (a.ordId || 0)
    })

    return list
  }, [approvedReviews, starFilter, sortBy])

  const handleOpenWrite = () => {
    if (!currentUser) {
      setShowLoginModal(true)
      return
    }
    setSubmitError('')
    setShowWriteModal(true)
  }

  const handleSubmitReview = async (e) => {
    e.preventDefault()
    setSubmitError('')

    if (!comment.trim()) {
      showToast('Please enter your review feedback.', 'error')
      return
    }
    if (prodId == null) {
      setSubmitError('This product cannot be reviewed right now.')
      return
    }

    setSubmitting(true)
    try {
      await createReview({
        prod_id: prodId,
        ord_rating: rating,
        ord_review: comment.trim(),
      })

      // Refresh from the server so moderation queue reflects the new review
      const res = await fetchProductReviews(prodId)
      if (res.success) {
        setReviewsList(res.items || [])
      }

      setComment('')
      setShowWriteModal(false)
      showToast('Review submitted! It will appear publicly once verified by staff.', 'success')
    } catch (err) {
      const status = err?.status
      let message = err?.message || 'Unable to submit your review. Please try again.'
      if (status === 403) {
        message = err?.message || 'You can only review products from orders you have completed.'
      } else if (status === 409) {
        message = err?.message || 'You have already reviewed this product.'
      }
      setSubmitError(message)
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div id="product-reviews" className="space-y-6 pt-6 border-t border-gray-100">
      {/* Header & Write Review Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Customer Reviews</h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-orange-100 text-brand-orange">
              {totalApproved} {totalApproved === 1 ? 'review' : 'reviews'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Real feedback from verified Bicol University students & campus buyers
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenWrite}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-orange text-white text-xs font-bold hover:bg-brand-orange-dark active:scale-98 transition-all shadow-xs cursor-pointer shrink-0"
        >
          <span>★</span>
          <span>Write a Review</span>
        </button>
      </div>

      {/* CUSTOMER'S OWN PENDING / CENSORED REVIEW BANNER */}
      {ownReview && ownReview.status === 'pending' && (
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4.5 space-y-2 animate-fade-in shadow-2xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
              <h4 className="text-xs font-bold text-amber-900">Your Review is Pending Staff Moderation</h4>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/60 text-amber-800 uppercase tracking-wide">
              Awaiting Approval
            </span>
          </div>
          <p className="text-xs text-amber-800/90 leading-relaxed">
            Thank you for sharing your thoughts! To protect the community, student reviews are reviewed by campus staff before publishing publicly. Here is your submission preview:
          </p>
          <div className="bg-white/80 border border-amber-100 rounded-xl p-3 space-y-1.5 mt-2">
            <div className="flex items-center justify-between text-xs">
              <StarRating rating={ownReview.rating} size="sm" />
              <span className="text-[11px] text-gray-400">{ownReview.date || 'Just now'}</span>
            </div>
            <p className="text-xs text-gray-700 italic">"{ownReview.comment}"</p>
          </div>
        </div>
      )}

      {ownReview && ownReview.status === 'censored' && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-1.5 animate-fade-in">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-rose-800">Your Review Was Moderated</h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-200/70 text-rose-800">
              Not Approved
            </span>
          </div>
          <p className="text-xs text-rose-700 leading-relaxed">
            Your review did not meet our campus community guidelines and was not approved for public display.
          </p>
        </div>
      )}

      {/* Main Reviews Content */}
      {totalApproved > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Rating Summary & Star Breakdown (4 cols on lg) */}
          <div className="lg:col-span-4 bg-gray-50/80 border border-gray-200/70 rounded-2xl p-5 space-y-5">
            <div className="text-center">
              <div className="text-4xl font-black text-gray-900 tracking-tight">{avgRating}</div>
              <div className="flex items-center justify-center gap-1 my-1.5">
                <StarRating rating={Math.round(Number(avgRating))} size="base" />
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Based on {totalApproved} verified {totalApproved === 1 ? 'review' : 'reviews'}
              </p>
            </div>

            {/* Star Distribution Breakdown */}
            <div className="space-y-2 pt-3 border-t border-gray-200/60 text-xs">
              {[5, 4, 3, 2, 1].map((s) => {
                const count = starCounts[s] || 0
                const pct = totalApproved > 0 ? (count / totalApproved) * 100 : 0
                const isSelected = starFilter === String(s)

                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStarFilter(isSelected ? 'all' : String(s))}
                    className={`w-full flex items-center gap-2.5 p-1 rounded-lg transition-colors text-left cursor-pointer group ${
                      isSelected ? 'bg-orange-100/60 font-bold' : 'hover:bg-gray-100/80'
                    }`}
                  >
                    <span className="w-6 font-bold text-gray-700 flex items-center gap-0.5">
                      {s}<span className="text-amber-400">★</span>
                    </span>
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-orange rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-7 text-right text-gray-500 text-[11px] font-medium">
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Verified student purchases badge */}
            <div className="flex items-center gap-2 text-[11px] text-emerald-800 bg-emerald-50/90 border border-emerald-200/70 px-3 py-2 rounded-xl font-medium">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>100% Verified Campus Purchases</span>
            </div>
          </div>

          {/* RIGHT: Filter bar & Reviews List (8 cols on lg) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Filter Chips & Sort Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-gray-100">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                {['all', '5', '4', '3', '2', '1'].map((val) => {
                  const active = starFilter === val
                  const label = val === 'all' ? 'All' : `${val}★`
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setStarFilter(val)}
                      className={`h-7 px-3 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                        active
                          ? 'bg-brand-orange text-white shadow-2xs'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="h-7 px-2.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 focus:outline-none focus:border-brand-orange cursor-pointer"
                >
                  <option value="newest">Most Recent</option>
                  <option value="highest">Highest Rating</option>
                  <option value="lowest">Lowest Rating</option>
                </select>
              </div>
            </div>

            {/* Reviews List */}
            {displayedReviews.length > 0 ? (
              <div className="space-y-3">
                {displayedReviews.map((rev) => {
                  const isCurrentUsersReview = rev.isOwn || (custId && Number(rev.custId) === Number(custId))
                  const authorLetter = (rev.author || 'V')[0].toUpperCase()

                  return (
                    <div
                      key={rev.id}
                      className={`bg-white border rounded-2xl p-4 transition-all ${
                        isCurrentUsersReview
                          ? 'border-brand-orange/40 bg-orange-50/20 shadow-2xs'
                          : 'border-gray-200/70 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-brand-orange/15 text-brand-orange font-bold text-xs flex items-center justify-center shrink-0">
                            {authorLetter}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-gray-900">{rev.author}</h4>
                              {isCurrentUsersReview && (
                                <span className="text-[10px] font-bold text-brand-orange bg-orange-100 px-1.5 py-0.5 rounded">
                                  Your Review
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                                <span>✓</span> Verified Buyer
                              </span>
                            </div>
                            <span className="text-[11px] text-gray-400 font-medium">
                              Campus Order
                            </span>
                          </div>
                        </div>

                        <span className="text-[11px] text-gray-400 shrink-0">{rev.date}</span>
                      </div>

                      <div className="mb-2">
                        <StarRating rating={rev.rating} size="xs" />
                      </div>

                      <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-normal">
                        "{rev.comment}"
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-gray-50/70 border border-dashed border-gray-200 rounded-2xl p-8 text-center">
                <p className="text-xs text-gray-500 font-medium">
                  No {starFilter}★ reviews found for this product.
                </p>
                <button
                  type="button"
                  onClick={() => setStarFilter('all')}
                  className="mt-2 text-xs font-bold text-brand-orange hover:underline cursor-pointer"
                >
                  Show all reviews
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Empty Reviews State */
        <div className="bg-gray-50/60 border border-dashed border-gray-200 rounded-3xl p-8 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-full bg-orange-100 text-brand-orange flex items-center justify-center mx-auto mb-3 text-lg font-bold">
            ★
          </div>
          <h3 className="text-sm font-bold text-gray-900">No approved reviews yet</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto leading-relaxed">
            Be the first to review this merchandise! Share your sizing, fabric, and fit thoughts with fellow Iskolars.
          </p>
          <button
            type="button"
            onClick={handleOpenWrite}
            className="mt-4 h-8 px-4 rounded-xl bg-brand-orange text-white text-xs font-bold hover:bg-brand-orange-dark active:scale-95 transition-all cursor-pointer shadow-xs"
          >
            Be the First to Review
          </button>
        </div>
      )}

      {/* Write a Review Modal */}
      {showWriteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div
            className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-xl overflow-hidden p-5 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Write a Product Review</h3>
                <p className="text-xs text-gray-500 line-clamp-1">{product.name || 'Campus Merch'}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowWriteModal(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 text-gray-400 hover:text-gray-700 flex items-center justify-center cursor-pointer transition-colors"
              >
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Moderation Note */}
            <div className="my-3 p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl text-[11px] text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <span>🛡️</span>
                <span>Campus Moderation Notice</span>
              </div>
              <p className="text-amber-800/90 leading-normal">
                To maintain authentic and respectful feedback for all Iskolars, new reviews are verified by staff before appearing publicly.
              </p>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-3.5">
              {/* Star Rating Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Overall Rating</label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      className="text-2xl transition-transform hover:scale-115 cursor-pointer p-0.5"
                    >
                      <span
                        className={
                          star <= (hoverRating || rating) ? 'text-amber-400' : 'text-gray-200'
                        }
                      >
                        ★
                      </span>
                    </button>
                  ))}
                  <span className="text-xs font-bold text-gray-600 ml-2">
                    {rating} of 5 Stars
                  </span>
                </div>
              </div>

              {/* Review Comment */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Your Review Comments
                </label>
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share details about the fabric quality, sizing fit, color accuracy, and overall satisfaction..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange outline-none transition-all resize-none"
                  required
                />
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold leading-relaxed">
                  {submitError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWriteModal(false)}
                  className="h-8 px-4 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-8 px-5 rounded-xl bg-brand-orange text-white text-xs font-bold hover:bg-brand-orange-dark active:scale-95 transition-all cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting…' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <LoginPromptModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        message="Sign in to write a verified review for this campus merch."
      />
    </div>
  )
}