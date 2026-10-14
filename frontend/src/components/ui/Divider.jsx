/**
 * A simple horizontal divider.
 * Use this to separate content sections.
 */
export default function Divider({ className = '' }) {
  return <hr className={`border-slate-100 dark:border-[var(--line)] ${className}`} />
}
