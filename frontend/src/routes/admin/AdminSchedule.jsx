import { useMemo, useState } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import { useScheduleRoster } from '../../hooks/useScheduleRoster.js'
import { useScheduleShifts } from '../../hooks/useScheduleShifts.js'
import { useScheduleSlots } from '../../hooks/useScheduleSlots.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import ScheduleToolbar from '../../components/admin/ScheduleToolbar.jsx'
import ScheduleTimelineGrid from '../../components/admin/ScheduleTimelineGrid.jsx'
import ScheduleAssignModal from '../../components/admin/ScheduleAssignModal.jsx'
import ScheduleDutyRequests from '../../components/admin/ScheduleDutyRequests.jsx'
import {
  RosterSection,
  ScheduleHeader,
  ShiftBlocksSection,
  ThresholdBar,
} from '../../components/admin/SchedulePageParts.jsx'
import { logAction } from '../../services/access.js'

// ── Date helpers ───────────────────────────────────────────────────────────
const pad = (value) => String(value).padStart(2, '0')
const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date, count) => {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}
const fmtLongDate = (date) =>
  date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// REQ-SS-02: a past day, or today at/after 7:00 AM, is locked for everyone
// except a super admin. The server enforces the same rule on the block itself.
const isAfterBlockStart = (date) => {
  const now = new Date()
  const isPast = date.getTime() < startOfDay(now).getTime()
  return isPast || (dayKey(date) === dayKey(now) && now.getHours() >= 7)
}

export default function AdminSchedule() {
  const { currentAdminUser, isSuperAdmin } = useAdmin() || {}
  const { showToast } = useToast()

  const [viewMode, setViewMode] = useState('Day')
  const [activeFilter, setActiveFilter] = useState('all')
  const [showDutyRequests, setShowDutyRequests] = useState(false)
  const [assignOfficerId, setAssignOfficerId] = useState(null)
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))

  const dateKey = dayKey(selectedDate)
  const roster = useScheduleRoster()
  const duty = useScheduleShifts(dateKey)
  const slots = useScheduleSlots(dateKey)

  // No duty/shift-swap request endpoint exists yet — the drawer keeps its
  // empty state.
  const dutyRequests = []
  const canEditAvailability = isSuperAdmin || !isAfterBlockStart(selectedDate)
  const lockMessage =
    'Availability can no longer be changed for this date (locked after 7:00 AM — REQ-SS-02).'

  const filteredOfficers = useMemo(
    () =>
      roster.officers.filter((officer) => {
        if (activeFilter === 'available') return officer.available
        if (activeFilter === 'conflict') return !officer.available
        return true
      }),
    [roster.officers, activeFilter]
  )

  const recordLog = (action, description) => {
    logAction({
      user_id: currentAdminUser?.id ?? 0,
      user_type: 'employee',
      action,
      desc: `${description} (by ${currentAdminUser?.name || 'Staff'})`,
    }).catch(() => {})
  }

  const openAssignModal = (officerId) => {
    if (!canEditAvailability) {
      showToast(lockMessage, 'error')
      return
    }
    setAssignOfficerId(officerId ?? roster.officers[0]?.id ?? '')
  }

  // On Duty / Off Duty. A REQ-SS-02 rejection arrives as the API error message.
  const handleToggleDuty = async (officer, inStore) => {
    if (!canEditAvailability) {
      showToast(lockMessage, 'error')
      return
    }

    const error = await roster.setDuty(officer.id, inStore)
    if (error) {
      showToast(error, 'error')
      return
    }

    recordLog(
      inStore ? 'SET IN-STORE' : 'SET OFF-STORE',
      `${inStore ? 'Marked' : 'Unmarked'} ${officer.name} as ${
        inStore ? 'On Duty' : 'Off Duty'
      } for ${fmtLongDate(selectedDate)}`
    )
    showToast(`${officer.name} is now ${inStore ? 'On Duty' : 'Off Duty'}.`, 'success')
  }

  // POST /shifts writes the block; the assignee is also marked Available so
  // the block does not read as PENDING REPLACEMENT straight away.
  const handleAssign = async (payload) => {
    const target = roster.officers.find((officer) => String(officer.id) === String(payload.emp_id))
    const shiftError = await duty.assign({ ...payload, shift_date: dateKey })
    if (shiftError) {
      showToast(shiftError, 'error')
      return
    }

    await roster.setDuty(payload.emp_id, true)
    recordLog(
      'ASSIGN DUTY',
      `Assigned ${payload.shift_type} (${payload.shift_start} - ${payload.shift_end}, ${payload.shift_location}) on ${fmtLongDate(
        selectedDate
      )} to ${target?.name || 'officer'}`
    )
    setAssignOfficerId(null)
    showToast(`Duty assigned to ${target?.name || 'officer'}.`, 'success')
  }

  // DELETE /shifts/{id}
  const handleCancelShift = async (shift) => {
    const error = await duty.remove(shift.shift_id)
    if (error) {
      showToast(error, 'error')
      return
    }

    recordLog(
      'CANCEL SHIFT',
      `Cancelled block #${shift.shift_id} (${shift.shift_type}) for ${
        shift.employee_name || 'officer'
      } on ${fmtLongDate(selectedDate)}`
    )
    showToast(`Block #${shift.shift_id} cancelled.`, 'success')
  }

  return (
    <AdminLayout>
      <div className="space-y-4">
        <ScheduleHeader
          onOpenDutyRequests={() => setShowDutyRequests(true)}
          requestCount={dutyRequests.length}
          onAssign={() => openAssignModal(null)}
        />

        <ScheduleToolbar
          viewMode={viewMode}
          dateLabel={fmtLongDate(selectedDate)}
          isToday={dateKey === dayKey(new Date())}
          onViewChange={setViewMode}
          onShiftDate={(delta) => setSelectedDate((date) => addDays(date, delta))}
        />

        <ThresholdBar
          slots={slots}
          canEditAvailability={canEditAvailability}
          lockMessage={lockMessage}
        />

        <ScheduleTimelineGrid
          shifts={duty.shifts}
          officers={roster.officers}
          onShiftClick={(shift) =>
            showToast(
              `${shift.employee_name} · ${shift.shift_type} (${shift.shift_start} - ${shift.shift_end})`,
              'info'
            )
          }
        />

        <ShiftBlocksSection
          shifts={duty.shifts}
          isLoading={duty.isLoading}
          error={duty.error}
          busyId={duty.busyId}
          onRetry={duty.reload}
          onCancel={handleCancelShift}
          totalCount={roster.officers.length}
          activeFilter={activeFilter}
          onDutyCount={roster.onDutyCount}
          offDutyCount={roster.offDutyCount}
          onFilterChange={setActiveFilter}
        />

        <RosterSection
          roster={roster}
          canEdit={canEditAvailability}
          filteredOfficers={filteredOfficers}
          onAssign={(officer) => openAssignModal(officer.id)}
          onToggleDuty={handleToggleDuty}
        />
      </div>

      <ScheduleDutyRequests
        isOpen={showDutyRequests}
        requests={dutyRequests}
        onClose={() => setShowDutyRequests(false)}
      />

      {assignOfficerId !== null && (
        <ScheduleAssignModal
          key={`${assignOfficerId}-${dateKey}`}
          officers={roster.officers}
          initialOfficerId={assignOfficerId}
          dateLabel={fmtLongDate(selectedDate)}
          isSaving={duty.busyId === 'new'}
          onClose={() => setAssignOfficerId(null)}
          onSubmit={handleAssign}
        />
      )}
    </AdminLayout>
  )
}
