<?php

    namespace App\Http\Controllers;

    use App\Models\Appointment;
    use App\Models\Customer;
    use App\Models\DutyShift;
    use App\Models\Employee;
    use App\Support\DayRoster;
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

                // A done or cancelled appointment is final: it can never be
                // closed again, moved or removed.
                if ($appointment->appoint_closed) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Closed appointments cannot be closed again.'
                    ], 409);
                }

                $appointment->update([
                    'appoint_closed' => now()
                ]);

                // REQ-AB-04: the owning customer receives a priority
                // notification detailing why the slot became unavailable
                $start = $appointment->appoint_start;
                $message = '[PRIORITY] Your appointment #' . $appointment->appoint_id .
                    ' scheduled on ' . $start . ' was closed.';
                if ($reason !== '') {
                    $message .= ' Reason: ' . $reason;
                }
                $this->notifyCustomer((int) $appointment->cust_id, $message);

                // REQ-AB-04 / REQ-SC-04: cancelling one booking also cancels the
                // block it sits in, so every other open booking that overlaps the
                // same block is told to reschedule. The block runs from the slot
                // start to its live appoint_end (30 min CLAIM / 10 min VISIT).
                $blockMinutes = $appointment->appoint_type === 'CLAIM' ? 30 : 10;
                $blockEnd = $appointment->appoint_end;
                if ($blockEnd === null && $start) {
                    $blockEnd = Carbon::parse($start)->addMinutes($blockMinutes);
                }

                $others = ($start && $blockEnd)
                    ? Appointment::whereNull('appoint_closed')
                        ->where('appoint_type', $appointment->appoint_type)
                        ->where('appoint_id', '!=', $appointment->appoint_id)
                        ->where('appoint_start', '>=', $start)
                        ->where('appoint_start', '<', $blockEnd)
                        ->get()
                    : collect();

                foreach ($others as $other) {
                    $this->notifyCustomer((int) $other->cust_id,
                        '[PRIORITY] Your appointment #' . $other->appoint_id .
                        ' on ' . $other->appoint_start .
                        ' is unavailable. Please reschedule at your earliest convenience. ' .
                        ($reason !== '' ? 'Reason: ' . $reason : 'Reason: slot cancelled.')
                    );
                }

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
                    ->where('appoint_start', '>=', $open)
                    ->where('appoint_start', '<', $close)
                    ->get(['appoint_type', 'appoint_start', 'cust_id']);
                // REQ-AB-03 / REQ-SS-03: the headcount is per block, not per
                // day, so the day's roster is loaded once here and every slot
                // is scored against the blocks that actually span it. The
                // roster source is optional: without it the grid still opens
                // and only the staffing rule is skipped (see rosterHeadcount).
                $roster = $this->rosterFor($base);
                $capacities = [
                    'CLAIM' => (int) $this->settingValue('max_claiming_slots', 10),
                    'VISIT' => (int) $this->settingValue('max_visit_slots', 1),
                ];
                $minStaff = ['CLAIM' => 1, 'VISIT' => 2]; // REQ-AB-03 / REQ-SC-03
                // REQ-SS-03: counted once for the whole grid, never per slot.
                $pendingReplacements = $this->pendingReplacements();

                $slots = [];
                foreach (['CLAIM' => 30, 'VISIT' => 10] as $type => $duration) {
                    for ($minutes = self::OPEN_MINUTES; $minutes + $duration <= self::CLOSE_MINUTES; $minutes += $duration) {
                        $start = $base->copy()->addMinutes($minutes);
                        $end = $start->copy()->addMinutes($duration);
                        $rows = $bookedRows->filter(function ($a) use ($type, $start, $end) {
                            if ($a->appoint_type !== $type) return false;
                            $at = $a->appoint_start instanceof \DateTimeInterface
                                ? Carbon::instance($a->appoint_start)
                                : Carbon::parse($a->appoint_start);
                            return $at->gte($start) && $at->lt($end);
                        });
                        $booked = $rows->count();
                        $mine = $custId !== null && $rows->contains('cust_id', $custId);

                        // REQ-AB-03 / REQ-SS-03: only the employees whose duty
                        // block spans this slot count towards its headcount.
                        // null = no roster source on this connection, in which
                        // case the staffing rule does not apply.
                        $inStore = $roster ? $roster->headcount($start, $end) : null;

                        $reason = null;
                        if ($booked >= $capacities[$type]) {
                            $reason = 'Slot fully booked';
                        } elseif ($inStore !== null && $inStore < $minStaff[$type]) {
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
                            'in_store'  => $inStore,
                            'available' => $reason === null,
                            'reason'    => $reason,
                            'mine'      => $mine,
                            // REQ-SS-03: blocks whose assignee is unavailable.
                            'pending_replacements' => $pendingReplacements,
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
            appoint_start - string/datetime (req: slot start - the legacy
                `appoint_date` field is accepted as an alias of it)
            appoint_end - string/datetime (opt, ignored: the slot end is
                derived server-side from the type's duration)
            appoint_type - string (req: CLAIM | VISIT, any case)
            emp_id - integer (opt, staff calendars may name the employee)
            appoint_desc - string (opt: accepted and ignored - the live
                appointments table has no description column)
        */
        public function createAppointment(Request $json)
        {
            // The shared validator still asks for the legacy slot field name;
            // mirroring the canonical one into it keeps every client booking
            // until InputValidatorAPI is relaxed (backward-compat guard).
            if (! $json->filled('appoint_date') && $json->filled('appoint_start')) {
                $json->merge(['appoint_date' => $json->input('appoint_start')]);
            }

            $validator = (new InputValidatorAPI())->createAppointment($json);
            if ($validator) return $validator;

            try {
                // SRS stores the kind verbatim: CLAIM or VISIT, uppercase.
                // The value is normalised so lowercase clients can book too.
                $type = strtoupper((string) $json->input('appoint_type', 'VISIT'));
                if (!in_array($type, ['CLAIM', 'VISIT'], true)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Appointment type must be CLAIM or VISIT'
                    ], 422);
                }

                $rawStart = $this->requestedStart($json);
                if (! is_string($rawStart) || trim($rawStart) === '') {
                    return response()->json([
                        'success' => false,
                        'message' => 'A valid appointment date is required'
                    ], 400);
                }

                // Align the requested time to the slot grid (REQ-SC-02):
                // CLAIM snaps to :00/:30, VISIT to every 10 minutes
                try {
                    $slotStart = Carbon::parse($rawStart);
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

                $user = $json->user('api');
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

                    // FLOW-BOOK_APP-06: status `upcoming` + a unique QR code.
                    // emp_id is NOT NULL on the live table (FK -> employee),
                    // so the booking always names the employee taking it.
                    return Appointment::create([
                        // No sequence for appoint_id on the live `appointments`
                        // table; allocated inside this transaction, which is
                        // already serialised per slot by pg_advisory_xact_lock.
                        'appoint_id' => $this->nextId('appointments', 'appoint_id'),
                        'cust_id' => $custId,
                        'emp_id' => $this->assigneeId($json),
                        'appoint_created' => now(),
                        'appoint_closed' => null,
                        'appoint_start' => $slotStart,
                        'appoint_end' => $slotEnd,
                        'appoint_type' => $type,
                        'appoint_status' => 'upcoming',
                        'appoint_qr' => 'APPT-' . strtoupper(Str::random(16)),
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
            status - string (opt: today | upcoming | done | cancelled)
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

                $this->filterByStatus($query, strtolower(trim((string) $json->input('status', ''))));

                $appointments = $query->orderBy('appoint_start', 'asc')->get();

                // SRS: APPOINTMENT has no order column - the link to the order a
                // claim is for lives in PICKUP (appoint_id -> ord_id), written by
                // POST /checkout/payment. Surfacing it here lets the ribbon's
                // Appointments list open the matching order without any schema
                // change. One extra query for the whole page, never per row.
                $orders = $this->ordersFor($appointments->pluck('appoint_id')->all());

                $rows = $appointments->map(function (Appointment $appointment) use ($orders) {
                    $link = $orders[(int) $appointment->appoint_id] ?? null;
                    if ($link === null) {
                        return $appointment;
                    }

                    return array_merge($appointment->toArray(), [
                        'ord_id'     => $link['ord_id'],
                        'ord_status' => $link['ord_status'],
                    ]);
                });

                return response()->json([
                    'success' => true,
                    'message' => 'Appointments retrieved successfully',
                    'data' => $rows
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
                $isMaster = $json->input('scope') === 'master' && $this->isAdmin($json->user('api'));
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
                    // The live table has no free-text description column, so
                    // the search runs over the identifying fields instead:
                    // QR code, type, status, slot date, id and booking customer.
                    $query->where(function($builder) use ($q) {
                        $builder->where('appoint_qr', 'like', "%{$q}%")
                                ->orWhere('appoint_type', 'like', "%{$q}%")
                                ->orWhere('appoint_status', 'like', "%{$q}%");

                        if (preg_match('/^\d{4}-\d{2}-\d{2}/', (string) $q)) {
                            $builder->orWhereDate('appoint_start', substr((string) $q, 0, 10));
                        }
                        if (ctype_digit((string) $q)) {
                            $builder->orWhere('appoint_id', (int) $q)
                                    ->orWhere('cust_id', (int) $q);
                        }
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
                $col = $sortBy === 'created' ? 'appoint_created' : ($sortBy === 'type' ? 'appoint_type' : 'appoint_start');
                $query = Appointment::query();
                $customerId = $this->customerId($json);
                $isMaster = $json->input('scope') === 'master' && $this->isAdmin($json->user('api'));
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
            appoint_start - string/datetime (opt: the legacy `appoint_date`
                field is accepted as an alias; the end of the slot is always
                recomputed from the type's duration)
            appoint_type - string (opt: CLAIM | VISIT, any case)
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
                } elseif (! $this->isAdmin($json->user('api'))) {
                    return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
                }

                if ($appointment->appoint_closed) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Closed appointments cannot be modified.'
                    ], 409);
                }

                // Only live columns are ever written: the legacy description
                // field has nowhere to go, so it is accepted and dropped.
                $requested = $this->requestedStart($json);
                $updates = [];
                if (is_string($requested) && trim($requested) !== '') {
                    $updates['appoint_start'] = $requested;
                }
                if ($json->filled('appoint_type')) {
                    $updates['appoint_type'] = $json->input('appoint_type');
                }

                if (isset($updates['appoint_start']) || isset($updates['appoint_type'])) {
                    $type = strtoupper((string) ($updates['appoint_type'] ?? $appointment->appoint_type));
                    if (! in_array($type, ['CLAIM', 'VISIT'], true)) {
                        return response()->json(['success' => false, 'message' => 'Appointment type must be CLAIM or VISIT.'], 422);
                    }
                    try {
                        $start = Carbon::parse($updates['appoint_start'] ?? $appointment->appoint_start);
                    } catch (\Throwable $e) {
                        return response()->json([
                            'success' => false,
                            'message' => 'A valid appointment date is required'
                        ], 400);
                    }
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
                    $updates['appoint_start'] = $start;
                    $updates['appoint_end'] = $end;
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
            Applies one of the ribbon's four filter pills - today, upcoming,
            done, cancelled - to an appointment query. SRS keeps the status
            implicit, so it is derived exactly like the customer list does it:
            a closed appointment is done, a still-open one whose slot has
            already elapsed is cancelled, "today" is today's open bookings and
            everything else is upcoming. Unknown values are ignored, so the
            endpoint stays usable without a status at all.
        */
        protected function filterByStatus($query, string $status): void
        {
            if (!in_array($status, ['today', 'upcoming', 'done', 'cancelled'], true)) {
                return;
            }

            // The live slot window is stored, not derived: a CLAIM runs
            // appoint_start -> appoint_end (30 min), a VISIT 10 min.
            if ($status === 'done') {
                $query->whereNotNull('appoint_closed');
                return;
            }

            $query->whereNull('appoint_closed');
            if ($status === 'cancelled') {
                $query->where('appoint_end', '<', now());
            } elseif ($status === 'today') {
                $query->whereBetween('appoint_start', [now()->startOfDay(), now()->endOfDay()]);
            } else {
                $query->where('appoint_end', '>=', now());
            }
        }

        /*
            Resolves the order behind each appointment, keyed by appoint_id.
            Reads the SRS PICKUP -> ORDERS pair in a single indexed query; an
            appointment that was never claimed through checkout (a plain store
            visit) simply has no entry.
        */
        protected function ordersFor(array $appointIds): array
        {
            $appointIds = array_values(array_filter(array_map('intval', $appointIds)));
            if ($appointIds === []) {
                return [];
            }

            $rows = DB::table('pickup')
                ->join('orders', 'orders.ord_id', '=', 'pickup.ord_id')
                ->whereIn('pickup.appoint_id', $appointIds)
                ->get(['pickup.appoint_id', 'orders.ord_id', 'orders.ord_status']);

            $links = [];
            foreach ($rows as $row) {
                $links[(int) $row->appoint_id] = [
                    'ord_id'     => $row->ord_id,
                    'ord_status' => $row->ord_status,
                ];
            }

            return $links;
        }

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
                ->where('appoint_start', '>=', $start)
                ->where('appoint_start', '<', $end)
                ->count();

            // Staffing: VISIT needs at least two in-store employees,
            // CLAIM needs at least one (REQ-AB-03 / REQ-SC-03). The count is
            // per block, not per day: only an employee whose duty_shift block
            // spans this slot counts towards it. A null count means the
            // roster source is unavailable on this connection, in which case
            // the staffing rule is skipped and the capacity rule still holds.
            $minStaff = $type === 'CLAIM' ? 1 : 2;
            $inStore = $this->rosterHeadcount($start, $end);

            $reason = null;
            if ($booked >= $capacity) {
                $reason = 'Slot fully booked';
            } elseif ($inStore !== null && $inStore < $minStaff) {
                $reason = 'Not enough in-store employees available (minimum ' . $minStaff . ' required)';
            }

            return [
                'booked'    => $booked,
                'capacity'  => $capacity,
                'in_store'  => $inStore,
                'available' => $reason === null,
                'reason'    => $reason,
                // REQ-SS-03: blocks whose assignee is unavailable. They are
                // counted separately from the in-store minimum above because
                // the minimum only asks whether enough staff exist, not
                // whether this block still has its own person.
                'pending_replacements' => $this->pendingReplacements(),
            ];
        }

        // ==========================================
        // SLOT INPUT / STAFFING HELPERS
        // ==========================================

        /**
         * Slot start the client asked for. `appoint_start` is the live column
         * and the canonical request field; the pre-restore `appoint_date`
         * field is still read as an alias so older clients (and the admin
         * calendar) keep booking. It is only ever a request key - it is
         * never written to or read from the database.
         */
        protected function requestedStart(Request $json)
        {
            $start = $json->input('appoint_start');

            return ($start === null || $start === '') ? $json->input('appoint_date') : $start;
        }

        /**
         * appointments.emp_id is NOT NULL with a foreign key to employee, so
         * every booking has to name one. An explicit emp_id (staff calendars)
         * wins; otherwise the first employee still on the payroll is attached.
         * Nothing in the flow reads the value back - the claiming scan records
         * who scanned - it only has to satisfy the constraint.
         *
         * @throws \RuntimeException when no employee exists to hold the booking
         */
        protected function assigneeId(Request $json): int
        {
            $sent = $json->input('emp_id');
            if ($sent !== null && $sent !== '' && Employee::where('emp_id', (int) $sent)->exists()) {
                return (int) $sent;
            }

            $empId = Employee::whereNull('emp_deleted')->orderBy('emp_id')->value('emp_id');
            if (! $empId) {
                throw new \RuntimeException('No employee is available to take this appointment.');
            }

            return (int) $empId;
        }

        /**
         * The roster used by the staffing rule (REQ-AB-03), or null when this
         * connection has no roster source (the DutyShift model or its table
         * may be absent). Callers then skip only the staffing rule; the
         * capacity and slot-window rules always apply.
         */
        protected function rosterFor(Carbon $day): ?DayRoster
        {
            try {
                if (! class_exists(DutyShift::class)) {
                    return null;
                }

                return DayRoster::for($day);
            } catch (\Throwable $e) {
                return null;
            }
        }

        /** In-store headcount for one block, or null when unknown. */
        protected function rosterHeadcount(Carbon $start, Carbon $end): ?int
        {
            $roster = $this->rosterFor($start);

            return $roster ? $roster->headcount($start, $end) : null;
        }

        /** REQ-SS-03: blocks whose assignee is unavailable (0 when unknown). */
        protected function pendingReplacements(): int
        {
            try {
                if (! class_exists(DutyShift::class)) {
                    return 0;
                }

                return (int) DutyShift::pendingReplacements();
            } catch (\Throwable $e) {
                return 0;
            }
        }
    }
