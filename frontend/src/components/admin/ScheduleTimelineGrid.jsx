const TIME_SLOTS = [
  '7:00 AM',
  '8:00 AM',
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '1:00 PM',
]

export default function ScheduleTimelineGrid({
  officers = [],
  onOpenSlotClick,
  onShiftClick,
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left border-collapse min-w-[720px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <th className="py-2.5 px-3.5 w-44 sticky left-0 bg-slate-50 z-10">
              Student Officers
            </th>
            {TIME_SLOTS.map((time) => (
              <th key={time} className="py-2.5 px-2 text-center min-w-[80px]">
                {time}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {officers.slice(0, 4).map((officer) => (
            <tr key={officer.id} className="hover:bg-slate-50/40 transition-colors">
              {/* Officer Column */}
              <td className="py-2 px-3.5 font-bold text-slate-900 sticky left-0 bg-white z-10 flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${officer.avatarColor}`}
                >
                  {officer.initials}
                </div>
                <span className="truncate">{officer.name}</span>
              </td>

              {/* Timeline Cells */}
              <td colSpan={TIME_SLOTS.length} className="py-1.5 px-2">
                <div className="grid grid-cols-7 gap-1.5 relative min-h-[38px] items-center">
                  {/* Render officer specific schedule blocks */}
                  {officer.name === 'Maria Santos' && (
                    <>
                      <div className="col-start-3 col-span-1 bg-slate-100 text-slate-500 rounded-md p-1.5 text-[11px] font-semibold text-center border border-dashed border-slate-300">
                        In Class
                      </div>
                      <div
                        onClick={() => onShiftClick && onShiftClick(officer, 'Desk Duty')}
                        className="col-start-4 col-span-3 bg-blue-50 text-blue-700 rounded-md p-1.5 text-xs font-semibold border border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors"
                      >
                        <p className="font-bold text-xs">Desk Duty</p>
                        <p className="text-[10px] text-blue-600 font-normal">10:00 AM - 1:00 PM</p>
                      </div>
                    </>
                  )}

                  {officer.name === 'Juan Cruz' && (
                    <div
                      onClick={() => onShiftClick && onShiftClick(officer, 'Event Prep')}
                      className="col-start-7 col-span-1 bg-emerald-50 text-emerald-700 rounded-md p-1.5 text-xs font-semibold border border-emerald-200 hover:bg-emerald-100 cursor-pointer transition-colors"
                    >
                      <p className="font-bold text-xs">Event Prep</p>
                      <p className="text-[10px] text-emerald-600 font-normal">1:00 PM - 4:00 PM</p>
                    </div>
                  )}

                  {officer.name === 'Elena Reyes' && (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenSlotClick && onOpenSlotClick(officer, '9:00 AM - 10:00 AM')}
                        className="col-start-3 col-span-1 border border-dashed border-slate-300 hover:border-brand-orange hover:bg-orange-50/40 text-slate-500 hover:text-brand-orange rounded-md p-1.5 text-[11px] font-semibold text-center transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        + Open Slot
                      </button>
                      <div
                        onClick={() => onShiftClick && onShiftClick(officer, 'On-Call')}
                        className="col-start-4 col-span-2 bg-purple-50 text-purple-700 rounded-md p-1.5 text-xs font-semibold border border-purple-200 hover:bg-purple-100 cursor-pointer transition-colors"
                      >
                        <p className="font-bold text-xs">On-Call</p>
                        <p className="text-[10px] text-purple-600 font-normal">10:00 AM - 12:00 PM</p>
                      </div>
                    </>
                  )}

                  {officer.name === 'Carlos M.' && (
                    <div
                      onClick={() => onShiftClick && onShiftClick(officer, 'Desk Duty')}
                      className="col-start-5 col-span-2 bg-blue-50 text-blue-700 rounded-md p-1.5 text-xs font-semibold border border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors"
                    >
                      <p className="font-bold text-xs">Desk Duty</p>
                      <p className="text-[10px] text-blue-600 font-normal">11:00 AM - 1:00 PM</p>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
