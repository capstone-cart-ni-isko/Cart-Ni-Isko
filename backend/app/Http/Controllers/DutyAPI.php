<?php

    namespace App\Http\Controllers;

    use App\Models\DutyShift;
    use App\Models\EmpLog;
    use App\Models\Employee;
    use Illuminate\Http\Request;
    use Illuminate\Support\Carbon;

    class DutyAPI extends Controller
    {
        // Store hours, matching the appointment slot grid (AppointAPI)
        private const OPEN = '08:00';
        private const CLOSE = '18:00';

        // Staff cannot change their availability after this time on the day itself (REQ-SS-02)
        private const LOCK_HOUR = 7;

        private const TYPES = ['DESK DUTY', 'EVENT PREP', 'INVENTORY', 'POS CASHIER'];

        /*
            Displaying the duty shifts of one day
            ----------
            JSON REQUEST / Query Params

            date - string (req, format: YYYY-MM-DD)
        */
        public function displayShifts(Request $json)
        {
            $date = $this->validDate($json->input('date'));
            if ($date === null) {
                return response()->json(['success' => false, 'message' => 'A valid date (YYYY-MM-DD) is required'], 400);
            }

            $shifts = DutyShift::with('employee:emp_id,emp_givname,emp_surname,emp_type')
                ->whereDate('shift_date', $date)
                ->orderBy('shift_start')
                ->get()
                ->map(fn ($s) => $this->present($s));

            return response()->json([
                'success' => true,
                'message' => 'Duty shifts retrieved successfully',
                'data' => [
                    'date'   => $date,
                    'shifts' => $shifts,
                    'locked' => $this->isLocked($date, $json->user('sanctum')),
                ],
            ], 200);
        }

        /*
            Assigning a duty shift
            ----------
            JSON REQUEST

            emp_id - integer (req; staff may only assign themselves)
            shift_date - string (req, YYYY-MM-DD)
            shift_start - string (req, HH:MM, 30-minute steps within 08:00-18:00)
            shift_end - string (req, HH:MM, after shift_start)
            shift_type - string (opt: DESK DUTY | EVENT PREP | INVENTORY | POS CASHIER)
            shift_location - string (opt)
        */
        public function assignShift(Request $json)
        {
            $actor = $json->user('sanctum');
            $empId = (int) $json->input('emp_id');
            $date = $this->validDate($json->input('shift_date'));
            $start = (string) $json->input('shift_start', '');
            $end = (string) $json->input('shift_end', '');
            $type = strtoupper(trim((string) $json->input('shift_type', 'DESK DUTY')));
            $location = trim((string) $json->input('shift_location', ''));

            if ($date === null) {
                return $this->fail('A valid shift date (YYYY-MM-DD) is required.', 422);
            }
            if (! $this->validTime($start) || ! $this->validTime($end)) {
                return $this->fail('Shift times must be on the hour or half hour (e.g. 08:00, 08:30).', 422);
            }
            if ($start < self::OPEN || $end > self::CLOSE) {
                return $this->fail('Shifts must be within store hours (8:00 AM - 6:00 PM).', 422);
            }
            if ($start >= $end) {
                return $this->fail('The shift must end after it starts.', 422);
            }
            if (! in_array($type, self::TYPES, true)) {
                return $this->fail('Unknown duty type.', 422);
            }
            if (mb_strlen($location) > 100) {
                return $this->fail('The location must be 100 characters or fewer.', 422);
            }

            $employee = Employee::whereNull('emp_deleted')->whereNull('emp_disabled')->find($empId);
            if (! $employee) {
                return $this->fail('Employee not found.', 404);
            }
            if ($denied = $this->guard($actor, $empId, $date)) {
                return $denied;
            }

            $overlap = DutyShift::where('emp_id', $empId)
                ->whereDate('shift_date', $date)
                ->where('shift_start', '<', $end)
                ->where('shift_end', '>', $start)
                ->exists();
            if ($overlap) {
                return $this->fail($this->nameOf($employee) . ' already has a shift during that time.', 409);
            }

            $shift = DutyShift::create([
                'emp_id'         => $empId,
                'shift_date'     => $date,
                'shift_start'    => $start,
                'shift_end'      => $end,
                'shift_type'     => $type,
                'shift_location' => $location !== '' ? $location : null,
                'shift_created'  => now(),
                'created_by'     => $actor->getKey(),
            ]);

            $label = $this->label($type, $date, $start, $end);
            $this->log($actor, 'ASSIGN DUTY', 'Assigned ' . $label . ' to ' . $this->nameOf($employee));
            if ((int) $actor->getKey() !== $empId) {
                $this->notifyEmployee($empId, 'You were assigned ' . $label . ($location !== '' ? ' at ' . $location : '') . '.');
            }

            return response()->json([
                'success' => true,
                'message' => 'Duty shift assigned successfully',
                'data'    => $this->present($shift->load('employee:emp_id,emp_givname,emp_surname,emp_type')),
            ], 201);
        }

        /*
            Removing a duty shift
            ----------
            JSON REQUEST

            shift_id - integer (req)
        */
        public function removeShift(Request $json)
        {
            $actor = $json->user('sanctum');
            $shift = DutyShift::with('employee')->find((int) $json->input('shift_id'));
            if (! $shift) {
                return $this->fail('Duty shift not found.', 404);
            }

            $date = $shift->shift_date->format('Y-m-d');
            if ($denied = $this->guard($actor, (int) $shift->emp_id, $date)) {
                return $denied;
            }

            $label = $this->label($shift->shift_type, $date, $shift->shift_start, $shift->shift_end);
            $shift->delete();

            $this->log($actor, 'REMOVE DUTY', 'Removed ' . $label . ' from ' . $this->nameOf($shift->employee));
            if ((int) $actor->getKey() !== (int) $shift->emp_id) {
                $this->notifyEmployee((int) $shift->emp_id, 'Your ' . $label . ' was removed from the schedule.');
            }

            return response()->json([
                'success' => true,
                'message' => 'Duty shift removed successfully',
                'data'    => ['shift_id' => $shift->shift_id],
            ], 200);
        }

        // ==========================================
        // RULES
        // ==========================================

        // Who may change whose schedule, and when (REQ-SS-02)
        private function guard($actor, int $empId, string $date)
        {
            if (! $this->isAdmin($actor) && (int) $actor->getKey() !== $empId) {
                return $this->fail('Staff can only change their own duty schedule.', 403);
            }
            if ($date < $this->storeNow()->format('Y-m-d')) {
                return $this->fail('Past dates can no longer be scheduled.', 409);
            }
            if ($this->isLocked($date, $actor)) {
                return $this->fail('Availability can no longer be changed for today (locked after 7:00 AM). Ask a super admin.', 409);
            }
            return null;
        }

        // Today's schedule locks at 7:00 AM store time for everyone but the super admin
        private function isLocked(string $date, $actor): bool
        {
            if ($this->isSuperAdmin($actor)) return false;
            $now = $this->storeNow();
            return $date < $now->format('Y-m-d')
                || ($date === $now->format('Y-m-d') && $now->hour >= self::LOCK_HOUR);
        }

        private function storeNow(): Carbon
        {
            return now(config('app.store_timezone', 'Asia/Manila'));
        }

        private function validDate($value): ?string
        {
            if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) return null;
            try {
                return Carbon::createFromFormat('!Y-m-d', $value)->format('Y-m-d') === $value ? $value : null;
            } catch (\Throwable $e) {
                return null;
            }
        }

        private function validTime(string $value): bool
        {
            return preg_match('/^([01]\d|2[0-3]):(00|30)$/', $value) === 1;
        }

        // ==========================================
        // HELPERS
        // ==========================================

        private function present(DutyShift $shift): array
        {
            $employee = $shift->employee;
            return [
                'shift_id'       => $shift->shift_id,
                'emp_id'         => $shift->emp_id,
                'emp_name'       => $this->nameOf($employee),
                'emp_type'       => $employee?->emp_type,
                'shift_date'     => $shift->shift_date->format('Y-m-d'),
                'shift_start'    => $shift->shift_start,
                'shift_end'      => $shift->shift_end,
                'shift_type'     => $shift->shift_type,
                'shift_location' => $shift->shift_location,
            ];
        }

        private function nameOf(?Employee $employee): string
        {
            if (! $employee) return 'an employee';
            $name = trim(($employee->emp_givname ?? '') . ' ' . ($employee->emp_surname ?? ''));
            return $name !== '' ? $name : 'Employee #' . $employee->emp_id;
        }

        private function label(string $type, string $date, string $start, string $end): string
        {
            $day = Carbon::createFromFormat('!Y-m-d', $date)->format('M j, Y');
            $fmt = fn ($t) => Carbon::createFromFormat('H:i', $t)->format('g:i A');
            return ucwords(strtolower($type)) . ' on ' . $day . ' (' . $fmt($start) . ' - ' . $fmt($end) . ')';
        }

        private function log($actor, string $action, string $desc): void
        {
            EmpLog::create([
                'emp_id'         => $actor->getKey(),
                'emplog_created' => now(),
                'emplog_action'  => $action,
                'emplog_desc'    => $desc,
            ]);
        }

        private function fail(string $message, int $status)
        {
            return response()->json(['success' => false, 'message' => $message], $status);
        }
    }
