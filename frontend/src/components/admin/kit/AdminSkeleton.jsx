import SkeletonBlock from '../../ui/SkeletonBlock.jsx'

/*
  Shared admin skeletons. Every admin page uses the same panel/border language
  as components/admin/kit/Panel.jsx, so a loading screen has the same rhythm as
  the real content and nothing jumps when the data lands.

  These are presentation-only: pages decide when to show them (first load, no
  rows yet) and swap them for the real section afterwards.
*/

const PANEL =
  'bg-white dark:bg-[var(--surface)] border border-slate-200 dark:border-[var(--line)] rounded-lg'

/** Small toolbar row (search field, filters, buttons). */
export function ToolbarSkeleton({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} aria-hidden="true">
      <SkeletonBlock className="h-9 w-full max-w-xs rounded-md" />
      <SkeletonBlock className="h-9 w-28 rounded-md" />
      <SkeletonBlock className="h-9 w-24 rounded-md" />
      <div className="flex-1" />
      <SkeletonBlock className="h-9 w-28 rounded-md" />
    </div>
  )
}

/** KPI / stat cards (dashboard, analytics, inventory, orders, users). */
export function StatCardsSkeleton({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={`${PANEL} p-4`}>
          <div className="flex items-start justify-between gap-2">
            <SkeletonBlock className="h-3 w-24 rounded" />
            <SkeletonBlock className="h-7 w-7 rounded-md" />
          </div>
          <SkeletonBlock className="mt-4 h-7 w-28 rounded" />
          <SkeletonBlock className="mt-2.5 h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  )
}

/** Table rows for DataTable-shaped screens. */
export function TableSkeleton({ rows = 6, columns = 6, className = '' }) {
  return (
    <div className={`${PANEL} overflow-hidden ${className}`} aria-hidden="true">
      <div className="flex items-center gap-4 border-b border-slate-100 dark:border-[var(--line)] bg-slate-50 dark:bg-[var(--surface-2)] px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonBlock
            key={index}
            className={`h-3 rounded ${index === 0 ? 'w-24' : index === columns - 1 ? 'w-16' : 'flex-1'}`}
          />
        ))}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-[var(--line)]">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, column) => (
              <SkeletonBlock
                key={column}
                className={`h-3.5 rounded ${
                  column === 0 ? 'w-24' : column === columns - 1 ? 'w-16' : 'flex-1'
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Stacked list rows (notifications, access log, reviews queue, pickup/delivery). */
export function ListSkeleton({ rows = 5, avatar = false, action = true, className = '' }) {
  return (
    <div
      className={`${PANEL} divide-y divide-slate-100 dark:divide-[var(--line)] overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 px-4 py-3.5">
          {avatar && <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-3.5 w-2/5 max-w-[220px] rounded" />
            <SkeletonBlock className="h-3 w-4/5 rounded" />
            <SkeletonBlock className="h-3 w-1/3 max-w-[160px] rounded" />
          </div>
          {action && <SkeletonBlock className="h-6 w-16 shrink-0 rounded-full" />}
        </div>
      ))}
    </div>
  )
}

/** Product / POS card grid. */
export function GridSkeleton({ count = 8, columns = 'sm:grid-cols-2 lg:grid-cols-4', className = '' }) {
  return (
    <div className={`grid grid-cols-1 ${columns} gap-3 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={`${PANEL} p-3`}>
          <SkeletonBlock className="aspect-square w-full rounded-md" />
          <SkeletonBlock className="mt-3 h-3.5 w-4/5 rounded" />
          <SkeletonBlock className="mt-2 h-3 w-1/2 rounded" />
          <div className="mt-3 flex items-center justify-between gap-2">
            <SkeletonBlock className="h-4 w-16 rounded" />
            <SkeletonBlock className="h-7 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** A chart / trend panel placeholder. */
export function ChartSkeleton({ className = '', bars = [45, 68, 52, 82, 60, 90, 58, 74] }) {
  return (
    <div className={`${PANEL} p-4 ${className}`} aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <SkeletonBlock className="h-4 w-40 rounded" />
        <SkeletonBlock className="h-7 w-24 rounded-md" />
      </div>
      <div className="mt-5 flex h-44 items-end gap-2">
        {bars.map((height, index) => (
          <SkeletonBlock
            key={index}
            className="flex-1 rounded-t"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4">
        {[0, 1, 2, 3].map((item) => (
          <SkeletonBlock key={item} className="h-3 w-16 rounded" />
        ))}
      </div>
    </div>
  )
}

/** Form / settings pane placeholder (label + field pairs). */
export function FormSkeleton({ sections = 2, fields = 4, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: sections }).map((_, section) => (
        <div key={section} className={`${PANEL} p-4`}>
          <SkeletonBlock className="h-4 w-36 rounded" />
          <SkeletonBlock className="mt-2 h-3 w-2/3 max-w-[320px] rounded" />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: fields }).map((_, field) => (
              <div key={field} className="space-y-2">
                <SkeletonBlock className="h-3 w-24 rounded" />
                <SkeletonBlock className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Detail page (product / order / review detail): media + summary + copy. */
export function DetailSkeleton({ className = '' }) {
  return (
    <div className={`${PANEL} p-4 ${className}`} aria-hidden="true">
      <div className="flex flex-col gap-5 lg:flex-row">
        <SkeletonBlock className="aspect-square w-full max-w-[280px] shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-3">
          <SkeletonBlock className="h-6 w-3/5 rounded" />
          <SkeletonBlock className="h-4 w-2/5 rounded" />
          <SkeletonBlock className="h-7 w-28 rounded" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="space-y-1.5">
                <SkeletonBlock className="h-3 w-16 rounded" />
                <SkeletonBlock className="h-4 w-24 rounded" />
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-2">
            <SkeletonBlock className="h-3 w-full rounded" />
            <SkeletonBlock className="h-3 w-11/12 rounded" />
            <SkeletonBlock className="h-3 w-3/4 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Vertical day/timeline list (appointments, schedule). */
export function TimelineSkeleton({ rows = 5, className = '' }) {
  return (
    <div className={`${PANEL} divide-y divide-slate-100 dark:divide-[var(--line)] ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 px-4 py-4">
          <div className="flex w-14 shrink-0 flex-col items-center gap-1.5">
            <SkeletonBlock className="h-3 w-12 rounded" />
            <SkeletonBlock className="h-6 w-6 rounded-full" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-3.5 w-2/5 max-w-[220px] rounded" />
            <SkeletonBlock className="h-3 w-3/5 rounded" />
            <SkeletonBlock className="h-3 w-1/3 max-w-[160px] rounded" />
          </div>
          <SkeletonBlock className="h-6 w-20 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** Generic first-load content block for pages with a bespoke layout. */
export function PageSkeleton({ stats = 4, rows = 6, columns = 6, chart = false, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} aria-label="Loading content">
      {stats > 0 && <StatCardsSkeleton count={stats} />}
      {chart ? <ChartSkeleton /> : <TableSkeleton rows={rows} columns={columns} />}
    </div>
  )
}
