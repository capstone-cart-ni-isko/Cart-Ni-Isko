import React, { useState, useMemo } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'

function StarIcon({ filled = true, className = 'w-3.5 h-3.5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} ${filled ? 'text-amber-400' : 'text-gray-300'}`}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

import { INITIAL_ADMIN_DATA } from '../../data/adminMockData.js'

export default function AdminReviews() {
  const {
    adminState = {},
    approveReview,
    rejectReview,
    assignReviewToSupport,
    replyToReview,
  } = useAdmin()

  const [activeTab, setActiveTab] = useState('pending') // 'pending' | 'approved' | 'rejected'
  const [selectedStar, setSelectedStar] = useState('all') // 'all' | 5 | 4 | 3 | 2 | 1
  const [sortBy, setSortBy] = useState('newest')
  const [selectedReviewIds, setSelectedReviewIds] = useState([])

  // Reply modal state
  const [replyingReview, setReplyingReview] = useState(null)
  const [replyText, setReplyText] = useState('')

  // Support Assign modal state
  const [supportModalReview, setSupportModalReview] = useState(null)
  const [supportNote, setSupportNote] = useState('')

  const reviews = adminState?.reviews || INITIAL_ADMIN_DATA.reviews || []

  // Tab counts
  const pendingCount = reviews.filter((r) => r.status === 'pending').length
  const approvedCount = reviews.filter((r) => r.status === 'approved').length
  const rejectedCount = reviews.filter((r) => r.status === 'rejected' || r.status === 'assigned_support').length

  // Filter reviews
  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      const matchTab =
        (activeTab === 'pending' && r.status === 'pending') ||
        (activeTab === 'approved' && r.status === 'approved') ||
        (activeTab === 'rejected' && (r.status === 'rejected' || r.status === 'assigned_support'))

      const matchStar =
        selectedStar === 'all' || r.rating === parseInt(selectedStar, 10)

      return matchTab && matchStar
    })
  }, [reviews, activeTab, selectedStar])

  // Bulk actions
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedReviewIds(filteredReviews.map((r) => r.id))
    } else {
      setSelectedReviewIds([])
    }
  }

  const handleBulkApprove = () => {
    selectedReviewIds.forEach((id) => approveReview(id))
    setSelectedReviewIds([])
  }

  const handleBulkReject = () => {
    selectedReviewIds.forEach((id) => rejectReview(id))
    setSelectedReviewIds([])
  }

  // Reply Submit
  const handleReplySubmit = (e) => {
    e.preventDefault()
    if (replyingReview && replyText.trim()) {
      replyToReview(replyingReview.id, replyText.trim())
      setReplyingReview(null)
      setReplyText('')
    }
  }

  // Assign to Support Submit
  const handleSupportSubmit = (e) => {
    e.preventDefault()
    if (supportModalReview) {
      assignReviewToSupport(supportModalReview.id, supportNote.trim())
      setSupportModalReview(null)
      setSupportNote('')
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
            Reviews Moderation
          </h1>
          <p className="text-xs lg:text-sm font-medium text-gray-500 mt-1">
            Review customer feedback, respond to inquiries, and escalate quality issues.
          </p>
        </div>

        {/* Top Control Bar: Tabs & Star Filter Pills */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Status Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('pending')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'pending'
                    ? 'bg-brand-orange text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Pending Moderation ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('approved')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'approved'
                    ? 'bg-brand-orange text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Approved ({approvedCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('rejected')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'rejected'
                    ? 'bg-brand-orange text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Rejected ({rejectedCount})
              </button>
            </div>

            {/* Star Rating Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedStar('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedStar === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {[5, 4, 3, 2, 1].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setSelectedStar(star.toString())}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
                    selectedStar === star.toString()
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{star}</span>
                  <StarIcon filled={true} className={`w-3 h-3 ${selectedStar === star.toString() ? 'text-white' : 'text-amber-500'}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Bulk Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 text-xs">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    filteredReviews.length > 0 &&
                    filteredReviews.every((r) => selectedReviewIds.includes(r.id))
                  }
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                />
                <span>Select All</span>
              </label>

              {selectedReviewIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBulkApprove}
                    className="px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg font-bold transition-colors flex items-center gap-1"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Bulk Approve ({selectedReviewIds.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkReject}
                    className="px-3 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg font-bold transition-colors flex items-center gap-1"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span>Bulk Reject ({selectedReviewIds.length})</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-400 font-semibold">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs font-bold text-gray-700 focus:outline-none"
              >
                <option value="newest">Newest First</option>
                <option value="highest">Highest Rating</option>
                <option value="lowest">Lowest Rating</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Review Grid matching Wireframe */}
        {filteredReviews.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400 font-medium text-xs">
            No reviews found in this moderation bucket.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredReviews.map((review) => {
              const isSelected = selectedReviewIds.includes(review.id)
              const resolvedProductImg = getImageUrl(review.productImage)

              return (
                <div
                  key={review.id}
                  className={`rounded-2xl p-5 border transition-all flex flex-col justify-between space-y-4 ${
                    review.flagged
                      ? 'border-rose-300 bg-rose-50/20 shadow-xs'
                      : isSelected
                      ? 'border-brand-orange bg-orange-50/20 shadow-xs'
                      : 'border-gray-100 bg-white shadow-xs'
                  }`}
                >
                  {/* Card Header (Thumbnail, Title, Rating, Alert Badge) */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isSelected) {
                              setSelectedReviewIds(selectedReviewIds.filter((id) => id !== review.id))
                            } else {
                              setSelectedReviewIds([...selectedReviewIds, review.id])
                            }
                          }}
                          className="rounded border-gray-300 text-brand-orange focus:ring-brand-orange"
                        />
                        <img
                          src={resolvedProductImg}
                          alt={review.productName}
                          className="w-11 h-11 rounded-xl bg-gray-50 object-contain p-1 border border-gray-100 shrink-0"
                        />
                        <div>
                          <h3 className="text-xs font-black text-gray-900 leading-tight">
                            {review.productName}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="flex text-amber-400 gap-0.5">
                              {Array.from({ length: 5 }, (_, i) => (
                                <StarIcon key={i} filled={i < review.rating} className="w-3.5 h-3.5" />
                              ))}
                            </div>
                            <span className="text-[10px] text-gray-400 font-semibold">
                              • {review.timeAgo}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Flagged Customer Support Alert Badge */}
                      {review.flagged && (
                        <span className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-700 px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 border border-rose-200 animate-pulse">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          <span>Customer Support Alert</span>
                        </span>
                      )}
                    </div>

                    {/* Review Body */}
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-gray-900">
                        {review.title}
                      </h4>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {review.comment}
                      </p>
                    </div>

                    {/* Attached Photo Thumbnails if any */}
                    {review.photos && review.photos.length > 0 && (
                      <div className="flex items-center gap-2 pt-1">
                        {review.photos.map((photo, pIdx) => (
                          <img
                            key={pIdx}
                            src={getImageUrl(photo)}
                            alt="Review attachment"
                            className="w-12 h-12 rounded-xl object-cover border border-gray-200"
                          />
                        ))}
                      </div>
                    )}

                    {/* Admin reply if any */}
                    {review.reply && (
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs space-y-1">
                        <p className="text-[10px] font-extrabold uppercase text-brand-orange tracking-wider">
                          Official Admin Response:
                        </p>
                        <p className="text-gray-700 italic">&ldquo;{review.reply}&rdquo;</p>
                      </div>
                    )}

                    {/* Reviewer signature */}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${review.reviewerColor}`}
                      >
                        {review.reviewerInitials}
                      </div>
                      <span className="text-xs font-bold text-gray-800">
                        {review.reviewer}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons Footer */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingReview(review)
                        setReplyText(review.reply || '')
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                        <polyline points="9 17 4 12 9 7" />
                        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                      </svg>
                      <span>Reply</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => rejectReview(review.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        Reject
                      </button>

                      {review.flagged ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSupportModalReview(review)
                            setSupportNote('')
                          }}
                          className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-2xs transition-colors flex items-center gap-1.5"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          <span>Reply &amp; Assign to Support</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => approveReview(review.id)}
                          className="px-4 py-1.5 bg-brand-orange hover:bg-brand-orange-dark text-white rounded-xl text-xs font-black shadow-2xs transition-colors"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Load More Button */}
        <div className="text-center pt-4">
          <button
            type="button"
            className="px-6 py-2.5 bg-white hover:bg-gray-50 text-gray-700 font-bold text-xs rounded-xl border border-gray-200 shadow-2xs transition-colors"
          >
            Load More Reviews
          </button>
        </div>
      </div>

      {/* Reply Modal */}
      {replyingReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-4">
            <h3 className="text-base font-black text-gray-900">
              Reply to {replyingReview.reviewer}
            </h3>
            <div className="p-3 bg-gray-50 rounded-xl text-xs space-y-1">
              <p className="font-bold text-gray-800">{replyingReview.productName}</p>
              <p className="text-gray-500 italic">&ldquo;{replyingReview.comment}&rdquo;</p>
            </div>
            <form onSubmit={handleReplySubmit} className="space-y-3">
              <textarea
                required
                rows={4}
                placeholder="Type your official store response here..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-orange"
              />
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setReplyingReview(null)}
                  className="px-4 py-2 bg-gray-100 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-orange rounded-xl text-xs font-black text-white hover:bg-brand-orange-dark shadow-xs"
                >
                  Send &amp; Approve Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Escalate & Assign to Support Modal */}
      {supportModalReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <h3 className="text-base font-black text-gray-900">
                Customer Support Escalation
              </h3>
            </div>
            <p className="text-xs text-gray-500">
              Escalate review by <strong>{supportModalReview.reviewer}</strong> regarding damaged merchandise or quality defect.
            </p>
            <form onSubmit={handleSupportSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Support Ticket Note / Priority
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Broken bamboo piece during transit. Replacement unit or refund authorized."
                  value={supportNote}
                  onChange={(e) => setSupportNote(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSupportModalReview(null)}
                  className="px-4 py-2 bg-gray-100 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 rounded-xl text-xs font-black text-white hover:bg-rose-700 shadow-xs"
                >
                  Escalate to Tier 2 Support
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
