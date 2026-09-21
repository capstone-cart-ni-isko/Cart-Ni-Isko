
function PageTitle({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h1 className="text-lg md:text-xl font-bold tracking-tight text-gray-900 leading-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-xs md:text-sm text-gray-500 mt-0.5 leading-snug">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export default PageTitle