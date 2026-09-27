import KpiCard from './kit/KpiCard.jsx'

/*
  Legacy StatCard API, rendered through the kit KpiCard so Orders and
  Analytics match the dashboard. `iconBg` picks the brand accent (warm
  classes → orange, everything else → blue). Trends measured against an empty
  baseline ("New activity…", "No activity…") are neutral, never a green arrow.
*/
const NEUTRAL_TREND = /(^|\s)(new|no activity|no change|no buyers|none)/i

export default function StatCard({
  title,
  value,
  subtitle,
  trend,
  trendPositive = true,
  tone,
  icon,
  iconBg = '',
  accent,
  progressBar = null,
  className = '',
  onClick,
  active = false,
  hint,
}) {
  const resolvedAccent = accent || (/(orange|amber|rose|red)/.test(iconBg) ? 'orange' : 'blue')
  const resolvedTone = tone || (trend ? (NEUTRAL_TREND.test(trend) ? 'neutral' : trendPositive ? 'up' : 'down') : 'neutral')

  return (
    <div className={`flex flex-col ${className}`}>
      <KpiCard
        label={title}
        value={value}
        subtext={trend || subtitle || ' '}
        tone={resolvedTone}
        icon={icon}
        accent={resolvedAccent}
        onClick={onClick}
        active={active}
        hint={hint}
        footer={
          progressBar !== null ? (
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-isko-blue transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, progressBar))}%` }}
              />
            </div>
          ) : null
        }
      />
    </div>
  )
}
