import DrawerPanel from './DrawerPanel.jsx'
import { fmtTime } from './scheduleTime.js'

/**
 * FLOW-EMP_SCHED-06 / 07 cover queue.
 *
 * Every block the API derived as PENDING REPLACEMENT - its assignee is either
 * logged out of the store or flagged that very block unavailable - leaves the
 * roster short-handed, so its open bookings are already restricted and a super
 * admin has been alerted to find a substitute. This drawer is where that
 * substitute is arranged: it reads GET /shifts?status=PENDING REPLACEMENT and
 * hands the chosen officer back to the assign form.
 *
 * It replaces a dead "Duty Requests" drawer that had no endpoint behind it and
 * only ever rendered its empty state.
 */
export default function ScheduleDutyRequests({
  isOpen,
  requests = [],
  isLoading = false,
  canAssign = true,
  onClose,
  onAssignTo,
}) {
  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title={`Pending Covers (${requests.length})`}
      subtitle="Blocks whose assignee is unavailable — find a substitute (REQ-SS-03)"
    >
      {isLoading ? (
        <p className="text-xs font-semibold text-slate-500 text-center py-8 flex items-center justify-center gap-2">
          <span className="spinner-circle !w-3.5 !h-3.5" /> Loading blocks needing cover…
        </p>
      ) : requests.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">
          No block is short of its assignee. Every duty block is staffed.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((block) => (
            <div
              key={block.shift_id}
              className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-2.5 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 truncate">
                    {block.employee_name || `Employee #${block.emp_id}`}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Block #{block.shift_id} · {block.shift_date}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-amber-700 bg-white border border-amber-200 rounded px-2 py-0.5 shrink-0">
                  {block.status}
                </span>
              </div>

              <p className="font-bold text-brand-orange">
                {fmtTime(block.shift_start)} – {fmtTime(block.shift_end)}
              </p>

              <p className="text-slate-600 bg-white p-2.5 rounded-md border border-slate-200/70">
                {block.unavailable
                  ? 'The employee marked this block unavailable for a class or personal conflict. Super admins have been alerted; find a substitute for the same window.'
                  : 'This employee is logged out of the store, so the block no longer staffs the shop and its bookings are restricted.'}
              </p>

              {canAssign && onAssignTo && (
                <button
                  type="button"
                  onClick={() => onAssignTo(block)}
                  className="w-full py-2 bg-white hover:bg-brand-orange hover:text-white text-slate-700 font-bold text-xs rounded-md border border-slate-200 transition-colors cursor-pointer"
                >
                  Schedule a substitute
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </DrawerPanel>
  )
}
