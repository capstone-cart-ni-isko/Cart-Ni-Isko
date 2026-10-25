export default function SkeletonBlock({ className = '', style }) {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-slate-700 ${className}`}
      style={style}
      aria-hidden="true"
    />
  )
}