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
import ScheduleBlockModal from '../../components/admin/ScheduleBlockModal.jsx'
import ScheduleDutyRequests from '../../components/admin/ScheduleDutyRequests.jsx'
import ScheduleWeekGrid from '../../components/admin/ScheduleWeekGrid.jsx'
import ScheduleMonthGrid from '../../components/admin/ScheduleMonthGrid.jsx'
import {
  RosterSection,
  ScheduleHeader,
  ShiftBlocksSection,
  ThresholdBar,
} from '../../components/admin/SchedulePageParts.jsx'
import { empRoleKey } from '../../components/admin/schema.js'
import { logAction } from '../../services/access.js'
import {
  addDays,
  addMonths,
  dayKey,
  fmtLongDate,
  isLockedDay,
  monthStartOf,
  startOfDay,
  weekStartOf,
} from '../../components/admin/scheduleTime.js'

// ── Schedule screen ─────────────────────────────────────────────────────────
/**
 * DOMAIN 7 (EMPLOYEE SCHEDULING).
 *
 * FLOW-EMP_SCHED-01: super admins open this screen at `/admin/schedules`;
 * the Staff tab of the employee portal embeds the very same screen
 * (`embedded`), so every scheduling operation is reachable from there too.
 * With `embedded` the AdminLayout is supplied by the host page instead.
 *
 * The three calendar layouts the SRS asks for all read the same API: the day
 * timeline (FLOW-EMP_SCHED-02), the week grid (FLOW-EMP_SCHED-02) and the
 * month staffing overview (REQ-SS-03). Every write goes through POST/PUT/DELETE
 * /shifts - nothing about a block is kept in component state, so a reload
 * always repaints from the server.
 */
export default function AdminSchedule({ embedded = false }) {
  const { currentAdminUser, isSuperAdmin } = useAdmin() || {}
  const { showToast } = useToast()

  const [viewMode, setViewMode] = useState('Day')
  const [activeFilter, setActiveFilter] = useState('all')
  const [showCovers, setShowCovers] = useState(false)
  const [assignOfficerId, setAssignOfficerId] = useState(null)
  const [editingShift, setEditingShift] = useState(null)
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))

  const dateKey = dayKey(selectedDate)
  const roster = useScheduleRoster()
  const duty = useScheduleShifts(dateKey)
  const slots = useScheduleSlots(dateKey)

  // Rule 38: only super admins (and, as the API allows, admins) preschedule
  // somebody else. Everyone else keeps their own availability half
  // (FLOW-EMP_SCHED-04) and never sees a button that would 403.
  const roleKey = empRoleKey(currentAdminUser)
  const canPreschedule = roleKey === 'SUPER_ADMIN' || roleKey === 'ADMIN'

  const isWeek = viewMode === 'Week'
  const isMonth = viewMode === 'Month'

  // FLOW-EMP_SCHED-02: the Week view positions on the whole week the selected
  // day falls in, so the calendar shows the current AND future weeks.
  const weekStart = useMemo(() => weekStartOf(selectedDate), [selectedDate])
  const monthStart = useMemo(() => monthStartOf(selectedDate), [selectedDate])

  const dateLabel = isMonth
    ? monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : isWeek
      ? `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(
          weekStart,
          6
        ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : fmtLongDate(selectedDate)

  // REQ-SS-02: a past day, or today once the shop has opened, is locked for
  // everybody except a super admin. The server enforces the same rule on the
  // block itself, so this only decides what the UI offers.
  const lockedDay = isLockedDay(selectedDate)
  const canEditAvailability = isSuperAdmin || !lockedDay
  const lockMessage =
    'Availability can no longer be changed for this date (locked after the store opened — REQ-SS-02).'

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
    if (!canPreschedule) {
      showToast('Only admins and super admins can preschedule other employees (rule 38).', 'error')
      return
    }
    if (!canEditAvailability) {
      showToast(lockMessage, 'error')
      return
    }
    setAssignOfficerId(officerId ?? '')
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

  // POST /shifts writes one block per selected employee (REQ-EMP_SCHED-06
  // batch scheduling); the assignee is also marked Available so the block
  // does not read as PENDING REPLACEMENT straight away. The server is what
  // enforces the DOMAIN 7 rules - the 10-minute grid, no overlapping block
  // and the weekly 180-minute minimum - so its message is shown as-is.
  const handleAssign = async (payload) => {
    const ids =
      Array.isArray(payload.emp_ids) && payload.emp_ids.length > 0
        ? payload.emp_ids
        : [payload.emp_id].filter((id) => id !== undefined && id !== null)
    if (ids.length === 0) return

    const scheduled = []
    const failures = []

    for (const empId of ids) {
      const target = roster.officers.find((officer) => String(officer.id) === String(empId))
      const name = target?.name || `employee #${empId}`

      const shiftError = await duty.assign({
        emp_id: empId,
        shift_date: payload.shift_date || dateKey,
        shift_start: payload.shift_start,
        shift_end: payload.shift_end,
      })

      if (shiftError) {
        failures.push(`${name}: ${shiftError}`)
        continue
      }

      await roster.setDuty(empId, true)
      scheduled.push(name)
    }

    if (scheduled.length > 0) {
      recordLog(
        'ASSIGN DUTY',
        `Assigned ${payload.shift_start} - ${payload.shift_end} on ${fmtLongDate(
          selectedDate
        )} to ${scheduled.join(', ')}`
      )
    }

    if (failures.length === 0) {
      setAssignOfficerId(null)
      showToast(
        scheduled.length > 1
          ? `Duty scheduled for ${scheduled.length} employees.`
          : `Duty assigned to ${scheduled[0]}.`,
        'success'
      )
      return
    }

    // A partially saved batch keeps the dialog open, so the employees the
    // server refused can be corrected and retried straight away.
    showToast(
      scheduled.length > 0
        ? `Scheduled ${scheduled.length} of ${ids.length}. ${failures[0]}`
        : failures[0],
      'error'
    )
  }

  // PUT /shifts/{id} — amend a block, including FLOW-EMP_SCHED-04's own
  // unavailable flag. The server owns the 10-minute grid, the overlap rule,
  // the weekly floor and the REQ-SS-02 deadline.
  const handleSaveBlock = async (payload) => {
    if (!editingShift) return

    const error = await duty.amend(editingShift.shift_id, payload)

    // Same contract as the cancel: a refused save keeps the editor open with
    // the server's own message, so the value that was refused can be fixed.
    if (error) {
      showToast(error, 'error')
      return
    }

    setEditingShift(null)

    recordLog(
      payload.unavailable ? 'MARK UNAVAILABLE' : 'AMEND BLOCK',
      `${payload.unavailable ? 'Flagged' : 'Amended'} block #${editingShift.shift_id} (${
        editingShift.employee_name
      }) to ${payload.shift_start} - ${payload.shift_end} on ${payload.shift_date}`
    )
    showToast(
      payload.unavailable
        ? `Block #${editingShift.shift_id} marked unavailable. Super admins were alerted to find a substitute.`
        : `Block #${editingShift.shift_id} updated.`,
      'success'
    )
  }

  // DELETE /shifts/{id}
  const handleCancelShift = async (shift) => {
    const error = await duty.remove(shift.shift_id)

    // A refused cancel keeps the block editor open, so the reason the server
    // gave (the weekly floor, the deadline) can be acted on straight away.
    if (error) {
      showToast(error, 'error')
      return
    }

    setEditingShift(null)

    recordLog(
      'CANCEL SHIFT',
      `Cancelled block #${shift.shift_id} for ${
        shift.employee_name || 'officer'
      } on ${fmtLongDate(selectedDate)}`
    )
    showToast(`Block #${shift.shift_id} cancelled.`, 'success')
  }

  const step = (delta) => {
    if (isMonth) setSelectedDate((date) => addMonths(date, delta))
    else setSelectedDate((date) => addDays(date, isWeek ? delta * 7 : delta))
  }

  const goToday = () => setSelectedDate(startOfDay(new Date()))

  const openDay = (day) => {
    setSelectedDate(startOfDay(day))
    setViewMode('Day')
  }

  const content = (
    <div className="space-y-4">
      <ScheduleHeader
        onOpenCovers={() => setShowCovers(true)}
        coverCount={duty.pendingReplacements.length}
      />

      <ScheduleToolbar
        viewMode={viewMode}
        dateLabel={dateLabel}
        isToday={!isWeek && !isMonth && dateKey === dayKey(new Date())}
        onViewChange={setViewMode}
        onShiftDate={step}
        onToday={goToday}
      />

      {isMonth ? (
        <>
          <ThresholdBar
            slots={slots}
            officers={roster.officers}
            shifts={duty.shifts}
            canEditAvailability={canEditAvailability}
            lockMessage={lockMessage}
          />

          <ScheduleMonthGrid
            monthStart={monthStart}
            officers={roster.officers}
            canEdit={canEditAvailability}
            onPickDay={openDay}
          />
        </>
      ) : isWeek ? (
        <ScheduleWeekGrid
          weekStart={weekStart}
          officers={roster.officers}
          canEdit={canEditAvailability}
          onAssignOfficer={canPreschedule ? () => openAssignModal(null) : null}
          onEditBlock={setEditingShift}
        />
      ) : (
        <>
          <ThresholdBar
            slots={slots}
            officers={roster.officers}
            shifts={duty.shifts}
            canEditAvailability={canEditAvailability}
            lockMessage={lockMessage}
          />

          <ScheduleTimelineGrid
            shifts={duty.shifts}
            officers={roster.officers}
            canEdit={canEditAvailability}
            onShiftClick={setEditingShift}
          />

          <ShiftBlocksSection
            shifts={duty.shifts}
            isLoading={duty.isLoading}
            error={duty.error}
            busyId={duty.busyId}
            onRetry={duty.reload}
            onEdit={setEditingShift}
            onCancel={handleCancelShift}
            canEdit={canEditAvailability}
            totalCount={roster.officers.length}
            activeFilter={activeFilter}
            onDutyCount={roster.onDutyCount}
            offDutyCount={roster.offDutyCount}
            onFilterChange={setActiveFilter}
          />
        </>
      )}

      <RosterSection
        roster={roster}
        canEdit={canEditAvailability}
        filteredOfficers={filteredOfficers}
        shifts={duty.shifts}
        onAssign={(officer) => openAssignModal(officer.id)}
        onEditShift={setEditingShift}
        onToggleDuty={handleToggleDuty}
        canAssign={canPreschedule}
        selfEmpId={currentAdminUser?.emp_id ?? currentAdminUser?.id ?? null}
      />
    </div>
  )

  return (
    <>
      {embedded ? content : <AdminLayout>{content}</AdminLayout>}

      <ScheduleDutyRequests
        isOpen={showCovers}
        requests={duty.pendingReplacements}
        isLoading={duty.isLoadingPending}
        canAssign={canPreschedule}
        onClose={() => setShowCovers(false)}
        onAssignTo={() => {
          setShowCovers(false)
          openAssignModal(null)
        }}
      />

      {assignOfficerId !== null && (
        <ScheduleAssignModal
          key={`${assignOfficerId}-${dateKey}-${viewMode}`}
          officers={roster.officers}
          initialOfficerId={assignOfficerId}
          dateLabel={dateLabel}
          date={dateKey}
          lockMessage={lockMessage}
          isSaving={duty.busyId === 'new'}
          onClose={() => setAssignOfficerId(null)}
          onSubmit={handleAssign}
        />
      )}

      {editingShift && (
        <ScheduleBlockModal
          key={editingShift.shift_id}
          shift={editingShift}
          dateLabel={dateLabel}
          locked={!canEditAvailability}
          lockMessage={lockMessage}
          isSaving={duty.busyId === editingShift.shift_id}
          onClose={() => setEditingShift(null)}
          onSubmit={handleSaveBlock}
          onCancelBlock={handleCancelShift}
        />
      )}
    </>
  )
}
