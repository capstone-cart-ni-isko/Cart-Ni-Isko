export default function StatCard({
  title,
  value,
  subtitle,
  trend,
  trendPositive = true,
  icon,
  iconBg = 'bg-slate-100 text-slate-600',
  progressBar = null,
  className = '',
  onClick,
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg p-3.5 border border-slate-200 hover:border-slate-300 transition-all flex flex-col justify-between ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-slate-500">{title}</p>
          <p className="text-xl font-bold text-slate-900 tracking-tight">{value}</p>
        </div>
        {icon && (
          <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </div>
        )}
      </div>

      {progressBar !== null && (
        <div className="mt-3">
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#FF6B00] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, progressBar))}%` }}
            />
          </div>
        </div>
      )}

      {(trend || subtitle) && (
        <div className="mt-2.5 pt-0.5 flex items-center gap-1.5 text-xs">
          {trend && (
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                trendPositive ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className={`w-3 h-3 ${!trendPositive ? 'rotate-180' : ''}`}
              >
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              {trend}
            </span>
          )}
          {subtitle && <span className="text-slate-500 font-normal truncate">{subtitle}</span>}
        </div>
      )}
    </div>
  )
}