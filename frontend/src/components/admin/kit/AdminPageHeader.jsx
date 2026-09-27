/* The one page header for admin pages: title, one line of context, actions right. */
export default function AdminPageHeader({ title, subtitle, children }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 shrink-0">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">{title}</h1>
        {subtitle && <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">{subtitle}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}
