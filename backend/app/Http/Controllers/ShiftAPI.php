<?php

namespace App\Http\Controllers;

use App\Models\DutyShift;
use Illuminate\Http\Request;

// Duty shift blocks (REQ-SS-01 / REQ-SS-02 / REQ-SS-03).
// The duty_shift table has no status column (schema kept as-is per G6a), so
// every status in this API is derived at read time and never written.
class ShiftAPI extends Controller
{
    // Fields a staff member may submit through the schedule UI
    const SHIFT_FIELDS = ['emp_id', 'shift_date', 'shift_start', 'shift_end', 'shift_type', 'shift_location'];

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
            ->map(fn (DutyShift $shift) => $this->shiftPayload($shift));

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
            $shift = DutyShift::create([
                'emp_id'         => (int) $json->input('emp_id'),
                'shift_date'     => $json->input('shift_date'),
                'shift_start'    => $json->input('shift_start'),
                'shift_end'      => $json->input('shift_end'),
                'shift_type'     => $json->input('shift_type', 'DESK DUTY'),
                'shift_location' => $json->input('shift_location'),
                'shift_created'  => now(),
                'created_by'     => optional($json->user('sanctum'))->getKey(),
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
        any of emp_id, shift_date, shift_start, shift_end, shift_type,
        shift_location, emp_instore
    */
    public function updateShift(Request $json, $shiftId)
    {
        $shift = DutyShift::with('employee')->find($shiftId);
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

            foreach (self::SHIFT_FIELDS as $field) {
                if ($json->has($field)) $shift->{$field} = $json->input($field);
            }
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
        No JSON body needed; the shift is removed from duty_shift
    */
    public function cancelShift(Request $json, $shiftId)
    {
        $shift = DutyShift::with('employee')->find($shiftId);
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

    // Builds the shift query, applying the optional list filters. The
    // (shift_date, emp_id) index serves every filter below.
    private function filteredShifts(Request $json)
    {
        $query = DutyShift::query();
        $employeeId = $json->query('emp_id');
        $date = $json->query('date');
        $dateFrom = $json->query('date_from');
        $dateTo = $json->query('date_to');

        if ($employeeId !== null) $query->where('emp_id', (int) $employeeId);
        if ($date !== null) $query->where('shift_date', $date);
        if ($dateFrom !== null) $query->where('shift_date', '>=', $dateFrom);
        if ($dateTo !== null) $query->where('shift_date', '<=', $dateTo);

        return $query->orderBy('shift_date')->orderBy('shift_start');
    }

    // Complete shift metadata for every API response: block id, employee,
    // block window, derived status and timestamps
    private function shiftPayload(DutyShift $shift): array
    {
        $employee = $shift->employee;

        return [
            'shift_id'       => (int) $shift->shift_id,
            'emp_id'         => (int) $shift->emp_id,
            'employee_name'  => $employee
                ? trim($employee->emp_givname . ' ' . $employee->emp_surname)
                : null,
            'shift_date'     => (string) $shift->shift_date,
            'shift_start'    => (string) $shift->shift_start,
            'shift_end'      => (string) $shift->shift_end,
            'shift_type'     => $shift->shift_type,
            'shift_location' => $shift->shift_location,
            'status'         => $this->shiftStatus($shift),
            'shift_created'  => optional($shift->shift_created)->toDateTimeString(),
            'created_by'     => $shift->created_by,
        ];
    }

    // duty_shift has no status column, so the status is derived from the
    // assignee's availability and the block window relative to now.
    // REQ-SS-03: an employee who is no longer available leaves the block
    // PENDING REPLACEMENT; slotState() already treats that employee as absent.
    private function shiftStatus(DutyShift $shift): string
    {
        if ($shift->employee === null || ! $shift->employee->emp_instore) {
            return 'PENDING REPLACEMENT';
        }

        if (now()->between($shift->startsAt(), $shift->endsAt())) return 'ACTIVE';
        if (now()->greaterThan($shift->endsAt())) return 'COMPLETED';

        return 'SCHEDULED';
    }

    // REQ-SS-03: flipping an employee to unavailable makes every still-open
    // booking of that type unworkable, so the affected blocks read as
    // PENDING REPLACEMENT and super admins are alerted. Flipping back to
    // available clears the need and leaves the bookings untouched.
    private function changeAvailability(DutyShift $shift, bool $inStore): void
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
    private function markPendingReplacement(DutyShift $shift): void
    {
        $employee = $shift->employee;
        $employeeName = trim($employee->emp_givname . ' ' . $employee->emp_surname);

        $this->notifyEmployeesByType(
            ['SUPER ADMIN'],
            '[PRIORITY] Shift block #' . $shift->shift_id . ' assigned to ' . $employeeName
            . ' on ' . $shift->shift_date . ' (' . $shift->shift_start . ' - ' . $shift->shift_end
            . ') is now PENDING REPLACEMENT as of ' . now()->toDateTimeString() . '.'
        );
    }
}
