import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import { INITIAL_ADMIN_DATA } from '../../data/adminMockData.js'

const REPLY_TEMPLATES = [
  { label: 'Thank you', text: 'Thank you for your feedback! We are glad you enjoyed your purchase.' },
  { label: 'Apology', text: "We're sorry to hear this. Please contact our support team so we can make it right." },
  { label: 'Suggestion noted', text: 'Thanks for the suggestion! We have shared it with our product team.' },
]

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
const MEDIA_OPTIONS = [
  { value: 'all', label: 'All Reviews' },
  { value: 'media', label: 'Has Photos/Videos' },
  { value: 'text', label: 'Text Only' },
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
  if (review.status === 'assigned_support') return { dot: 'bg-rose-500', label: 'Support alert' }
  if (review.status === 'pending' && review.flagged) return { dot: 'bg-rose-500', label: 'Support alert' }
  if (review.status === 'pending') return { dot: 'bg-orange-400', label: 'Pending' }
  if (review.status === 'approved') return { dot: 'bg-emerald-500', label: 'Approved' }
  return { dot: 'bg-slate-400', label: 'Rejected' }
}

// Builds an exact timestamp from the relative "timeAgo" text (mock data has no raw date)
function buildTimestamp(review, now) {
  if (review.postedAt) return review.postedAt
  const text = (review.timeAgo || '').toLowerCase()
  let offset = 0
  const m = text.match(/(\d+)\s*(minute|hour|day)/)
  if (m) {
    const n = parseInt(m[1], 10)
    offset = m[2] === 'minute' ? n * 60000 : m[2] === 'hour' ? n * 3600000 : n * 86400000
  } else if (text.includes('yesterday')) {
    offset = 86400000
  }
  const d = new Date(now - offset)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

function getOrderId(review) {
  if (review.orderId) return review.orderId
  const n = parseInt(String(review.id).replace(/\D/g, ''), 10) || 0
  return `ORD-${9100 + n}`
}

export default function AdminReviews() {
  const {
    adminState = {},
    approveReview,
    rejectReview,
    assignReviewToSupport,
    replyToReview,
  } = useAdmin()

  const [now] = useState(() => Date.now())

  const [statusFilter, setStatusFilter] = useState('pending')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [mediaFilter, setMediaFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [searchQuery, setSearchQuery] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false) // small screens: list -> detail drill-down
  const [checkedIds, setCheckedIds] = useState([])
  const [bulkOpen, setBulkOpen] = useState(false)

  const [replyText, setReplyText] = useState('')
  const [previewSrc, setPreviewSrc] = useState(null)
  const [escalateReview, setEscalateReview] = useState(null)
  const [escalateNote, setEscalateNote] = useState('')

  const reviews = adminState?.reviews || INITIAL_ADMIN_DATA.reviews || []

  const filteredReviews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const list = reviews
      .map((r, index) => ({ r, index }))
      .filter(({ r }) => {
        const matchStatus =
          statusFilter === 'all' ||
          (statusFilter === 'pending' && r.status === 'pending') ||
          (statusFilter === 'approved' && r.status === 'approved') ||
          (statusFilter === 'rejected' && (r.status === 'rejected' || r.status === 'assigned_support'))
        const matchRating = ratingFilter === 'all' || r.rating === parseInt(ratingFilter, 10)
        const hasMedia = (r.photos || []).length > 0
        const matchMedia =
          mediaFilter === 'all' || (mediaFilter === 'media' ? hasMedia : !hasMedia)
        const matchSearch =
          !q ||
          [r.productName, r.reviewer, r.title, r.comment]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q))
        return matchStatus && matchRating && matchMedia && matchSearch
      })

    list.sort((a, b) => {
      if (sortBy === 'oldest') return b.index - a.index
      if (sortBy === 'rating-asc') return a.r.rating - b.r.rating || a.index - b.index
      if (sortBy === 'rating-desc') return b.r.rating - a.r.rating || a.index - b.index
      return a.index - b.index // newest first (data is stored newest first)
    })
    return list.map(({ r }) => r)
  }, [reviews, statusFilter, ratingFilter, mediaFilter, sortBy, searchQuery])

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
    setReplyText('')
  }

  const handleApprove = (review) => {
    approveReview(review.id)
    setDetailOpen(false)
    setReplyText('')
  }

  const handleReject = (review) => {
    rejectReview(review.id)
    setDetailOpen(false)
    setReplyText('')
  }

  const handleBulk = (action) => {
    checkedIds.forEach((id) => (action === 'approve' ? approveReview(id) : rejectReview(id)))
    setCheckedIds([])
    setBulkOpen(false)
  }

  const handleSendReply = (review) => {
    if (!replyText.trim()) return
    replyToReview(review.id, replyText.trim())
    setReplyText('')
  }

  const handleEscalate = (e) => {
    e.preventDefault()
    if (!escalateReview) return
    assignReviewToSupport(escalateReview.id, escalateNote.trim())
    setEscalateReview(null)
    setEscalateNote('')
  }

  return (
    <AdminLayout>
      <div className="space-y-3 animate-fade-in">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Reviews Moderation</h1>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Review customer feedback, respond to inquiries, and escalate quality issues.
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
                    disabled={checkedIds.length === 0}
                    onClick={() => handleBulk('approve')}
                    className="w-full text-left px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                  >
                    Approve selected
                  </button>
                  <button
                    type="button"
                    disabled={checkedIds.length === 0}
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
            <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} className={SELECT_CLASS} aria-label="Rating">
              {RATING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select value={mediaFilter} onChange={(e) => setMediaFilter(e.target.value)} className={SELECT_CLASS} aria-label="Media">
              {MEDIA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
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
              {filteredReviews.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-slate-400 font-medium">
                  No reviews match your filters.
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
                Select a review to inspect it.
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
                      <span className="text-[11px] text-slate-400">{buildTimestamp(selected, now)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={selected.status === 'approved'}
                      onClick={() => handleApprove(selected)}
                      className={`h-8 px-3.5 rounded-md text-xs font-bold transition-colors ${
                        selected.status === 'approved'
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer'
                      }`}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={selected.status === 'rejected'}
                      onClick={() => handleReject(selected)}
                      className={`h-8 px-3.5 rounded-md border text-xs font-semibold transition-colors ${
                        selected.status === 'rejected'
                          ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      Reject
                    </button>
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {/* Support alert banner */}
                  {selected.flagged && selected.status !== 'assigned_support' && (
                    <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
                      <p className="text-xs font-medium text-amber-900">
                        {selected.flagReason || 'Support alert'}: this review reports a possible product or delivery issue.
                      </p>
                      <button
                        type="button"
                        onClick={() => setEscalateReview(selected)}
                        className="h-8 px-3 rounded-md border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 text-xs font-semibold shrink-0 cursor-pointer"
                      >
                        Escalate to Support Ticket
                      </button>
                    </div>
                  )}
                  {selected.status === 'assigned_support' && (
                    <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2.5 text-xs text-slate-700">
                      <span className="font-semibold">Escalated to support.</span>{' '}
                      {selected.supportNote}
                    </div>
                  )}

                  {/* Review content */}
                  <div className="space-y-1.5">
                    <h2 className="text-base font-bold text-slate-900">{selected.title}</h2>
                    <p className="text-sm text-slate-600 leading-relaxed">{selected.comment}</p>
                  </div>

                  {/* Media gallery */}
                  {(selected.photos || []).length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {selected.photos.map((src, i) => (
                        <button
                          key={`${src}-${i}`}
                          type="button"
                          onClick={() => setPreviewSrc(src)}
                          className="aspect-square rounded-md bg-slate-50 border border-slate-200 overflow-hidden cursor-zoom-in"
                        >
                          <img
                            src={getImageUrl(src)}
                            alt={`Review attachment ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Customer + order context */}
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                    <div className="flex items-center gap-2.5 sm:col-span-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          selected.reviewerColor || 'bg-slate-200 text-slate-600'
                        }`}
                      >
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
                      <p className="text-xs font-semibold text-slate-800 mt-0.5">{getOrderId(selected)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-slate-400">Delivery status</p>
                      <p className="text-xs font-semibold text-slate-800 mt-0.5">
                        {selected.deliveryStatus || 'Delivered'}
                      </p>
                    </div>
                  </div>

                  {/* Public reply */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-900">Public reply</h3>
                      <select
                        value=""
                        onChange={(e) => {
                          const tpl = REPLY_TEMPLATES.find((t) => t.label === e.target.value)
                          if (tpl) setReplyText(tpl.text)
                        }}
                        className={SELECT_CLASS}
                        aria-label="Insert template reply"
                      >
                        <option value="">Insert Template Reply</option>
                        {REPLY_TEMPLATES.map((t) => (
                          <option key={t.label} value={t.label}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    {selected.reply && (
                      <div className="bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-600">
                        <span className="block text-[11px] font-medium text-slate-400 mb-0.5">Current reply</span>
                        {selected.reply}
                      </div>
                    )}

                    <textarea
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write a public response..."
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-300 resize-none"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!replyText.trim()}
                        onClick={() => handleSendReply(selected)}
                        className={`h-8 px-4 rounded-md text-xs font-bold transition-colors ${
                          replyText.trim()
                            ? 'bg-brand-orange hover:bg-brand-orange-dark text-white cursor-pointer'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        Send Reply
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Media preview */}
      {previewSrc && (
        <div
          className="fixed inset-0 z-[99999] bg-black/70 flex items-center justify-center p-4 animate-fade-in cursor-zoom-out"
          onClick={() => setPreviewSrc(null)}
        >
          <img
            src={getImageUrl(previewSrc)}
            alt="Review attachment preview"
            className="max-w-full max-h-full rounded-md object-contain"
          />
        </div>
      )}

      {/* Escalate to support */}
      {escalateReview && (
        <div className="fixed inset-0 z-[99999] bg-black/50 flex items-center justify-center p-4 animate-fade-in">
          <form
            onSubmit={handleEscalate}
            className="bg-white rounded-lg border border-slate-200 w-full max-w-sm overflow-hidden animate-scale-in"
          >
            <div className="px-5 py-4 space-y-2">
              <h3 className="text-sm font-bold text-slate-900">Escalate to support ticket</h3>
              <p className="text-xs text-slate-500">
                {escalateReview.productName} · {escalateReview.reviewer}
              </p>
              <textarea
                rows={3}
                value={escalateNote}
                onChange={(e) => setEscalateNote(e.target.value)}
                placeholder="Add a note for the support team (optional)"
                className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-slate-300 resize-none"
              />
            </div>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEscalateReview(null)
                  setEscalateNote('')
                }}
                className="h-8 px-3 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 px-4 rounded-md bg-brand-orange hover:bg-brand-orange-dark text-white text-xs font-bold cursor-pointer"
              >
                Escalate
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminLayout>
  )
}