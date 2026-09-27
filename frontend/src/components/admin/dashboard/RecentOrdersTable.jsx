import { useNavigate } from 'react-router-dom'
import StatusBadge from './StatusBadge.jsx'

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

/*
  Recent orders for the selected range and filter. The header stays pinned
  while the rows scroll inside the card, so the table never pushes the page.
*/
export default function RecentOrdersTable({ orders = [], emptyText = 'No orders in this range yet.' }) {
  const navigate = useNavigate()

  return (
    <div className="h-full overflow-auto [mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)] pb-4">
      <table className="w-full text-left border-collapse min-w-[560px]">
        <thead className="sticky top-0 bg-white z-10">
          <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
            <th className="py-1.5 pr-2 font-semibold">Order</th>
            <th className="py-1.5 pr-2 font-semibold">Customer</th>
            <th className="py-1.5 pr-2 font-semibold">Fulfillment</th>
            <th className="py-1.5 pr-2 font-semibold">Status</th>
            <th className="py-1.5 pr-2 font-semibold text-right">Amount</th>
            <th className="py-1.5 font-semibold text-right">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {orders.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-slate-400">
                {emptyText}
              </td>
            </tr>
          )}
          {orders.map((order) => (
            <tr
              key={order.ordId ?? order.id}
              onClick={() => navigate(`/admin/orders?search=${encodeURIComponent(order.id)}`)}
              className="h-9 hover:bg-slate-50 cursor-pointer"
            >
              <td className="pr-2 font-semibold text-slate-900 whitespace-nowrap">{order.id}</td>
              <td className="pr-2 text-slate-700 truncate max-w-[10rem]">{order.customer}</td>
              <td className="pr-2 text-slate-500 whitespace-nowrap">{order.fulfillment}</td>
              <td className="pr-2">
                <StatusBadge rawStatus={order.rawStatus} label={order.status} />
              </td>
              <td className="pr-2 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                {peso(order.total)}
              </td>
              <td className="text-right text-slate-400 text-[11px] whitespace-nowrap">{order.timeAgo || order.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
