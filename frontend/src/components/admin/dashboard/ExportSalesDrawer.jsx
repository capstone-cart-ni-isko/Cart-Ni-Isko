import { useEffect, useMemo, useState } from 'react'
import DrawerPanel from '../DrawerPanel.jsx'
import { filterOrdersByRange, summarizeSales, toCsv, downloadText } from '../../../services/dashboard.js'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, peso } from './ui.js'

const RANGES = ['Today', 'Week', 'Month', 'All']
const STATUS_SETS = {
  all: { label: 'All orders', statuses: null },
  completed: { label: 'Completed (claimed)', statuses: ['CLAIMED'] },
  open: { label: 'Open (to process / claim / receive)', statuses: ['TO PROCESS', 'TO CLAIM', 'TO RECEIVE'] },
  lost: { label: 'Cancelled / returned', statuses: ['CANCELLED', 'RETURNED', 'REFUNDED'] },
}

const COLUMNS = [
  { label: 'Order ID', value: (o) => o.id },
  { label: 'Customer', value: (o) => o.customer },
  { label: 'Date', value: (o) => o.createdAt || o.date },
  { label: 'Type', value: (o) => o.type },
  { label: 'Fulfillment', value: (o) => o.fulfillment },
  { label: 'Status', value: (o) => o.status },
  { label: 'Items', value: (o) => (o.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0) },
  { label: 'Total (PHP)', value: (o) => Number(o.total || 0).toFixed(2) },
]

/* Sales export with a live preview of exactly what the file will contain. */
export default function ExportSalesDrawer({ isOpen, onClose, orders = [], initialRange = 'Today' }) {
  const [range, setRange] = useState(initialRange)
  const [statusSet, setStatusSet] = useState('all')

  // Follow the dashboard's range each time the drawer opens
  useEffect(() => {
    if (isOpen) setRange(initialRange)
  }, [isOpen, initialRange])

  const rows = useMemo(() => {
    const inRange = range === 'All' ? orders : filterOrdersByRange(orders, range)
    const statuses = STATUS_SETS[statusSet].statuses
    return statuses ? inRange.filter((o) => statuses.includes(o.rawStatus)) : inRange
  }, [orders, range, statusSet])
  const totals = summarizeSales(rows)

  const handleDownload = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadText(`Tindahan_ni_Isko_Sales_${range}_${stamp}.csv`, toCsv(rows, COLUMNS))
  }

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Export sales (CSV)"
      subtitle="Opens in Excel or Google Sheets"
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>Cancel</button>
          <button type="button" onClick={handleDownload} disabled={rows.length === 0} className={BTN_PRIMARY}>
            Download {rows.length} row{rows.length === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <div>
        <span className={LABEL}>Period</span>
        <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100 rounded-md" role="radiogroup" aria-label="Export period">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              onClick={() => setRange(r)}
              className={`h-8 rounded text-sm font-medium cursor-pointer ${range === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={LABEL} htmlFor="export-status">Orders</label>
        <select id="export-status" className={INPUT} value={statusSet} onChange={(e) => setStatusSet(e.target.value)}>
          {Object.entries(STATUS_SETS).map(([key, set]) => <option key={key} value={key}>{set.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Orders</p>
          <p className="text-lg font-bold tabular-nums">{totals.count}</p>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Gross</p>
          <p className="text-lg font-bold tabular-nums">{peso(totals.gross)}</p>
        </div>
      </div>
      <div>
        <span className={LABEL}>Preview (first 5 rows)</span>
        <ul className="text-xs divide-y divide-slate-100 border border-slate-200 rounded-md">
          {rows.length === 0 && <li className="p-3 text-center text-slate-400">Nothing to export for this selection.</li>}
          {rows.slice(0, 5).map((o) => (
            <li key={o.ordId ?? o.id} className="flex justify-between gap-2 px-2.5 py-1.5">
              <span className="truncate">{o.id} · {o.customer}</span>
              <span className="tabular-nums shrink-0">{peso(o.total)}</span>
            </li>
          ))}
        </ul>
      </div>
    </DrawerPanel>
  )
}
