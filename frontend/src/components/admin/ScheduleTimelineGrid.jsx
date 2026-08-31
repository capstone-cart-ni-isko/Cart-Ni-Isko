import React from 'react'

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
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
      <table className="w-full text-left border-collapse min-w-[760px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">
            <th className="py-3.5 px-5 w-48 sticky left-0 bg-gray-50 z-10">
              Student Officers
            </th>
            {TIME_SLOTS.map((time) => (
              <th key={time} className="py-3.5 px-3 text-center min-w-[90px]">
                {time}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 text-sm">
          {officers.slice(0, 4).map((officer) => (
            <tr key={officer.id} className="hover:bg-gray-50/40 transition-colors">
              {/* Officer Column */}
              <td className="py-4 px-5 font-bold text-gray-900 sticky left-0 bg-white z-10 flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${officer.avatarColor}`}
                >
                  {officer.initials}
                </div>
                <span className="truncate">{officer.name}</span>
              </td>

              {/* Timeline Cells */}
              <td colSpan={TIME_SLOTS.length} className="py-2 px-3">
                <div className="grid grid-cols-7 gap-2 relative min-h-[44px] items-center">
                  {/* Render officer specific schedule blocks */}
                  {officer.name === 'Maria Santos' && (
                    <>
                      <div className="col-start-3 col-span-1 bg-gray-100 text-gray-500 rounded-lg p-2 text-xs font-semibold text-center border border-dashed border-gray-300">
                        In Class
                      </div>
                      <div
                        onClick={() => onShiftClick && onShiftClick(officer, 'Desk Duty')}
                        className="col-start-4 col-span-3 bg-blue-50 text-blue-700 rounded-xl p-2.5 text-xs font-bold border border-blue-200 shadow-2xs hover:bg-blue-100 cursor-pointer transition-colors"
                      >
                        <p className="font-extrabold">Desk Duty</p>
                        <p className="text-[10px] text-blue-600 font-normal">10:00 AM - 1:00 PM</p>
                      </div>
                    </>
                  )}

                  {officer.name === 'Juan Cruz' && (
                    <div
                      onClick={() => onShiftClick && onShiftClick(officer, 'Event Prep')}
                      className="col-start-7 col-span-1 bg-emerald-50 text-emerald-700 rounded-xl p-2 text-xs font-bold border border-emerald-200 shadow-2xs hover:bg-emerald-100 cursor-pointer transition-colors"
                    >
                      <p className="font-extrabold">Event Prep</p>
                      <p className="text-[10px] text-emerald-600 font-normal">1:00 PM - 4:00 PM</p>
                    </div>
                  )}

                  {officer.name === 'Elena Reyes' && (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenSlotClick && onOpenSlotClick(officer, '9:00 AM - 10:00 AM')}
                        className="col-start-3 col-span-1 border-2 border-dashed border-gray-300 hover:border-brand-orange hover:bg-orange-50/40 text-gray-500 hover:text-brand-orange rounded-xl p-2 text-xs font-bold text-center transition-colors flex items-center justify-center gap-1"
                      >
                        + Open Slot
                      </button>
                      <div
                        onClick={() => onShiftClick && onShiftClick(officer, 'On-Call')}
                        className="col-start-4 col-span-2 bg-purple-50 text-purple-700 rounded-xl p-2.5 text-xs font-bold border border-purple-200 shadow-2xs hover:bg-purple-100 cursor-pointer transition-colors"
                      >
                        <p className="font-extrabold">On-Call</p>
                        <p className="text-[10px] text-purple-600 font-normal">10:00 AM - 12:00 PM</p>
                      </div>
                    </>
                  )}

                  {officer.name === 'Carlos M.' && (
                    <div
                      onClick={() => onShiftClick && onShiftClick(officer, 'Desk Duty')}
                      className="col-start-5 col-span-2 bg-blue-50 text-blue-700 rounded-xl p-2.5 text-xs font-bold border border-blue-200 shadow-2xs hover:bg-blue-100 cursor-pointer transition-colors"
                    >
                      <p className="font-extrabold">Desk Duty</p>
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
