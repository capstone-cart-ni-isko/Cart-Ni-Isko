import React, { useState } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import ScheduleTimelineGrid from '../../components/admin/ScheduleTimelineGrid.jsx'
import DrawerPanel from '../../components/admin/DrawerPanel.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'

import { INITIAL_ADMIN_DATA } from '../../data/adminMockData.js'

export default function AdminSchedule() {
  const {
    adminState = {},
    assignDutyShift,
    approveDutyRequest,
    rejectDutyRequest,
  } = useAdmin()

  const [viewMode, setViewMode] = useState('Day') // 'Day' | 'Week' | 'Month'
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'available' | 'conflict'
  const [showDutyRequestsDrawer, setShowDutyRequestsDrawer] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)

  // Assign shift modal form state
  const [selectedOfficerId, setSelectedOfficerId] = useState('')
  const [shiftType, setShiftType] = useState('desk_duty')
  const [shiftTime, setShiftTime] = useState('10:00 AM - 1:00 PM')
  const [dutyLocation, setDutyLocation] = useState('Main Campus Org Room')

  const officers = adminState?.officers || INITIAL_ADMIN_DATA.officers || []
  const dutyRequests = adminState?.dutyRequests || INITIAL_ADMIN_DATA.dutyRequests || []

  // Filter officers for bottom grid
  const filteredOfficers = officers.filter((off) => {
    if (activeFilter === 'available') return off.available
    if (activeFilter === 'conflict') return !off.available
    return true
  })

  const handleOpenAssignForOfficer = (off) => {
    setSelectedOfficerId(off.id)
    setShowAssignModal(true)
  }

  const handleAssignSubmit = (e) => {
    e.preventDefault()
    if (!selectedOfficerId) return

    const typeTitle =
      shiftType === 'desk_duty'
        ? 'Desk Duty'
        : shiftType === 'event_prep'
        ? 'Event Prep'
        : shiftType === 'inventory'
        ? 'Inventory Audit'
        : 'POS Cashier'

    assignDutyShift(selectedOfficerId, {
      time: shiftTime,
      type: shiftType,
      title: typeTitle,
      location: dutyLocation,
    })

    setShowAssignModal(false)
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
              Student Officer Duty &amp; Shift Scheduler
            </h1>
            <p className="text-xs lg:text-sm font-medium text-gray-500 mt-1">
              Educational Portal • Student Council Organization Management
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Duty Requests Drawer Trigger */}
            <button
              type="button"
              onClick={() => setShowDutyRequestsDrawer(true)}
              className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-800 font-bold text-xs rounded-xl border border-gray-200 shadow-2xs flex items-center gap-2 transition-colors relative"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-brand-orange">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>Duty Requests</span>
              {dutyRequests.length > 0 && (
                <span className="w-5 h-5 bg-brand-orange text-white text-[10px] font-black rounded-full flex items-center justify-center">
                  {dutyRequests.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedOfficerId(officers[0]?.id || '')
                setShowAssignModal(true)
              }}
              className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Assign Duty</span>
            </button>
          </div>
        </div>

        {/* View Mode & Date Navigator Bar */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Day / Week / Month toggle */}
          <div className="flex bg-gray-100 p-1 rounded-xl">
            {['Day', 'Week', 'Month'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setViewMode(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === tab
                    ? 'bg-brand-orange text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Date Navigator */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="px-3 py-1 bg-gray-50 rounded-lg text-xs font-black text-gray-900 border border-gray-200">
              Today: August 22, 2026
            </span>
            <button
              type="button"
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Section 1: Timeline Grid */}
        <div className="space-y-2">
          <ScheduleTimelineGrid
            officers={officers}
            onOpenSlotClick={(off, time) => {
              setSelectedOfficerId(off.id)
              setShiftTime(time)
              setShowAssignModal(true)
            }}
            onShiftClick={(off, title) => {
              alert(`${off.name} is scheduled for: ${title}`)
            }}
          />
        </div>

        {/* Section 2: Officer Schedules & Free Windows */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-gray-900">
                Officer Schedules &amp; Free Windows
              </h2>
              <p className="text-xs text-gray-400 font-medium mt-0.5">
                Manage availability and assign shifts based on class schedules
              </p>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All ({officers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('available')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  activeFilter === 'available'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Available Today (6)
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('conflict')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  activeFilter === 'conflict'
                    ? 'bg-rose-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Class Conflict (2)
              </button>
            </div>
          </div>

          {/* Officer Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredOfficers.map((off) => (
              <div
                key={off.id}
                className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-sm hover:border-gray-200 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${off.avatarColor}`}
                  >
                    {off.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 text-xs truncate">
                      {off.name}
                    </p>
                    <p className="text-[10px] text-gray-500 font-semibold truncate">
                      Student Officer
                    </p>
                  </div>
                </div>

                <div className="py-1">
                  <StatusPill status={off.availability} />
                </div>

                <div>
                  {off.available ? (
                    <button
                      type="button"
                      onClick={() => handleOpenAssignForOfficer(off)}
                      className="w-full py-2 bg-white hover:bg-brand-orange hover:text-white text-gray-700 font-bold text-xs rounded-xl border border-gray-200 shadow-2xs transition-all"
                    >
                      + Assign Shift
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2 bg-gray-100 text-gray-400 font-bold text-xs rounded-xl cursor-not-allowed"
                    >
                      Unavailable
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Duty Requests Sliding Drawer */}
      <DrawerPanel
        isOpen={showDutyRequestsDrawer}
        onClose={() => setShowDutyRequestsDrawer(false)}
        title={`Duty Requests (${dutyRequests.length})`}
        subtitle="Shift swap and cover requests from officers"
      >
        <div className="space-y-4">
          {dutyRequests.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">
              No pending duty requests.
            </p>
          ) : (
            dutyRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2.5 text-xs"
              >
                <div className="flex justify-between items-start">
                  <h4 className="font-black text-gray-900">{req.officerName}</h4>
                  <span className="text-[10px] text-gray-400 font-semibold">{req.time}</span>
                </div>
                <p className="font-bold text-brand-orange">{req.requestedShift}</p>
                <p className="text-gray-600 bg-white p-2.5 rounded-xl border border-gray-200/70">
                  &ldquo;{req.reason}&rdquo;
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => rejectDutyRequest(req.id)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => approveDutyRequest(req.id)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-2xs"
                  >
                    Approve Shift
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </DrawerPanel>

      {/* Assign Duty Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-4">
            <h3 className="text-base font-black text-gray-900">Assign Officer Duty</h3>
            <form onSubmit={handleAssignSubmit} className="space-y-3.5 text-xs font-medium">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Officer</label>
                <select
                  value={selectedOfficerId}
                  onChange={(e) => setSelectedOfficerId(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                >
                  {officers.map((off) => (
                    <option key={off.id} value={off.id}>
                      {off.name} ({off.availability})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Duty Type</label>
                <select
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                >
                  <option value="desk_duty">Desk Duty (Main Counter)</option>
                  <option value="event_prep">Event Prep (Merch Distribution)</option>
                  <option value="inventory">Inventory Audit (Org Stockroom)</option>
                  <option value="cashier">POS Cashier (In-Store)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Time Slot</label>
                <input
                  type="text"
                  value={shiftTime}
                  onChange={(e) => setShiftTime(e.target.value)}
                  placeholder="e.g. 10:00 AM - 1:00 PM"
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Room / Location</label>
                <input
                  type="text"
                  value={dutyLocation}
                  onChange={(e) => setDutyLocation(e.target.value)}
                  placeholder="e.g. Main Campus USC Org Room"
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 bg-gray-100 rounded-xl font-bold text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-orange rounded-xl font-black text-white hover:bg-brand-orange-dark shadow-xs"
                >
                  Assign Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
