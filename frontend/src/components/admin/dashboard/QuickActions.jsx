/*
  Four equal quick actions. Each opens an in-page drawer so the task finishes
  without leaving the dashboard. The primary action (POS) is the only filled
  button; the register is hidden from STAFF, matching the /admin/pos guard.
*/
const ACTIONS = [
  {
    key: 'pos',
    label: 'New POS order',
    primary: true,
    adminOnly: true,
    icon: <path d="M12 5v14M5 12h14" />,
  },
  {
    key: 'restock',
    label: 'Restock',
    adminOnly: true,
    icon: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      </>
    ),
  },
  {
    key: 'product',
    label: 'Add product',
    adminOnly: true,
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
  },
  {
    key: 'export',
    label: 'Export CSV',
    icon: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>
    ),
  },
]

export default function QuickActions({ isAdmin = false, onOpen }) {
  const visible = ACTIONS.filter((action) => isAdmin || !action.adminOnly)
  return (
    <div className="grid grid-cols-2 gap-2">
      {visible.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={() => onOpen(action.key)}
          className={`h-14 rounded-md flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isko-orange ${
            action.primary
              ? 'bg-isko-orange hover:bg-isko-orange-dark text-white'
              : 'bg-white hover:bg-isko-blue/5 hover:border-isko-blue/40 border border-slate-200 text-slate-700'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-4 h-4 ${action.primary ? '' : 'text-isko-blue'}`}
            aria-hidden="true"
          >
            {action.icon}
          </svg>
          {action.label}
        </button>
      ))}
    </div>
  )
}
