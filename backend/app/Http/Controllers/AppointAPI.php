<?php

    namespace App\Http\Controllers;

    use App\Models\Appointment;
    use App\Models\Customer;
    use App\Models\Employee;
    use Illuminate\Http\Request;
    use Illuminate\Support\Carbon;
    use Illuminate\Support\Facades\DB;
    use Illuminate\Support\Str;

    class AppointAPI extends Controller
    {
        // Standard operating hours used by the slot grid and booking rules
        protected const OPEN_MINUTES = 8 * 60;   // 08:00
        protected const CLOSE_MINUTES = 18 * 60; // 18:00

        /*
            Closing appointments
            ----------
            JSON REQUEST

            appoint_id - integer (req)
            reason - string (opt, detailed reason for closing - REQ-AB-04)
        */
        public function closeAppointment(Request $json)
        {
            $validator = (new InputValidatorAPI())->closeAppointment($json);
            if ($validator) return $validator;

            try {
                $appointId = $json->input('appoint_id');
                $reason = trim((string) $json->input('reason', ''));
                $appointment = Appointment::where('appoint_id', $appointId)->first();

                if (!$appointment) {
                    return response()->json(['success' => false, 'message' => 'Appointment not found'], 404);
                }

                $appointment->update([
                    'appoint_closed' => now()
                ]);

                // REQ-AB-04: the owning customer receives a priority
                // notification detailing why the slot became unavailable
                $message = '[PRIORITY] Your appointment #' . $appointment->appoint_id .
                    ' scheduled on ' . $appointment->appoint_date . ' was closed.';
                if ($reason !== '') {
                    $message .= ' Reason: ' . $reason;
                }
                $this->notifyCustomer((int) $appointment->cust_id, $message);

                return response()->json([
                    'success' => true,
                    'message' => 'Appointment closed successfully',
                    'data' => $appointment
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to close appointment',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Displaying appointment slots for a day
            ----------
            JSON REQUEST / Query Params

            date - string (req, format: YYYY-MM-DD)
        */
        public function displaySlots(Request $json)
        {
            try {
                $date = $json->input('date');
                if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'A valid date (YYYY-MM-DD) is required'
                    ], 400);
                }

                try {
                    $base = Carbon::createFromFormat('Y-m-d', $date)->startOfDay();
                } catch (\Throwable $e) {
                    return response()->json([
                        'success' => false,
                        'message' => 'A valid date (YYYY-MM-DD) is required'
                    ], 400);
                }

                // REQ-AB-01: CLAIM slots run in 30-minute blocks
                // REQ-AB-02: VISIT slots run in 10-minute blocks
                // Load the day's bookings, staffing and capacities once and
                // score every slot in memory (a per-slot query round-trip to
                // the remote database times out over an 80-slot grid).
                $open = $base->format('Y-m-d H:i:s');
                $close = $base->copy()->addDay()->format('Y-m-d H:i:s');
                // REQ-SC-01: customers get a restricted view - they only see
                // their own bookings, everyone else's stays anonymous.
                $custId = $this->customerId($json);
                $bookedRows = Appointment::whereNull('appoint_closed')
                    ->where('appoint_date', '>=', $open)
                    ->where('appoint_date', '<', $close)
                    ->get(['appoint_type', 'appoint_date', 'cust_id']);
                $inStore = Employee::where('emp_instore', true)
                    ->whereNull('emp_disabled')
                    ->whereNull('emp_deleted')
                    ->count();
                $capacities = [
                    'CLAIM' => (int) $this->settingValue('max_claiming_slots', 10),
                    'VISIT' => (int) $this->settingValue('max_visit_slots', 1),
                ];
                $minStaff = ['CLAIM' => 1, 'VISIT' => 2]; // REQ-AB-03 / REQ-SC-03

                $slots = [];
                foreach (['CLAIM' => 30, 'VISIT' => 10] as $type => $duration) {
                    for ($minutes = self::OPEN_MINUTES; $minutes + $duration <= self::CLOSE_MINUTES; $minutes += $duration) {
                        $start = $base->copy()->addMinutes($minutes);
                        $end = $start->copy()->addMinutes($duration);
                        $rows = $bookedRows->filter(function ($a) use ($type, $start, $end) {
                            if ($a->appoint_type !== $type) return false;
                            $at = $a->appoint_date instanceof \DateTimeInterface
                                ? Carbon::instance($a->appoint_date)
                                : Carbon::parse($a->appoint_date);
                            return $at->gte($start) && $at->lt($end);
                        });
                        $booked = $rows->count();
                        $mine = $custId !== null && $rows->contains('cust_id', $custId);

                        $reason = null;
                        if ($booked >= $capacities[$type]) {
                            $reason = 'Slot fully booked';
                        } elseif ($inStore < $minStaff[$type]) {
                            $reason = 'Not enough in-store employees available (minimum ' . $minStaff[$type] . ' required)';
                        }

                        $slots[] = [
                            'start'     => $start->format('Y-m-d H:i'),
                            'end'       => $end->format('Y-m-d H:i'),
                            'type'      => $type,
                            // Customers receive only status and their own marker;
                            // other users' booking counts remain private.
                            'booked'    => $custId !== null && ! $mine ? 0 : $booked,
                            'capacity'  => $capacities[$type],
                            'available' => $reason === null,
                            'reason'    => $reason,
                            'mine'      => $mine,
                        ];
                    }
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Appointment slots retrieved successfully',
                    'data' => [
                        'slots' => $slots
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display appointment slots',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Creating appointments
            ----------
            JSON REQUEST

            cust_id - integer (req)
            appoint_date - string/datetime (req)
            appoint_type - string (req: CLAIM | VISIT)
            appoint_desc - string (opt)
        */
        public function createAppointment(Request $json)
        {
            $validator = (new InputValidatorAPI())->createAppointment($json);
            if ($validator) return $validator;

            try {
                $type = strtoupper((string) $json->input('appoint_type', 'VISIT'));
                if (!in_array($type, ['CLAIM', 'VISIT'], true)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Appointment type must be CLAIM or VISIT'
                    ], 400);
                }

                // Align the requested time to the slot grid (REQ-SC-02):
                // CLAIM snaps to :00/:30, VISIT to every 10 minutes
                try {
                    $slotStart = Carbon::parse($json->input('appoint_date'));
                } catch (\Throwable $e) {
                    return response()->json([
                        'success' => false,
                        'message' => 'A valid appointment date is required'
                    ], 400);
                }

                $slotStart->second(0)->millisecond(0);
                if ($type === 'CLAIM') {
                    $slotStart->minute($slotStart->minute >= 30 ? 30 : 0);
                    $duration = 30;
                } else {
                    $slotStart->minute(intdiv($slotStart->minute, 10) * 10);
                    $duration = 10;
                }

                if ($slotStart->isPast()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Appointments must be booked for a future time.'
                    ], 422);
                }

                // Booking outside operating hours is unavailable
                $minutes = $slotStart->hour * 60 + $slotStart->minute;
                if ($minutes < self::OPEN_MINUTES || $minutes + $duration > self::CLOSE_MINUTES) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Selected time is outside operating hours (08:00 - 18:00)'
                    ], 409);
                }

                // Enforce the same capacity / staffing rules as the calendar
                $slotEnd = $slotStart->copy()->addMinutes($duration);
                $state = $this->slotState($type, $slotStart, $slotEnd);
                if (!$state['available']) {
                    return response()->json([
                        'success' => false,
                        'message' => $state['reason']
                    ], 409);
                }

                $user = $json->user('sanctum');
                $custId = $this->customerId($json);
                if ($custId !== null) {
                    if ((int) $json->input('cust_id') !== $custId) {
                        return response()->json(['success' => false, 'message' => 'Customer account mismatch.'], 403);
                    }
                } elseif (! $this->isAdmin($user)) {
                    return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
                } else {
                    $custId = (int) $json->input('cust_id');
                }

                $appointment = DB::transaction(function () use ($custId, $type, $slotStart, $slotEnd, $json) {
                    if (DB::getDriverName() === 'pgsql') {
                        $lockId = (int) ($slotStart->format('YmdHi') . ($type === 'CLAIM' ? '1' : '2'));
                        DB::select('select pg_advisory_xact_lock(?)', [$lockId]);
                    }

                    $state = $this->slotState($type, $slotStart, $slotEnd);
                    if (! $state['available']) {
                        throw new \RuntimeException($state['reason']);
                    }

                    return Appointment::create([
                        'cust_id' => $custId,
                        'appoint_created' => now(),
                        'appoint_closed' => null,
                        'appoint_date' => $slotStart,
                        'appoint_type' => $type,
                        'appoint_qr' => 'APPT-' . strtoupper(Str::random(16)),
                        'appoint_desc' => $json->input('appoint_desc'),
                    ]);
                });

                return response()->json([
                    'success' => true,
                    'message' => 'Appointment created successfully',
                    'data' => $appointment
                ], 201);

            } catch (\RuntimeException $e) {
                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage(),
                ], 409);
            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to create appointment',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Displaying appointments
            ----------
            JSON REQUEST / Query Params

            scope - string (opt: master for employees - REQ-SC-01)
            cust_id - integer (opt, employees only)
            type - string (opt)
        */
        public function displayAppointments(Request $json)
        {
            try {
                $query = Appointment::query();
                $user = $json->user();
                $isMaster = $json->input('scope') === 'master' && $this->isAdmin($user);

                if ($this->isEmployee($user)) {
                    // REQ-SC-01: administrators receive the master calendar;
                    // ordinary staff must provide a customer filter.
                    if ($isMaster) {
                        // No cust_id filter - full master view
                    } elseif ($json->filled('cust_id')) {
                        $query->where('cust_id', $json->input('cust_id'));
                    } else {
                        $query->whereRaw('1 = 0');
                    }
                } else {
                    // REQ-SC-01: customers only ever see their own bookings,
                    // no matter which cust_id was sent in the query string
                    $query->where('cust_id', $user ? $user->getKey() : 0);
                }

                if ($json->has('type')) {
                    $query->where('appoint_type', $json->input('type'));
                }

                $appointments = $query->orderBy('appoint_date', 'asc')->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Appointments retrieved successfully',
                    'data' => $appointments
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display appointments',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Searching appointments
            ----------
            JSON REQUEST

            q - string (opt)
            cust_id - integer (opt)
        */
        public function searchAppointments(Request $json)
        {
            try {
                $q = $json->input('q', '');
                $query = Appointment::query();
                $customerId = $this->customerId($json);
                $isMaster = $json->input('scope') === 'master' && $this->isAdmin($json->user('sanctum'));
                if ($customerId !== null) {
                    $query->where('cust_id', $customerId);
                } elseif ($isMaster) {
                    // Only administrators may search the complete appointment book.
                } elseif ($json->filled('cust_id')) {
                    $query->where('cust_id', $json->input('cust_id'));
                } else {
                    $query->whereRaw('1 = 0');
                }

                if (!empty($q)) {
                    $query->where(function($builder) use ($q) {
                        $builder->where('appoint_desc', 'like', "%{$q}%")
                                ->orWhere('appoint_qr', 'like', "%{$q}%")
                                ->orWhere('appoint_type', 'like', "%{$q}%");
                    });
                }

                $appointments = $query->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Appointments search completed',
                    'data' => $appointments
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to search appointments',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Sorting appointments
            ----------
            JSON REQUEST

            sort_by - string (opt: date | created | type)
            order - string (opt: asc | desc)
        */
        public function sortAppointments(Request $json)
        {
            try {
                $sortBy = $json->input('sort_by', 'date');
                $order = strtolower($json->input('order', 'asc')) === 'desc' ? 'desc' : 'asc';
                $col = $sortBy === 'created' ? 'appoint_created' : ($sortBy === 'type' ? 'appoint_type' : 'appoint_date');
                $query = Appointment::query();
                $customerId = $this->customerId($json);
                $isMaster = $json->input('scope') === 'master' && $this->isAdmin($json->user('sanctum'));
                if ($customerId !== null) {
                    $query->where('cust_id', $customerId);
                } elseif ($isMaster) {
                    // Only administrators may sort the complete appointment book.
                } elseif ($json->filled('cust_id')) {
                    $query->where('cust_id', $json->input('cust_id'));
                } else {
                    $query->whereRaw('1 = 0');
                }

                $appointments = $query->orderBy($col, $order)->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Appointments sorted successfully',
                    'data' => $appointments
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to sort appointments',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating appointment details
            ----------
            JSON REQUEST

            appoint_id - integer (req)
            appoint_date - string/datetime (opt)
            appoint_type - string (opt)
            appoint_desc - string (opt)
        */
        public function updateAppointmentDetails(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateAppointmentDetails($json);
            if ($validator) return $validator;

            try {
                $appointId = $json->input('appoint_id');
                $appointment = Appointment::where('appoint_id', $appointId)->first();

                if (! $appointment) {
                    return response()->json(['success' => false, 'message' => 'Appointment not found'], 404);
                }

                $customerId = $this->customerId($json);
                if ($customerId !== null) {
                    if ((int) $appointment->cust_id !== $customerId) {
                        return response()->json(['success' => false, 'message' => 'Appointment not found'], 404);
                    }
                } elseif (! $this->isAdmin($json->user('sanctum'))) {
                    return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
                }

                if ($appointment->appoint_closed) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Closed appointments cannot be modified.'
                    ], 409);
                }

                $updates = $json->only(['appoint_date', 'appoint_type', 'appoint_desc']);
                if (isset($updates['appoint_date']) || isset($updates['appoint_type'])) {
                    $type = strtoupper((string) ($updates['appoint_type'] ?? $appointment->appoint_type));
                    if (! in_array($type, ['CLAIM', 'VISIT'], true)) {
                        return response()->json(['success' => false, 'message' => 'Appointment type must be CLAIM or VISIT.'], 422);
                    }
                    $start = Carbon::parse($updates['appoint_date'] ?? $appointment->appoint_date);
                    $start->second(0)->millisecond(0);
                    $duration = $type === 'CLAIM' ? 30 : 10;
                    $start->minute($type === 'CLAIM' ? ($start->minute >= 30 ? 30 : 0) : intdiv($start->minute, 10) * 10);
                    $end = $start->copy()->addMinutes($duration);
                    if ($start->isPast()) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Appointments cannot be rescheduled to a past time.'
                        ], 422);
                    }
                    $minutes = $start->hour * 60 + $start->minute;
                    if ($minutes < self::OPEN_MINUTES || $minutes + $duration > self::CLOSE_MINUTES) {
                        return response()->json(['success' => false, 'message' => 'Selected time is outside operating hours.'], 422);
                    }
                    $state = $this->slotState($type, $start, $end, (int) $appointment->appoint_id);
                    if (! $state['available']) {
                        return response()->json(['success' => false, 'message' => $state['reason']], 409);
                    }
                    $updates['appoint_date'] = $start;
                    $updates['appoint_type'] = $type;
                }

                $appointment->update($updates);

                return response()->json([
                    'success' => true,
                    'message' => 'Appointment details updated successfully',
                    'data' => $appointment
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update appointment details',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        // ==========================================
        // SLOT AVAILABILITY RULES (REQ-AB-01 / REQ-AB-02 / REQ-AB-03 / REQ-SC-03)
        // ==========================================

        /*
            Computes capacity, staffing and the resulting availability for a
            single slot block. Shared by GET /appoint/slots and
            POST /appoint/create so the calendar and the booking path can
            never disagree.
        */
        protected function slotState(string $type, Carbon $start, Carbon $end, ?int $excludeId = null): array
        {
            // Capacity: CLAIM allows up to 10 concurrent open appointments,
            // VISIT allows exactly one (REQ-AB-01 / REQ-AB-02)
            $capacity = $type === 'CLAIM'
                ? (int) $this->settingValue('max_claiming_slots', 10)
                : (int) $this->settingValue('max_visit_slots', 1);

            $bookedQuery = Appointment::where('appoint_type', $type)
                ->whereNull('appoint_closed');
            if ($excludeId !== null) {
                $bookedQuery->where('appoint_id', '!=', $excludeId);
            }
            $booked = $bookedQuery
                ->where('appoint_date', '>=', $start)
                ->where('appoint_date', '<', $end)
                ->count();

            // Staffing: VISIT needs at least two in-store employees,
            // CLAIM needs at least one (REQ-AB-03 / REQ-SC-03)
            $minStaff = $type === 'CLAIM' ? 1 : 2;
            $inStore = Employee::where('emp_instore', true)
                ->whereNull('emp_disabled')
                ->whereNull('emp_deleted')
                ->count();

            $reason = null;
            if ($booked >= $capacity) {
                $reason = 'Slot fully booked';
            } elseif ($inStore < $minStaff) {
                $reason = 'Not enough in-store employees available (minimum ' . $minStaff . ' required)';
            }

            return [
                'booked'    => $booked,
                'capacity'  => $capacity,
                'available' => $reason === null,
                'reason'    => $reason,
            ];
        }
    }
