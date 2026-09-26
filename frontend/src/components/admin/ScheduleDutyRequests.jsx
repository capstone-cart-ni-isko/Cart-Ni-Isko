import DrawerPanel from './DrawerPanel.jsx'

/**
 * Duty Requests drawer.
 *
 * The SRS has no shift-swap requirement and no request endpoint exists, so
 * this drawer only ever renders its empty state. It stays in the page because
 * the header action is part of the staffing workflow officers expect to find.
 */
export default function DutyRequestsDrawer({ isOpen, requests, onClose }) {
  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title={`Duty Requests (${requests.length})`}
      subtitle="Shift swap and cover requests from officers"
    >
      {requests.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">
          No pending duty requests. (Shift-swap requests are not yet exposed by the API.)
        </p>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2.5 text-xs"
            >
              <div className="flex justify-between items-start">
                <h4 className="font-black text-gray-900">{request.officerName}</h4>
                <span className="text-[10px] text-gray-400 font-semibold">{request.time}</span>
              </div>
              <p className="font-bold text-brand-orange">{request.requestedShift}</p>
              <p className="text-gray-600 bg-white p-2.5 rounded-xl border border-gray-200/70">
                &ldquo;{request.reason}&rdquo;
              </p>
            </div>
          ))}
        </div>
      )}
    </DrawerPanel>
  )
}
