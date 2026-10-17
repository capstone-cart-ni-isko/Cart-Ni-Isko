export default function SkeletonBlock({ className = '' }) {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-slate-700 ${className}`}
      aria-hidden="true"
    />
  )
}