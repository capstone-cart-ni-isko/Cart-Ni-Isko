<?php

namespace App\Http\Controllers;

use App\Models\Visit;
use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Schedule;
use App\Support\DayRoster;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * AppointmentsAPI
 *
 * DOMAIN 8 / DOMAIN 22 - appointment completion, tracking and the visits + preorder-pickup booking that a pickup appointment is (rule 54).
 *
 * Repackaged from: Appoint API.
 */
class AppointmentsAPI extends Controller
{

    // ===== from the Appoint API file =====

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
            $validator = (new DatabaseAPI())->closeAppointment($json);
            if ($validator) return $validator;

            try {
                $appointId = $json->input('appoint_id');
                $reason = trim((string) $json->input('reason', ''));
                $appointment = Visit::where('appoint_id', $appointId)->first();

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

                /*
                    FLOW-MANAGE_APP-07: the admin "cancel" button is this call.
                    The row must land on `cancelled` (so the cancelled pill on
                    the admin list finds it) and the QR must die with the slot
                    (FLOW-MANAGE_BOOKED-06).
                */
                $appointment->update([
                    'appoint_closed' => now(),
                    'appoint_status' => 'cancelled',
                    'appoint_qr'     => null,
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
                // same block is told to reschedule. The block is one timeslot
                // (business rule 11: exactly 10 minutes) from the slot start.
                $blockMinutes = $this->slotDuration((string) $appointment->appoint_type);
                $blockEnd = $appointment->appoint_end;
                if ($blockEnd === null && $start) {
                    $blockEnd = Carbon::parse($start)->addMinutes($blockMinutes);
                }

                $others = ($start && $blockEnd)
                    ? Visit::whereNull('appoint_closed')
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

                // REQ-MANAGE_APP-06: every appointment modification is logged.
                $actor = $json->user('api');
                if ($this->isEmployee($actor)) {
                    $this->logEmployee((int) $actor->emp_id, 'edit',
                        'POST /api/appoint/close - appointment #' . $appointment->appoint_id);
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
            $validator = (new DatabaseAPI())->displaySlots($json);
            if ($validator) return $validator;

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

                // REQ-AB-01/02: pickup (CLAIM) and visit slots both run in
                // 10-minute blocks (pickup follows the checkout `slot_minutes`,
                // visits are fixed at 10). The day's bookings, staffing and
                // capacities are loaded once and every slot is scored in
                // memory (a per-slot query round-trip to the remote database
                // times out over an 80-slot grid).
                $open = $base->format('Y-m-d H:i:s');
                $close = $base->copy()->addDay()->format('Y-m-d H:i:s');
                // REQ-SC-01: customers get a restricted view - they only see
                // their own bookings, everyone else's stays anonymous.
                $custId = $this->customerId($json);
                $bookedRows = Visit::whereNull('appoint_closed')
                    ->where('appoint_start', '>=', $open)
                    ->where('appoint_start', '<', $close)
                    ->get(['appoint_type', 'appoint_start', 'appoint_end', 'cust_id']);
                // REQ-AB-03 / REQ-SS-03: the headcount is per block, not per
                // day, so the day's roster is loaded once here and every slot
                // is scored against the blocks that actually span it. The
                // roster source is optional: without it the grid still opens
                // and only the staffing rule is skipped (see rosterHeadcount).
                $roster = $this->rosterFor($base);
                $capacities = [
                    'CLAIM' => $this->slotCapacity('CLAIM'),
                    'VISIT' => $this->slotCapacity('VISIT'),
                ];
                $minStaff = ['CLAIM' => 1, 'VISIT' => 2]; // REQ-AB-03 / REQ-SC-03
                // REQ-SS-03: counted once for the whole grid, never per slot.
                $pendingReplacements = $this->pendingReplacements();

                $slots = [];
                foreach (['CLAIM' => $this->slotDuration('CLAIM'), 'VISIT' => $this->slotDuration('VISIT')] as $type => $duration) {
                    for ($minutes = self::OPEN_MINUTES; $minutes + $duration <= self::CLOSE_MINUTES; $minutes += $duration) {
                        $start = $base->copy()->addMinutes($minutes);
                        $end = $start->copy()->addMinutes($duration);
                        // A booking counts towards a block when its window
                        // overlaps it (matching OrdersAPI::slotHasCapacity),
                        // so a legacy 30-minute row still occupies every
                        // 10-minute block it spans.
                        $rows = $bookedRows->filter(function ($a) use ($type, $start, $end) {
                            if ($a->appoint_type !== $type) return false;
                            $at = $a->appoint_start instanceof \DateTimeInterface
                                ? Carbon::instance($a->appoint_start)
                                : Carbon::parse($a->appoint_start);
                            $blockEnd = $a->appoint_end instanceof \DateTimeInterface
                                ? Carbon::instance($a->appoint_end)
                                : ($a->appoint_end !== null ? Carbon::parse($a->appoint_end) : null);
                            if ($blockEnd === null) {
                                return $at->gte($start) && $at->lt($end);
                            }
                            return $at->lt($end) && $blockEnd->gt($start);
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

            FLOW-BOOK_APP-05: a customer booking is answered 428
            {code: "OTP_REQUIRED", data: {purpose: "appointment"}} until the
            phone OTP is cleared, and the verification is burned with the
            booking. Employees and administrators are never OTP-gated.
        */
        public function createAppointment(Request $json)
        {
            // The shared validator still asks for the legacy slot field name;
            // mirroring the canonical one into it keeps every client booking
            // until DatabaseAPI is relaxed (backward-compat guard).
            if (! $json->filled('appoint_date') && $json->filled('appoint_start')) {
                $json->merge(['appoint_date' => $json->input('appoint_start')]);
            }

            $validator = (new DatabaseAPI())->createAppointment($json);
            if ($validator) return $validator;

            try {
                // The stored kind is CLAIM or VISIT (uppercase, matching the
                // checkout path). The frontend sends `pickup` / `visit`, and
                // the legacy calendar sends `claim` / `VISIT` - all fold onto
                // the same two stored values (see normalizeType).
                $type = $this->normalizeType($json->input('appoint_type', 'VISIT'));
                if ($type === null) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Appointment type must be pickup (claim) or visit'
                    ], 422);
                }

                $rawStart = $this->requestedStart($json);
                if (! is_string($rawStart) || trim($rawStart) === '') {
                    return response()->json([
                        'success' => false,
                        'message' => 'A valid appointment date is required'
                    ], 400);
                }

                // Align the requested time to the 10-minute slot grid
                // (REQ-SC-02): pickup and visit blocks both snap the same way.
                try {
                    $slotStart = Carbon::parse($rawStart);
                } catch (\Throwable $e) {
                    return response()->json([
                        'success' => false,
                        'message' => 'A valid appointment date is required'
                    ], 400);
                }

                $slotStart->second(0)->millisecond(0);
                $slotStart->minute(intdiv($slotStart->minute, 10) * 10);
                $duration = $this->slotDuration($type);

                // FLOW-BOOK_APP-03: the slot must be at least 30 minutes out.
                $leadMinutes = max(0, (int) $this->settingValue('booking_lead_minutes', 30));
                if ($slotStart->lt(now()->addMinutes($leadMinutes))) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Appointments must be booked at least ' . $leadMinutes . ' minutes ahead.'
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

                // FLOW-BOOK_APP-05: the phone OTP comes before the booking is
                // saved. The 428 answer carries the purpose, and the client
                // then clears it through /otp/issue + /otp/verify and retries.
                $gate = $this->otpGate($json, 'appointment');
                if ($gate) return $gate;

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
                    return Visit::create([
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
                        'appoint_qr' => $this->uniqueAppointmentQr(),
                    ]);
                });

                // The verification is burned only once the appointment exists,
                // so the next booking needs its own code (FLOW-BOOK_APP-05).
                $this->consumeOtp($json, 'appointment');

                // FLOW-MANAGE_APP-08 / REQ-MANAGE_APP-04: the customer hears
                // that the booking is confirmed, and FLOW-BOOK_APP-07: every
                // employee whose duty block spans the slot is told about it.
                // Notifications are best-effort - they never fail the booking.
                try {
                    $kindLabel = $type === 'CLAIM' ? 'pickup' : 'visit';
                    $this->notifyCustomer((int) $custId,
                        '[PRIORITY] Your ' . $kindLabel . ' appointment #' . $appointment->appoint_id
                            . ' on ' . $slotStart->format('M j, Y g:i A') . ' is confirmed.');

                    if (class_exists(Schedule::class)) {
                        $staff = Schedule::whereNull('sched_disabled')
                            ->where('sched_time_start', '<=', $slotStart)
                            ->where('sched_time_end', '>=', $slotEnd)
                            ->get(['emp_id']);

                        foreach ($staff as $shift) {
                            $this->notifyEmployee((int) $shift->emp_id,
                                'New ' . $kindLabel . ' appointment #' . $appointment->appoint_id
                                    . ' booked for ' . $slotStart->format('M j, Y g:i A') . '.');
                        }
                    }
                } catch (\Throwable $e) {
                    // A notification must never roll back the booking.
                }

                // REQ-ACCESS_LOG-01/03: booking an appointment is recorded.
                $user = $json->user('api');
                if ($user instanceof Customer) {
                    $this->logCustomer($custId, 'edit',
                        'POST /api/appoint/create - appointment #' . $appointment->appoint_id);
                } elseif ($this->isEmployee($user)) {
                    $this->logEmployee((int) $user->emp_id, 'edit',
                        'POST /api/appoint/create - appointment #' . $appointment->appoint_id);
                }

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
            type - string (opt: visit | pickup)
            status - string (opt: today | upcoming | done | cancelled)
            date - string (opt: Y-m-d) / from, to - string (opt: Y-m-d range)
        */
        public function displayAppointments(Request $json)
        {
            try {
                $query = Visit::query()->with('customer');
                // The bearer is resolved by the `api` guard (see the rest of
                // this controller): the default guard is the session `web`
                // one, which is always empty on a stateless API request, so
                // `$json->user()` made the master book unreachable for admins
                // AND pinned every customer to `cust_id = 0`.
                $user = $json->user('api');
                $wantsMaster = $json->input('scope') === 'master';
                $isMaster = $wantsMaster && $this->isAdmin($user);

                // FLOW-MANAGE_APP-01: the master appointment book belongs to
                // administrators. An employee asking for it gets a real 403
                // instead of the silent empty list it used to receive.
                if ($wantsMaster && $this->isEmployee($user) && ! $isMaster) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Administrator access is required to view all appointments.',
                    ], 403);
                }

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

                // FLOW-MANAGE_APP-04: filter by type. The grid stores CLAIM /
                // VISIT while the spec (and every filter on the admin page)
                // speaks pickup / visit, so the input is folded first.
                if ($json->has('type') && trim((string) $json->input('type')) !== '') {
                    $type = strtoupper(trim((string) $json->input('type')));
                    if (in_array($type, ['PICKUP', 'CLAIM', 'PREORDER'], true)) {
                        $type = 'CLAIM';
                    }
                    if ($type === 'VISIT') {
                        $type = 'VISIT';
                    }
                    $query->whereRaw('UPPER(appoint_type) = ?', [$type]);
                }

                // FLOW-MANAGE_APP-04: filter by date or date range.
                $this->filterByDateRange($query, $json);

                $this->filterByStatus($query, strtolower(trim((string) $json->input('status', ''))));

                // FLOW-MANAGE_BOOKED-02: the customer list is descending by
                // booking time, newest first.
                $appointments = $query->orderByDesc('appoint_created')->get();

                // REQ-ACCESS_LOG-01: reading the appointment list is logged.
                $user = $json->user('api');
                if ($user instanceof Customer) {
                    $this->logCustomer((int) $user->getKey(), 'view', 'GET /api/appoint/display');
                } elseif ($this->isEmployee($user)) {
                    $this->logEmployee((int) $user->emp_id, 'view',
                        'GET /api/appoint/display' . ($isMaster ? ' - master' : ''));
                }

                // SRS: APPOINTMENT has no order column - the link to the order a
                // claim is for lives in PICKUP (appoint_id -> ord_id), written by
                // POST /checkout/payment. Surfacing it here lets the ribbon's
                // Appointments list open the matching order without any schema
                // change. One extra query for the whole page, never per row.
                $orders = $this->ordersFor($appointments->pluck('appoint_id')->all());

                // FLOW-MANAGE_APP-02: the admin list renders the booking date
                // (`appoint_date`, the legacy alias of `appoint_start`) and the
                // customer's name / email straight from the row.
                $rows = $appointments->map(function (Visit $appointment) use ($orders) {
                    $link = $orders[(int) $appointment->appoint_id] ?? null;
                    $customer = $appointment->customer;
                    $extra = [
                        'appoint_date' => $appointment->appoint_start,
                    ];
                    if ($customer) {
                        $extra['customer_name'] = trim(
                            ($customer->cust_givname ?? '') . ' ' . ($customer->cust_surname ?? '')
                        );
                        $extra['cust_email'] = $customer->cust_email;
                        $extra['cust_nickname'] = $customer->cust_nickname;
                    }
                    if ($link !== null) {
                        $extra['ord_id'] = $link['ord_id'];
                        $extra['ord_status'] = $link['ord_status'];
                    }

                    return array_merge($appointment->toArray(), $extra);
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
                $query = Visit::query()->with('customer');
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

                        // FLOW-MANAGE_APP-03: admins search by customer name
                        // or email as well.
                        $builder->orWhereHas('customer', function ($customer) use ($q) {
                            $customer->where(function ($nested) use ($q) {
                                $nested->where('cust_givname', 'like', "%{$q}%")
                                    ->orWhere('cust_surname', 'like', "%{$q}%")
                                    ->orWhere('cust_email', 'like', "%{$q}%");
                            });
                        });
                    });
                }

                // FLOW-MANAGE_APP-02: same row shape as the list endpoint.
                $appointments = $query->get()->map(function (Visit $appointment) {
                    $customer = $appointment->customer;
                    $extra = ['appoint_date' => $appointment->appoint_start];
                    if ($customer) {
                        $extra['customer_name'] = trim(
                            ($customer->cust_givname ?? '') . ' ' . ($customer->cust_surname ?? '')
                        );
                        $extra['cust_email'] = $customer->cust_email;
                        $extra['cust_nickname'] = $customer->cust_nickname;
                    }

                    return array_merge($appointment->toArray(), $extra);
                });

                // REQ-ACCESS_LOG-01: reading the appointment search is logged.
                $this->logAppointmentView($json);

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
                $query = Visit::query();
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

                // REQ-ACCESS_LOG-01: reading the sorted appointment list is logged.
                $this->logAppointmentView($json);

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
            $validator = (new DatabaseAPI())->updateAppointmentDetails($json);
            if ($validator) return $validator;

            try {
                $appointId = $json->input('appoint_id');
                $appointment = Visit::where('appoint_id', $appointId)->first();

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

                // A finished booking is final: done / absent / cancelled rows
                // can never be moved or relabelled (they may only be viewed).
                if ($appointment->appoint_status !== null
                    && in_array($appointment->appoint_status, ['done', 'absent', 'cancelled'], true)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'This appointment is already ' . $appointment->appoint_status
                            . ' and can no longer be modified.'
                    ], 409);
                }

                // FLOW-MANAGE_BOOKED-05/06: `appoint_status = "cancelled"`
                // cancels the booking - status flips, the QR is deleted, the
                // customer is told (REQ-MANAGE_APP-04) and the change is
                // logged (REQ-MANAGE_APP-06). Only possible while the slot
                // has not ended.
                if (strtolower(trim((string) $json->input('appoint_status', ''))) === 'cancelled') {
                    if ($appointment->appoint_end !== null && $appointment->appoint_end->lt(now())) {
                        return response()->json([
                            'success' => false,
                            'message' => 'This slot has already ended and can no longer be cancelled.'
                        ], 409);
                    }

                    $appointment->update([
                        'appoint_status' => 'cancelled',
                        'appoint_qr'     => null,
                    ]);

                    $this->notifyCustomer((int) $appointment->cust_id,
                        '[PRIORITY] Your appointment #' . $appointment->appoint_id
                            . ' on ' . ($appointment->appoint_start ?? 'your booked slot')
                            . ' was cancelled.');

                    $actor = $json->user('api');
                    if ($actor instanceof Customer) {
                        $this->logCustomer((int) $actor->getKey(), 'edit',
                            'PUT /api/appoint/update - cancel appointment #' . $appointment->appoint_id);
                    } elseif ($this->isEmployee($actor)) {
                        $this->logEmployee((int) $actor->emp_id, 'edit',
                            'PUT /api/appoint/update - cancel appointment #' . $appointment->appoint_id);
                    }

                    return response()->json([
                        'success' => true,
                        'message' => 'Appointment cancelled successfully',
                        'data' => $appointment->fresh()
                    ], 200);
                }

                /*
                    FLOW-MANAGE_APP-06 / REQ-MANAGE_APP-05: an administrator
                    confirms a booking by hand when the QR scan is not an
                    option - `done` closes it, `absent` records the no-show.
                    Only admins may use it: a customer can never mark his own
                    appointment finished.
                */
                $requestedStatus = strtolower(trim((string) $json->input('appoint_status', '')));
                if (in_array($requestedStatus, ['done', 'absent'], true)) {
                    if (! $this->isAdmin($json->user('api'))) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Administrator access is required.'
                        ], 403);
                    }

                    $appointment->update([
                        'appoint_status' => $requestedStatus,
                        'appoint_closed' => $appointment->appoint_closed ?? now(),
                        'appoint_qr'     => null,
                    ]);

                    $this->notifyCustomer((int) $appointment->cust_id, $requestedStatus === 'done'
                        ? 'Your appointment #' . $appointment->appoint_id
                            . ' on ' . ($appointment->appoint_start ?? 'your booked slot')
                            . ' was completed. Thank you for coming!'
                        : 'Your appointment #' . $appointment->appoint_id
                            . ' on ' . ($appointment->appoint_start ?? 'your booked slot')
                            . ' was marked as a no-show.');

                    $doneActor = $json->user('api');
                    if ($this->isEmployee($doneActor)) {
                        $this->logEmployee((int) $doneActor->emp_id, 'edit',
                            'PUT /api/appoint/update - ' . $requestedStatus
                            . ' appointment #' . $appointment->appoint_id);
                    }

                    return response()->json([
                        'success' => true,
                        'message' => $requestedStatus === 'done'
                            ? 'Appointment completed successfully'
                            : 'Appointment marked as absent',
                        'data' => $appointment->fresh()
                    ], 200);
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

                /*
                    FLOW-MANAGE_APP-05: assigning the facilitating employee is
                    what mints the booking's QR code, so an admin can point an
                    appointment at a different employee and the code is issued
                    for the new assignment. (REQ-MANAGE_APP-02: exactly one.)
                */
                if ($json->filled('emp_id')) {
                    if (! $this->isAdmin($json->user('api'))) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Administrator access is required.'
                        ], 403);
                    }

                    $assigned = (int) $json->input('emp_id');
                    $employee = Employee::where('emp_id', $assigned)
                        ->whereNull('emp_deleted')
                        ->first();

                    if (! $employee) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Employee not found.'
                        ], 422);
                    }

                    $updates['emp_id'] = $assigned;
                    $updates['appoint_qr'] = $this->uniqueAppointmentQr((int) $appointment->appoint_id);
                }

                $rescheduled = false;
                if (isset($updates['appoint_start']) || isset($updates['appoint_type'])) {
                    $type = $this->normalizeType($updates['appoint_type'] ?? $appointment->appoint_type);
                    if ($type === null) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Appointment type must be pickup (claim) or visit.'
                        ], 422);
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
                    $start->minute(intdiv($start->minute, 10) * 10);
                    $duration = $this->slotDuration($type);
                    $end = $start->copy()->addMinutes($duration);

                    // FLOW-BOOK_APP-03: moving the slot is a new booking, so
                    // it must sit at least 30 minutes out. Relabelling the
                    // type alone keeps the stored slot and needs no lead.
                    if (isset($updates['appoint_start'])) {
                        $leadMinutes = max(0, (int) $this->settingValue('booking_lead_minutes', 30));
                        if ($start->lt(now()->addMinutes($leadMinutes))) {
                            return response()->json([
                                'success' => false,
                                'message' => 'Appointments can only be rescheduled at least '
                                    . $leadMinutes . ' minutes ahead.'
                            ], 422);
                        }
                    }
                    $minutes = $start->hour * 60 + $start->minute;
                    if ($minutes < self::OPEN_MINUTES || $minutes + $duration > self::CLOSE_MINUTES) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Selected time is outside operating hours.'
                        ], 422);
                    }
                    $state = $this->slotState($type, $start, $end, (int) $appointment->appoint_id);
                    if (! $state['available']) {
                        return response()->json(['success' => false, 'message' => $state['reason']], 409);
                    }
                    $updates['appoint_start'] = $start;
                    $updates['appoint_end'] = $end;
                    $updates['appoint_type'] = $type;
                    // REQ-MANAGE_APP-03: a rescheduled appointment gets a
                    // fresh QR code - the old one pointed at the old slot.
                    $updates['appoint_qr'] = $this->uniqueAppointmentQr((int) $appointment->appoint_id);
                    $rescheduled = true;
                }

                $appointment->update($updates);

                // REQ-MANAGE_APP-04 / FLOW-MANAGE_APP-08: assigning the
                // facilitating employee confirms the booking to the customer
                // (with the QR code they will present at the counter).
                if (isset($updates['emp_id'])) {
                    try {
                        $this->notifyCustomer((int) $appointment->cust_id,
                            '[PRIORITY] Employee #'. $updates['emp_id']
                                . ' will facilitate your appointment #'. $appointment->appoint_id
                                . ' on ' . ($appointment->appoint_start ?? 'your booked slot')
                                . '. Present QR code ' . ($appointment->fresh()->appoint_qr ?? '') . ' on arrival.');
                    } catch (\Throwable $e) {
                        // A notification must never fail the update.
                    }
                }

                // REQ-MANAGE_APP-04: the customer is told the slot moved.
                if ($rescheduled) {
                    $this->notifyCustomer((int) $appointment->cust_id,
                        '[PRIORITY] Your appointment #' . $appointment->appoint_id
                            . ' was rescheduled to ' . ($appointment->appoint_start ?? 'your new slot') . '.');
                }

                // REQ-ACCESS_LOG / REQ-MANAGE_APP-06: every modification lands
                // in the audit log.
                $actor = $json->user('api');
                if ($actor instanceof Customer) {
                    $this->logCustomer((int) $actor->getKey(), 'edit',
                        'PUT /api/appoint/update - appointment #' . $appointment->appoint_id);
                } elseif ($this->isEmployee($actor)) {
                    $this->logEmployee((int) $actor->emp_id, 'edit',
                        'PUT /api/appoint/update - appointment #' . $appointment->appoint_id);
                }

                return response()->json([
                    'success' => true,
                    'message' => $rescheduled
                        ? 'Appointment rescheduled successfully'
                        : 'Appointment details updated successfully',
                    'data' => $appointment->fresh()
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
        // RESCHEDULE REQUESTS (FLOW-MANAGE_APP-09)
        // ==========================================

        /*
            Opening a reschedule request
            ----------
            JSON REQUEST

            appoint_id - integer (req)
            reason - string (opt)
        */
        public function createRescheduleRequest(Request $json)
        {
            $appointId = (int) $json->input('appoint_id');
            if ($appointId <= 0) {
                return response()->json(['success' => false, 'message' => 'Appointment ID is required.'], 400);
            }

            $appointment = Visit::where('appoint_id', $appointId)->first();
            if (! $appointment) {
                return response()->json(['success' => false, 'message' => 'Appointment not found'], 404);
            }

            if ($appointment->appoint_status !== 'upcoming' || $appointment->appoint_closed) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only an open appointment can be rescheduled.',
                ], 409);
            }

            $reason = trim((string) $json->input('reason', ''));

            /*
                The request lives on the notification channel - the same
                channel the staff-shortage rule (Rule 10) already uses - so no
                reschedule table is needed. GET /appoint/reschedule-requests
                reads these rows back for the admin queue.
            */
            try {
                $this->notifyCustomer((int) $appointment->cust_id,
                    '[PRIORITY] Reschedule requested for appointment #' . $appointment->appoint_id
                        . ' on ' . ($appointment->appoint_start ?? 'your booked slot') . '.'
                        . ($reason !== '' ? ' Reason: ' . $reason . '.' : '')
                        . ' Please pick a new slot; the store will confirm the move.');
            } catch (\Throwable $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Could not record the reschedule request.',
                ], 500);
            }

            // REQ-MANAGE_APP-06: the request lands in the audit log.
            $actor = $json->user('api');
            if ($actor instanceof Customer) {
                $this->logCustomer((int) $actor->getKey(), 'edit',
                    'POST /api/appoint/reschedule-request - appointment #' . $appointment->appoint_id);
            } elseif ($this->isEmployee($actor)) {
                $this->logEmployee((int) $actor->emp_id, 'edit',
                    'POST /api/appoint/reschedule-request - appointment #' . $appointment->appoint_id);
            }

            return response()->json([
                'success' => true,
                'message' => 'Reschedule request recorded',
                'data'    => ['appoint_id' => (int) $appointment->appoint_id],
            ], 201);
        }

        /*
            FLOW-MANAGE_APP-09: the admin's reschedule-request queue - every
            still-open appointment whose customer notice asks for a reschedule
            (staff shortage or an explicit request), newest first. Derived
            from the notification channel; a move already made ("was
            rescheduled") or a closed appointment drops off the queue.
        */
        public function rescheduleRequests(Request $json)
        {
            try {
                $notices = CustNotif::where('custnotif_msg', 'LIKE', '%reschedul%')
                    ->orderByDesc('custnotif_created')
                    ->limit(500)
                    ->get();

                $requests = [];
                $resolved = [];

                foreach ($notices as $notice) {
                    $message = (string) $notice->custnotif_msg;

                    if (! preg_match('/appointment #(\d+)/i', $message, $match)) {
                        continue;
                    }
                    $appointId = (int) $match[1];

                    // The newest notice decides: a completed move closes the
                    // request that older notices may still describe.
                    if (stripos($message, 'was rescheduled') !== false) {
                        $resolved[$appointId] = true;
                        continue;
                    }
                    if (isset($resolved[$appointId]) || isset($requests[$appointId])) {
                        continue;
                    }

                    $appointment = Visit::where('appoint_id', $appointId)->first();
                    if (! $appointment
                        || $appointment->appoint_closed
                        || $appointment->appoint_status !== 'upcoming') {
                        continue;
                    }

                    $customer = Customer::where('cust_id', $appointment->cust_id)->first();

                    $requests[$appointId] = [
                        'appoint_id'    => $appointId,
                        'cust_id'       => (int) $appointment->cust_id,
                        'customer'      => trim(
                            ($customer->cust_givname ?? '') . ' ' . ($customer->cust_surname ?? '')
                        ),
                        'appoint_type'  => $appointment->appoint_type,
                        'appoint_start' => $appointment->appoint_start,
                        'appoint_end'   => $appointment->appoint_end,
                        'appoint_status'=> $appointment->appoint_status,
                        'appoint_qr'    => $appointment->appoint_qr,
                        'emp_id'        => $appointment->emp_id !== null ? (int) $appointment->emp_id : null,
                        'reason'        => $message,
                        'requested_at'  => $notice->custnotif_created,
                    ];
                }

                $this->logAppointmentView($json);

                return response()->json([
                    'success' => true,
                    'message' => 'Reschedule requests loaded successfully',
                    'data'    => array_values($requests),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to load reschedule requests',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        // ==========================================
        // SLOT AVAILABILITY RULES (REQ-AB-01 / REQ-AB-02 / REQ-AB-03 / REQ-SC-03)
        // ==========================================

        /*
            Applies one of the appointment filter pills - all, upcoming, done,
            absent or cancelled - to an appointment query (FLOW-MANAGE_BOOKED-02,
            FLOW-MANAGE_APP-04). The stored `appoint_status` column is the
            source of truth for the new vocabulary (upcoming | done | absent |
            cancelled); rows written before the column was populated fall back
            to the derived rules (closed = done, a lapsed open slot =
            cancelled). The master calendar and the "all" pill send no status
            at all. Unknown values are ignored, so the endpoint stays usable
            without a status.
        */
        protected function filterByStatus($query, string $status): void
        {
            $status = strtolower(trim($status));

            if ($status === '' || $status === 'all') {
                return;
            }

            if (! in_array($status, ['today', 'upcoming', 'done', 'absent', 'cancelled'], true)) {
                return;
            }

            $query->where(function ($builder) use ($status) {
                if ($status === 'today') {
                    // Legacy daily pill: today's open bookings.
                    $builder->whereNull('appoint_closed')
                        ->whereBetween('appoint_start', [now()->startOfDay(), now()->endOfDay()]);
                } elseif ($status === 'done') {
                    // Closed = completed unless it was a no-show or a cancel.
                    $builder->whereNotNull('appoint_closed')
                        ->where(function ($closed) {
                            $closed->whereNull('appoint_status')
                                ->orWhereNotIn('appoint_status', ['absent', 'cancelled']);
                        });
                } elseif ($status === 'upcoming') {
                    $builder->where('appoint_status', 'upcoming')
                        ->whereNull('appoint_closed')
                        ->where('appoint_end', '>=', now())
                        ->orWhere(function ($legacy) {
                            $legacy->whereNull('appoint_status')
                                ->whereNull('appoint_closed')
                                ->where('appoint_end', '>=', now());
                        });
                } elseif ($status === 'absent') {
                    $builder->where('appoint_status', 'absent');
                } else {
                    $builder->where('appoint_status', 'cancelled')
                        ->orWhere(function ($legacy) {
                            $legacy->whereNull('appoint_status')
                                ->whereNull('appoint_closed')
                                ->where('appoint_end', '<', now());
                        });
                }
            });
        }

        /*
            FLOW-MANAGE_APP-04: the admin list can be narrowed to one day
            (`date`) or to a date range (`date_from` / `from` and `date_to` /
            `to`). Every filter runs on `appoint_start`, the column the slot
            grid books against; with no date input nothing is applied, so the
            existing callers keep their behaviour.
        */
        protected function filterByDateRange($query, Request $json): void
        {
            $date = trim((string) $json->input('date', ''));
            $from = trim((string) $json->input('date_from', $json->input('from', '')));
            $to = trim((string) $json->input('date_to', $json->input('to', '')));

            if ($date !== '') {
                try {
                    $query->whereDate('appoint_start', Carbon::parse($date)->toDateString());
                } catch (\Throwable $e) {
                    // A malformed date must not take the whole list down.
                    return;
                }

                return;
            }

            try {
                if ($from !== '') {
                    $query->where('appoint_start', '>=', Carbon::parse($from)->startOfDay());
                }
                if ($to !== '') {
                    $query->where('appoint_start', '<=', Carbon::parse($to)->endOfDay());
                }
            } catch (\Throwable $e) {
                // Ignore an unparseable bound rather than fail the read.
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
            // Capacity: a pickup (CLAIM) block holds up to `pickup_slot_capacity`
            // open bookings, a VISIT holds exactly one (REQ-AB-01 / REQ-AB-02).
            $capacity = $this->slotCapacity($type);

            $bookedQuery = Visit::where('appoint_type', $type)
                ->whereNull('appoint_closed');
            if ($excludeId !== null) {
                $bookedQuery->where('appoint_id', '!=', $excludeId);
            }
            // Overlap semantics (appoint_start < block end AND appoint_end >
            // block start, like OrdersAPI::slotHasCapacity) so a legacy
            // longer row still occupies every block it spans.
            $booked = $bookedQuery
                ->where('appoint_start', '<', $end)
                ->where('appoint_end', '>', $start)
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
         * connection has no roster source (the Schedule model or its table
         * may be absent). Callers then skip only the staffing rule; the
         * capacity and slot-window rules always apply.
         */
        protected function rosterFor(Carbon $day): ?DayRoster
        {
            try {
                return DayRoster::for($day);
            } catch (\Throwable $e) {
                return null;
            }
        }

        /**
         * In-store headcount for one block, or null when unknown.
         *
         * Public because OrdersAPI runs the same staffing rule (REQ-AB-03)
         * when checkout books or moves a claim slot, so the calendar and the
         * checkout path can never disagree.
         *
         * The arguments are typed as DateTimeInterface, not Illuminate's
         * Carbon: the calendar builds its grid with Illuminate\Support\Carbon
         * while the checkout slot parser returns Carbon\Carbon - a sibling
         * class, not a subclass - so a hard Carbon hint made every pickup
         * checkout that carried an explicit `appoint_start` die on a
         * TypeError. Both are normalised here instead.
         */
        public function rosterHeadcount(\DateTimeInterface $start, \DateTimeInterface $end): ?int
        {
            $start = Carbon::instance($start);
            $end   = Carbon::instance($end);
            $roster = $this->rosterFor($start);

            return $roster ? $roster->headcount($start, $end) : null;
        }

        /** REQ-SS-03: blocks whose assignee is unavailable (0 when unknown). */
        protected function pendingReplacements(): int
        {
            try {
                return (int) Schedule::pendingReplacements();
            } catch (\Throwable $e) {
                return 0;
            }
        }

        // ==========================================
        // BOOKING VOCABULARY (system-new D21/D22)
        // ==========================================

        /**
         * Folds the client spelling onto the two stored appointment kinds:
         * `pickup` / `claim` -> CLAIM, `visit` / `VISIT` -> VISIT. The store
         * keeps `CLAIM` in the appointments table (matching the checkout path
         * and every legacy row), while the booking form speaks `pickup`.
         */
        protected function normalizeType($raw): ?string
        {
            $kind = strtoupper(trim((string) $raw));

            if (in_array($kind, ['CLAIM', 'PICKUP'], true)) {
                return 'CLAIM';
            }

            if ($kind === 'VISIT') {
                return 'VISIT';
            }

            return null;
        }

        /**
         * Length of one slot block. Business rule 11: "An appointment timeslot
         * must exactly be 10 minutes long" - the number is a hard rule, so the
         * `slot_minutes` setting can never push a block away from ten minutes
         * (the same clamp is applied where OrdersAPI and the staff-shortage
         * sweep read it).
         */
        protected function slotDuration(string $type): int
        {
            return 10;
        }

        /**
         * How many open bookings a block holds before it is full. Business
         * rule 12: "A timeslot can have zero to 5 pickup appointments and only
         * 1 visit appointment" - the configured caps are honoured only while
         * they stay inside that ceiling.
         */
        protected function slotCapacity(string $type): int
        {
            return $type === 'CLAIM'
                ? max(1, min(5, (int) $this->settingValue('pickup_slot_capacity', 5)))
                : max(1, min(1, (int) $this->settingValue('visit_slot_capacity', 1)));
        }

        /**
         * REQ-ACCESS_LOG-01: reading the appointment search / sort results is
         * recorded on the reading account. Best-effort - the CacheReads
         * middleware short-circuits cached GETs, so a repeat view within the
         * cache window is not logged twice.
         */
        protected function logAppointmentView(Request $json): void
        {
            try {
                $user = $json->user('api');
                if ($user instanceof Customer) {
                    $this->logCustomer((int) $user->getKey(), 'view', 'GET ' . $json->path());
                } elseif ($this->isEmployee($user)) {
                    $this->logEmployee((int) $user->emp_id, 'view', 'GET ' . $json->path());
                }
            } catch (\Throwable $e) {
                // An audit write must never break the endpoint it describes.
            }
        }

        /**
         * FLOW-BOOK_APP-06 / REQ-MANAGE_APP-02: the appointment QR must be
         * unique. The live schema carries no unique index on `appoint_qr`,
         * so uniqueness is enforced here by regenerating on the (vanishingly
         * unlikely) collision before the code is persisted.
         */
        protected function uniqueAppointmentQr(?int $exceptId = null): string
        {
            do {
                $qr = 'APPT-' . strtoupper(Str::random(16));
                $clash = Visit::where('appoint_qr', $qr);
                if ($exceptId !== null) {
                    $clash->where('appoint_id', '!=', $exceptId);
                }
            } while ($clash->exists());

            return $qr;
        }

        /**
         * REQ-MANAGE_APP-07: an appointment that outlived its window by ten
         * minutes auto-closes. Visit bookings are closed by this sweep; a
         * pickup booking that was never scanned is closed by
         * OrdersAPI::sweepExpiredPickups on the same ten-minute rule.
         *
         * REQ-MANAGE_APP-05: a visit nobody ever scanned is a no-show, so it
         * lands on `absent` - `done` is reserved for bookings that were
         * actually confirmed (a QR scan or an admin's manual confirmation).
         *
         * Public because routes/console.php schedules it.
         */
        public function autoCloseExpired(): void
        {
            $cutoff = now()->subMinutes(10);

            try {
                $expired = Visit::where('appoint_type', 'VISIT')
                    ->where('appoint_status', 'upcoming')
                    ->whereNull('appoint_closed')
                    ->whereNotNull('appoint_end')
                    ->where('appoint_end', '<', $cutoff)
                    ->orderBy('appoint_id')
                    ->limit(500)
                    ->get();

                foreach ($expired as $appointment) {
                    $appointment->update([
                        'appoint_status' => 'absent',
                        'appoint_closed' => $appointment->appoint_closed ?? now(),
                    ]);

                    // FLOW-MANAGE_APP-11 / REQ-ACCESS_LOG: the automatic
                    // closure is attributed to the facilitating employee's
                    // activity log. Best-effort - the sweep must not fail.
                    try {
                        if (! empty($appointment->emp_id)) {
                            $this->logEmployee((int) $appointment->emp_id, 'auto-close',
                                'Auto-closed visit appointment #'. $appointment->appoint_id
                                . ' (no-show, window expired)');
                        }
                    } catch (\Throwable $e) {
                        // An audit write must never stop the sweep.
                    }

                    // REQ-MANAGE_APP-04: the window closing is a status change,
                    // so the customer hears about it.
                    try {
                        $this->notifyCustomer((int) $appointment->cust_id,
                            '[PRIORITY] Your visit appointment #' . $appointment->appoint_id
                                . ' on ' . ($appointment->appoint_start ?? 'your booked slot')
                                . ' was not attended and has closed. '
                                . 'Please book a new slot if you still need to visit the store.');
                    } catch (\Throwable $e) {
                        // A notification must never stop the sweep.
                    }
                }
            } catch (\Throwable $e) {
                // The sweep must never take the scheduler down.
            }
        }
}
