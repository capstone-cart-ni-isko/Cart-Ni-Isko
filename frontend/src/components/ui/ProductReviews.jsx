import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth.js'
import { useToast } from '../../hooks/useToast.js'
import LoginPromptModal from './LoginPromptModal.jsx'

export default function ProductReviews({ product }) {
  const { currentUser } = useAuth()
  const { showToast } = useToast()

  const [reviewsList, setReviewsList] = useState(product.reviews || [])
  const [showWriteModal, setShowWriteModal] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  // New review form state
  const [rating, setRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [authorName, setAuthorName] = useState(currentUser?.name || '')

  const hasReviews = reviewsList.length > 0
  const avgRating = product.rating || (hasReviews ? (reviewsList.reduce((s, r) => s + r.rating, 0) / reviewsList.length).toFixed(1) : 0)
  const totalCount = reviewsList.length

  const handleOpenWrite = () => {
    if (!currentUser) {
      setShowLoginModal(true)
      return
    }
    setShowWriteModal(true)
  }

  const handleSubmitReview = (e) => {
    e.preventDefault()
    if (!comment.trim()) {
      showToast('Please enter your review comments.', 'error')
      return
    }

    const newReview = {
      id: `rev-user-${Date.now()}`,
      author: authorName.trim() || currentUser?.name || 'BU Student',
      rating,
      date: 'Just now',
      variant: 'Verified Student Purchase',
      comment: comment.trim(),
      verified: true,
    }

    setReviewsList([newReview, ...reviewsList])
    setComment('')
    setShowWriteModal(false)
    showToast('Review submitted! Thank you for supporting BU merch.')
  }

  return (
    <div id="product-reviews" className="space-y-6 pt-4">
      {/* Header & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5">
        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
          <span>Customer Reviews</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {totalCount}
          </span>
        </h2>

        <button
          type="button"
          onClick={handleOpenWrite}
          className="w-max text-xs font-bold text-brand-orange hover:underline cursor-pointer flex items-center gap-1"
        >
          <span>View all reviews →</span>
        </button>
      </div>

      {hasReviews ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Rating Summary Card */}
          <div className="bg-gray-50/70 border border-gray-100 rounded-3xl p-5 space-y-4">
            <div className="text-center">
              <span className="text-4xl font-black text-gray-900">{avgRating}</span>
              <div className="flex items-center justify-center gap-1 text-amber-400 my-1 text-base">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span key={star}>★</span>
                ))}
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Based on {totalCount} verified {totalCount === 1 ? 'review' : 'reviews'}
              </p>
            </div>

            {/* Star Distribution */}
            <div className="space-y-1.5 pt-2 border-t border-gray-200/60 text-xs">
              {[5, 4, 3, 2, 1].map((s) => {
                const count = reviewsList.filter((r) => r.rating === s).length
                const pct = totalCount > 0 ? (count / totalCount) * 100 : 0
                return (
                  <div key={s} className="flex items-center gap-2 text-gray-500">
                    <span className="w-5 font-bold text-right">{s}★</span>
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-orange rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-5 text-right font-medium text-gray-400">{count}</span>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl font-medium">
              <span>✓</span>
              <span>Verified student purchases</span>
            </div>
          </div>

          {/* Reviews List */}
          <div className="md:col-span-2 space-y-3.5">
            {reviewsList.map((rev) => (
              <div
                key={rev.id}
                className="bg-white border border-gray-100 rounded-2xl p-4 shadow-2xs hover:border-gray-200 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-orange/10 text-brand-orange font-bold text-xs flex items-center justify-center">
                      {rev.author[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-gray-900">{rev.author}</h4>
                        {rev.verified && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                            Verified Buyer
                          </span>
                        )}
                      </div>
                      {rev.variant && (
                        <span className="text-[10px] text-gray-400 font-medium">
                          {rev.variant}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-400">{rev.date}</span>
                </div>

                <div className="flex text-amber-400 text-xs mb-2">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={i < rev.rating ? 'text-amber-400' : 'text-gray-200'}>
                      ★
                    </span>
                  ))}
                </div>

                <p className="text-xs md:text-sm text-gray-600 leading-relaxed">
                  "{rev.comment}"
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Empty Reviews State (Requirement 7) */
        <div className="bg-gray-50/60 border border-dashed border-gray-200 rounded-3xl p-8 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-full bg-orange-100 text-brand-orange flex items-center justify-center mx-auto mb-3 text-lg font-bold">
            ★
          </div>
          <h3 className="text-sm font-black text-gray-800">No reviews yet</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto leading-relaxed">
            Be the first to review this product and share your fit and styling thoughts with fellow Iskolars!
          </p>
          <button
            type="button"
            onClick={handleOpenWrite}
            className="mt-4 px-5 py-2 rounded-full bg-brand-orange text-white text-xs font-bold hover:bg-brand-orange-dark active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            Be the First to Review
          </button>
        </div>
      )}

      {/* Write a Review Modal */}
      {showWriteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-black text-gray-900">Write a Review</h3>
                <p className="text-xs text-gray-400">{product.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowWriteModal(false)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-4">
              {/* Star Rating Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Rating</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      className="text-2xl transition-transform hover:scale-110 cursor-pointer p-0.5"
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
                  <span className="text-xs font-bold text-gray-500 ml-2">
                    {rating} out of 5 stars
                  </span>
                </div>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Your Name</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="e.g. Alyssa B."
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange outline-none transition-all"
                />
              </div>

              {/* Review Comment */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Your Review</label>
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us about the fabric quality, sizing accuracy, and overall fit..."
                  className="w-full text-xs p-3 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange outline-none transition-all resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWriteModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand-orange text-white text-xs font-bold hover:bg-brand-orange-dark active:scale-95 transition-all shadow-xs cursor-pointer"
                >
                  Submit Review
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
