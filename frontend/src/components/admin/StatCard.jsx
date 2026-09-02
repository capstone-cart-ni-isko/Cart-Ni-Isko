import React from 'react'

export default function StatCard({
  title,
  value,
  subtitle,
  trend,
  trendPositive = true,
  icon,
  iconBg = 'bg-orange-50 text-brand-orange',
  progressBar = null,
  className = '',
  onClick,
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-5 border border-gray-100/90 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">
            {title}
          </p>
          <p className="text-2xl lg:text-3xl font-black text-gray-900 mt-1 tracking-tight">
            {value}
          </p>
        </div>
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}
          >
            {icon}
          </div>
        )}
      </div>

      {progressBar !== null && (
        <div className="mt-4">
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-brand-orange h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progressBar))}%` }}
            />
          </div>
        </div>
      )}

      {(trend || subtitle) && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          {trend && (
            <span
              className={`font-bold flex items-center gap-0.5 ${
                trendPositive ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={`w-3.5 h-3.5 ${!trendPositive ? 'rotate-180' : ''}`}
              >
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              {trend}
            </span>
          )}
          {subtitle && (
            <span className="text-gray-500 font-medium truncate">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  )
}
