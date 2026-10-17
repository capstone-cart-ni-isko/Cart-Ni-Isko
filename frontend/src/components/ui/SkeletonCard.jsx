/**
 * A skeleton placeholder card that matches the product catalog card shape.
 * Use this while product data is loading to prevent layout shift.
 */
export default function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-slate-200 dark:border-[var(--line)] overflow-hidden animate-pulse" aria-hidden="true">
      <div className="aspect-square w-full bg-slate-200 dark:bg-slate-700" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-5 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  )
}
