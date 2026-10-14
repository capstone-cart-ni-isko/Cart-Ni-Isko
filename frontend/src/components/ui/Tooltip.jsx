/**
 * A simple CSS-only tooltip wrapper.
 * Use this for icon buttons and other elements that need hover hints.
 */
export default function Tooltip({ label, children, position = 'bottom' }) {
  const positions = {
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  }
  return (
    <span className="relative inline-flex group">
      {children}
      <span className={`pointer-events-none absolute ${positions[position]} px-2 py-1 bg-slate-800 dark:bg-[var(--surface-4)] text-white text-[11px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap z-50`}>
        {label}
      </span>
    </span>
  )
}
