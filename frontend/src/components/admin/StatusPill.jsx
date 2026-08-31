import React from 'react'

/**
 * Semantic status pill used across all Admin tables and cards
 * Matches the status pill pattern (bg-100/text-700 pairs):
 * Blue = In-Progress / Pre-order / In Production / Preparing / Online
 * Green = Success / Ready / Completed / Claimed / Published
 * Amber = Pending / Warning / Awaiting Production / Packing
 * Red = Failed / Delayed / SLA Breach / Customer Support Alert / Cancelled
 * Purple / Gray = Other states / Draft / In Class / Courier
 */
export default function StatusPill({ status, variant, className = '' }) {
  if (!status) return null

  const norm = String(status).toLowerCase().trim()

  let style = 'bg-gray-100 text-gray-700 border-gray-200'

  if (variant) {
    if (variant === 'blue') style = 'bg-blue-50 text-blue-700 border-blue-200'
    else if (variant === 'green') style = 'bg-emerald-50 text-emerald-700 border-emerald-200'
    else if (variant === 'amber') style = 'bg-amber-50 text-amber-700 border-amber-200'
    else if (variant === 'red') style = 'bg-rose-50 text-rose-700 border-rose-200'
    else if (variant === 'purple') style = 'bg-purple-50 text-purple-700 border-purple-200'
    else if (variant === 'cyan') style = 'bg-cyan-50 text-cyan-700 border-cyan-200'
  } else {
    if (
      norm.includes('completed') ||
      norm.includes('claimed') ||
      norm.includes('ready') ||
      norm.includes('published') ||
      norm.includes('approved') ||
      norm.includes('available') ||
      norm === 'on duty'
    ) {
      style = 'bg-emerald-50 text-emerald-700 border-emerald-200'
    } else if (
      norm.includes('in production') ||
      norm.includes('preparing') ||
      norm.includes('in transit') ||
      norm.includes('desk duty') ||
      norm.includes('online regular') ||
      norm.includes('campus pickup')
    ) {
      style = 'bg-blue-50 text-blue-700 border-blue-200'
    } else if (
      norm.includes('pending') ||
      norm.includes('awaiting') ||
      norm.includes('packing') ||
      norm.includes('pre-order') ||
      norm.includes('warning') ||
      norm.includes('up next') ||
      norm.includes('low stock')
    ) {
      style = 'bg-amber-50 text-amber-700 border-amber-200'
    } else if (
      norm.includes('failed') ||
      norm.includes('delayed') ||
      norm.includes('cancelled') ||
      norm.includes('alert') ||
      norm.includes('rejected') ||
      norm.includes('conflict') ||
      norm.includes('danger')
    ) {
      style = 'bg-rose-50 text-rose-700 border-rose-200'
    } else if (
      norm.includes('ready for dispatch') ||
      norm.includes('on-call') ||
      norm.includes('assigned')
    ) {
      style = 'bg-purple-50 text-purple-700 border-purple-200'
    } else if (norm.includes('draft') || norm.includes('in class') || norm.includes('unavailable') || norm.includes('busy')) {
      style = 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
      <span className="capitalize">{status}</span>
    </span>
  )
}
