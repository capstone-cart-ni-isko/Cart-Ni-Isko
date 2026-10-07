<?php

namespace App\Http\Controllers;

use App\Models\Schedule;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

// Duty shift blocks (REQ-SS-01 / REQ-SS-02 / REQ-SS-03).
//
// DOMAIN 7 stores duty blocks in `schedules`, which is the table the schema
// ships with - `duty_shift` was retired along with its model. The HTTP
// contract is unchanged (the schedule UI is written against it), so this
// controller translates: a block is one row, `sched_time_start`/`sched_time_end`
// carry the window, and `shift_date`/`shift_start`/`shift_end` are derived from
// them on the way out and folded back in on the way down.
//
// The `schedules` columns are fixed by the schema, so two request fields have
// nowhere to live: `shift_type` and `shift_location`. They stay valid input -
// existing clients keep sending them - but they are echoed as null rather than
// silently accepted, so a caller can tell they were not stored. Nothing in
// DOMAIN 7 requires them: FLOW-EMP_SCHED-03 schedules on start and end times.
//
// `schedules` has no status column, so every status below is derived at read
// time and never written.
class ShiftAPI extends Controller
{
    // Fields a staff member may submit through the schedule UI
    const SHIFT_FIELDS = ['emp_id', 'shift_date', 'shift_start', 'shift_end'];

    /*
        Listing duty shifts
        ----------
        QUERY PARAMS (all optional)
        emp_id, date, date_from, date_to, status
    */
    public function displayShifts(Request $json)
    {
        $shifts = $this->filteredShifts($json)
            ->with('employee')
            ->get()
            ->map(fn (Schedule $shift) => $this->shiftPayload($shift));

        // The status is derived rather than stored, so it is filtered after
        // the rows are mapped. Unknown values simply return nothing.
        $status = strtoupper((string) $json->query('status'));
        if ($status !== '') {
            $shifts = $shifts->where('status', $status)->values();
        }

        return response()->json([
            'success' => true,
            'message' => 'Duty shifts retrieved successfully',
            'data'    => $shifts,
        ], 200);
    }

    /*
        Creating a duty shift
        ----------
        JSON REQUEST
        emp_id, shift_date, shift_start, shift_end (req)
        shift_type, shift_location, status (opt)
    */
    public function createShift(Request $json)
    {
        $validator = (new InputValidatorAPI())->createShift($json);
        if ($validator) return $validator;

        try {
            $shift = Schedule::create([
                'emp_id'         => (int) $json->input('emp_id'),
                'sched_time_start' => $this->windowStart($json),
                'sched_time_end'   => $this->windowEnd($json),
                'sched_created'  => now(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Duty shift created successfully',
                'data'    => $this->shiftPayload($shift->load('employee')),
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create duty shift',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Updating a duty shift
        ----------
        JSON REQUEST (route supplies the shift id)
        any of emp_id, shift_date, shift_start, shift_end, emp_instore
    */
    public function updateShift(Request $json, $shiftId)
    {
        $shift = Schedule::with('employee')->find($shiftId);
        if (! $shift) {
            return response()->json(['success' => false, 'message' => 'Duty shift not found'], 404);
        }

        // The stored block is needed so a partial update is still checked
        // against the window it will end up with.
        $validator = (new InputValidatorAPI())->updateShift($json, $shift);
        if ($validator) return $validator;

        try {
            // Availability is a separate change from the block fields: it is
            // gated by REQ-SS-02 and cross-referenced against open bookings by
            // REQ-SS-03.
            if ($json->has('emp_instore')) {
                $blocked = $this->availabilityDeadlineBlocked($json, (int) $shift->emp_id);
                if ($blocked) return $blocked;
                $this->changeAvailability($shift, $json->boolean('emp_instore'));
            }

            if ($json->has('emp_id')) $shift->emp_id = (int) $json->input('emp_id');

            // The window is one value pair, so a partial update is applied
            // onto the stored one instead of overwriting half of it.
            $start = $this->windowStart($json, $shift);
            $end   = $this->windowEnd($json, $shift);
            if ($start !== null) $shift->sched_time_start = $start;
            if ($end !== null) $shift->sched_time_end = $end;

            $shift->save();

            return response()->json([
                'success' => true,
                'message' => 'Duty shift updated successfully',
                'data'    => $this->shiftPayload($shift->fresh('employee')),
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update duty shift',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Cancelling a duty shift
        ----------
        No JSON body needed; the row is removed from schedules
    */
    public function cancelShift(Request $json, $shiftId)
    {
        $shift = Schedule::with('employee')->find($shiftId);
        if (! $shift) {
            return response()->json(['success' => false, 'message' => 'Duty shift not found'], 404);
        }

        $cancelled = $this->shiftPayload($shift);
        $shift->delete();

        return response()->json([
            'success' => true,
            'message' => 'Duty shift cancelled successfully',
            'data'    => $cancelled,
        ], 200);
    }

    // ==========================================
    // SHIFT HELPERS
    // ==========================================

    // `shift_date` + `shift_start` arrive as two fields and are stored as one
    // timestamp, so they are only meaningful together: a request that supplies
    // neither leaves the stored start untouched.
    private function windowStart(Request $json, ?Schedule $shift = null)
    {
        if ($json->has('shift_date') && $json->has('shift_start')) {
            return Carbon::parse($json->input('shift_date') . ' ' . $json->input('shift_start'));
        }
        if ($json->has('shift_date') && $shift) {
            return Carbon::parse($json->input('shift_date') . ' ' . $shift->sched_time_start->format('H:i'));
        }
        if ($json->has('shift_start') && $shift) {
            return Carbon::parse($shift->sched_time_start->toDateString() . ' ' . $json->input('shift_start'));
        }

        return null;
    }

    // On create there is no stored window to fall back on, so the end always
    // comes from the request; on update it resolves against the stored block.
    private function windowEnd(Request $json, ?Schedule $shift = null)
    {
        if ($json->has('shift_end')) {
            $date = $json->input('shift_date')
                ?: ($shift && $shift->sched_time_end
                    ? $shift->sched_time_end->toDateString()
                    : optional($shift->sched_time_start)->toDateString());
            if ($date !== null) {
                return Carbon::parse($date . ' ' . $json->input('shift_end'));
            }
        }

        return $shift ? $shift->sched_time_end : null;
    }

    // Builds the shift query, applying the optional list filters. Every date
    // filter resolves against the block's start, which is what the calendar
    // positions on.
    private function filteredShifts(Request $json)
    {
        $query = Schedule::query();
        $employeeId = $json->query('emp_id');
        $date = $json->query('date');
        $dateFrom = $json->query('date_from');
        $dateTo = $json->query('date_to');

        if ($employeeId !== null) $query->where('emp_id', (int) $employeeId);
        if ($date !== null) $query->whereDate('sched_time_start', $date);
        if ($dateFrom !== null) $query->whereDate('sched_time_start', '>=', $dateFrom);
        if ($dateTo !== null) $query->whereDate('sched_time_start', '<=', $dateTo);

        return $query->orderBy('sched_time_start')->orderBy('sched_id');
    }

    // Complete shift metadata for every API response: block id, employee,
    // block window, derived status and timestamps
    private function shiftPayload(Schedule $shift): array
    {
        $employee = $shift->employee;
        $start = $shift->sched_time_start;
        $end = $shift->sched_time_end;

        return [
            'shift_id'       => (int) $shift->sched_id,
            'emp_id'         => (int) $shift->emp_id,
            'employee_name'  => $employee
                ? trim($employee->emp_givname . ' ' . $employee->emp_surname)
                : null,
            'shift_date'     => $start ? $start->toDateString() : null,
            'shift_start'    => $start ? $start->format('H:i') : null,
            'shift_end'      => $end ? $end->format('H:i') : null,
            // No column to store these on; see the class note above.
            'shift_type'     => null,
            'shift_location' => null,
            'status'         => $this->shiftStatus($shift),
            'shift_created'  => optional($shift->sched_created)->toDateTimeString(),
            'created_by'     => null,
        ];
    }

    // `schedules` has no status column, so the status is derived from the
    // assignee's availability and the block window relative to now.
    // REQ-SS-03: an employee who is no longer available leaves the block
    // PENDING REPLACEMENT; slotState() already treats that employee as absent.
    private function shiftStatus(Schedule $shift): string
    {
        if ($shift->employee === null || ! $shift->employee->emp_instore) {
            return 'PENDING REPLACEMENT';
        }

        if (! $shift->sched_time_start || ! $shift->sched_time_end) {
            return 'SCHEDULED';
        }

        if (now()->between($shift->sched_time_start, $shift->sched_time_end)) return 'ACTIVE';
        if (now()->greaterThan($shift->sched_time_end)) return 'COMPLETED';

        return 'SCHEDULED';
    }

    // REQ-SS-03: flipping an employee to unavailable makes every still-open
    // booking of that type unworkable, so the affected blocks read as
    // PENDING REPLACEMENT and super admins are alerted. Flipping back to
    // available clears the need and leaves the bookings untouched.
    private function changeAvailability(Schedule $shift, bool $inStore): void
    {
        $employee = $shift->employee;
        if ($employee === null || (bool) $employee->emp_instore === $inStore) return;

        $employee->update(['emp_instore' => $inStore]);

        if ($inStore) return;

        $this->notifyStaffShortage();
        $this->markPendingReplacement($shift);
    }

    // Raises the super admin alert for a block that lost its assignee, naming
    // the block, the employee and the exact time the alert was raised
    private function markPendingReplacement(Schedule $shift): void
    {
        $employee = $shift->employee;
        $employeeName = trim($employee->emp_givname . ' ' . $employee->emp_surname);

        $window = ($shift->sched_time_start ? $shift->sched_time_start->toDateString() : '?')
            . ' (' . optional($shift->sched_time_start)->format('H:i')
            . ' - ' . optional($shift->sched_time_end)->format('H:i') . ')';

        $this->notifyEmployeesByType(
            ['SUPER ADMIN'],
            '[PRIORITY] Shift block #' . $shift->sched_id . ' assigned to ' . $employeeName
            . ' on ' . $window
            . ' is now PENDING REPLACEMENT as of ' . now()->toDateTimeString() . '.'
        );
    }
}
