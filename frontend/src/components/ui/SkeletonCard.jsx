/**
 * A skeleton placeholder card that matches the product catalog card shape.
 * Use this while product data is loading to prevent layout shift.
 */
export default function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[var(--surface)] rounded-xl border border-slate-200 dark:border-[var(--line)] overflow-hidden animate-fade-in" aria-hidden="true">
      <div className="aspect-square w-full skeleton" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 rounded skeleton w-3/4" />
        <div className="h-3 rounded skeleton w-1/2" />
        <div className="h-5 rounded skeleton w-1/3" />
      </div>
    </div>
  )
}
