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

class AppointmentsAPI extends Controller
{

        protected const openMinutes = 8 * 60;
        protected const closeMinutes = 18 * 60;

        public function closeAppointment(Request $json)
        {
            $validator = (new DatabaseAPI())->closeAppointment($json);
            if ($validator) return $validator;

            try {
                $appointId = $json->input('appoint_id');
                $reason = trim((string) $json->input('reason', ''));
                $appointment = Visit::where('appoint_id', $appointId)->first();

                if (!$appointment) {
                    return response()->json(['success' => false, 'message' => 'Appointment not found.'], 404);
                }

                if ($appointment->appoint_closed) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Closed appointments cannot be closed again.'
                    ], 409);
                }

                $appointment->update([
                    'appoint_closed' => now(),
                    'appoint_status' => 'cancelled',
                    'appoint_qr'     => null,
                ]);

                $start = $appointment->appoint_start;
                $message = '[PRIORITY] Your appointment #' . $appointment->appoint_id .
                    ' scheduled on ' . $start . ' was closed.';
                if ($reason !== '') {
                    $message .= ' Reason: ' . $reason;
                }
                $this->notifyCustomer((int) $appointment->cust_id, $message);

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

        public function displaySlots(Request $json)
        {
            $validator = (new DatabaseAPI())->displaySlots($json);
            if ($validator) return $validator;

            try {
                $date = $json->input('date');
                if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Please provide a valid date (YYYY-MM-DD).'
                    ], 400);
                }

                try {
                    $base = Carbon::createFromFormat('Y-m-d', $date)->startOfDay();
                } catch (\Throwable $e) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Please provide a valid date (YYYY-MM-DD).'
                    ], 400);
                }

                $open = $base->format('Y-m-d H:i:s');
                $close = $base->copy()->addDay()->format('Y-m-d H:i:s');
                $custId = $this->customerId($json);
                $bookedRows = Visit::whereNull('appoint_closed')
                    ->where('appoint_start', '>=', $open)
                    ->where('appoint_start', '<', $close)
                    ->get(['appoint_type', 'appoint_start', 'appoint_end', 'cust_id']);
                $roster = $this->rosterFor($base);
                $capacities = [
                    'CLAIM' => $this->slotCapacity('CLAIM'),
                    'VISIT' => $this->slotCapacity('VISIT'),
                ];
                $minStaff = ['CLAIM' => 1, 'VISIT' => 1];
                $pendingReplacements = $this->pendingReplacements();

                $slots = [];
                foreach (['CLAIM' => $this->slotDuration('CLAIM'), 'VISIT' => $this->slotDuration('VISIT')] as $type => $duration) {
                    for ($minutes = self::openMinutes; $minutes + $duration <= self::closeMinutes; $minutes += $duration) {
                        $start = $base->copy()->addMinutes($minutes);
                        $end = $start->copy()->addMinutes($duration);
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
                            'booked'    => $custId !== null && ! $mine ? 0 : $booked,
                            'capacity'  => $capacities[$type],
                            'in_store'  => $inStore,
                            'available' => $reason === null,
                            'reason'    => $reason,
                            'mine'      => $mine,
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

        public function createAppointment(Request $json)
        {
            if (! $json->filled('appoint_date') && $json->filled('appoint_start')) {
                $json->merge(['appoint_date' => $json->input('appoint_start')]);
            }

            $validator = (new DatabaseAPI())->createAppointment($json);
            if ($validator) return $validator;

            try {
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

                $leadMinutes = max(0, (int) $this->settingValue('booking_lead_minutes', 30));
                if ($slotStart->lt(now()->addMinutes($leadMinutes))) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Appointments must be booked at least ' . $leadMinutes . ' minutes ahead.'
                    ], 422);
                }

                $minutes = $slotStart->hour * 60 + $slotStart->minute;
                if ($minutes < self::openMinutes || $minutes + $duration > self::closeMinutes) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Selected time is outside operating hours (8:00 AM - 6:00 PM).'
                    ], 409);
                }

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

                    return Visit::create([
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

                $this->consumeOtp($json, 'appointment');

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
                }

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

        public function displayAppointments(Request $json)
        {
            try {
                $query = Visit::query()->with('customer');
                $user = $json->user('api');
                $wantsMaster = $json->input('scope') === 'master';
                $isMaster = $wantsMaster && $this->isAdmin($user);

                if ($wantsMaster && $this->isEmployee($user) && ! $isMaster) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Administrator access is required to view all appointments.',
                    ], 403);
                }

                if ($this->isEmployee($user)) {
                    if ($isMaster) {
                    } elseif ($json->filled('cust_id')) {
                        $query->where('cust_id', $json->input('cust_id'));
                    } else {
                        $query->whereRaw('1 = 0');
                    }
                } else {
                    $query->where('cust_id', $user ? $user->getKey() : 0);
                }

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

                $this->filterByDateRange($query, $json);

                $this->filterByStatus($query, strtolower(trim((string) $json->input('status', ''))));

                $appointments = $query->orderByDesc('appoint_created')->get();

                $user = $json->user('api');
                if ($user instanceof Customer) {
                    $this->logCustomer((int) $user->getKey(), 'view', 'GET /api/appoint/display');
                } elseif ($this->isEmployee($user)) {
                    $this->logEmployee((int) $user->emp_id, 'view',
                        'GET /api/appoint/display' . ($isMaster ? ' - master' : ''));
                }

                $orders = $this->ordersFor($appointments->pluck('appoint_id')->all());

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
                } elseif ($json->filled('cust_id')) {
                    $query->where('cust_id', $json->input('cust_id'));
                } else {
                    $query->whereRaw('1 = 0');
                }

                if (!empty($q)) {
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

                        $builder->orWhereHas('customer', function ($customer) use ($q) {
                            $customer->where(function ($nested) use ($q) {
                                $nested->where('cust_givname', 'like', "%{$q}%")
                                    ->orWhere('cust_surname', 'like', "%{$q}%")
                                    ->orWhere('cust_email', 'like', "%{$q}%");
                            });
                        });
                    });
                }

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
                } elseif ($json->filled('cust_id')) {
                    $query->where('cust_id', $json->input('cust_id'));
                } else {
                    $query->whereRaw('1 = 0');
                }

                $appointments = $query->orderBy($col, $order)->get();

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

        public function updateAppointmentDetails(Request $json)
        {
            $validator = (new DatabaseAPI())->updateAppointmentDetails($json);
            if ($validator) return $validator;

            try {
                $appointId = $json->input('appoint_id');
                $appointment = Visit::where('appoint_id', $appointId)->first();

                if (! $appointment) {
                    return response()->json(['success' => false, 'message' => 'Appointment not found.'], 404);
                }

                $customerId = $this->customerId($json);
                if ($customerId !== null) {
                    if ((int) $appointment->cust_id !== $customerId) {
                        return response()->json(['success' => false, 'message' => 'Appointment not found.'], 404);
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

                if ($appointment->appoint_status !== null
                    && in_array($appointment->appoint_status, ['done', 'absent', 'cancelled'], true)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'This appointment is already ' . $appointment->appoint_status
                            . ' and can no longer be modified.'
                    ], 409);
                }

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

                $requested = $this->requestedStart($json);
                $updates = [];
                if (is_string($requested) && trim($requested) !== '') {
                    $updates['appoint_start'] = $requested;
                }
                if ($json->filled('appoint_type')) {
                    $updates['appoint_type'] = $json->input('appoint_type');
                }

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
                    if ($minutes < self::openMinutes || $minutes + $duration > self::closeMinutes) {
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
                    $updates['appoint_qr'] = $this->uniqueAppointmentQr((int) $appointment->appoint_id);
                    $rescheduled = true;
                }

                $appointment->update($updates);

                if (isset($updates['emp_id'])) {
                    try {
                        $this->notifyCustomer((int) $appointment->cust_id,
                            '[PRIORITY] Employee #'. $updates['emp_id']
                                . ' will facilitate your appointment #'. $appointment->appoint_id
                                . ' on ' . ($appointment->appoint_start ?? 'your booked slot')
                                . '. Present QR code ' . ($appointment->fresh()->appoint_qr ?? '') . ' on arrival.');
                    } catch (\Throwable $e) {
                    }
                }

                if ($rescheduled) {
                    $this->notifyCustomer((int) $appointment->cust_id,
                        '[PRIORITY] Your appointment #' . $appointment->appoint_id
                            . ' was rescheduled to ' . ($appointment->appoint_start ?? 'your new slot') . '.');
                }

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

        public function createRescheduleRequest(Request $json)
        {
            $appointId = (int) $json->input('appoint_id');
            if ($appointId <= 0) {
                return response()->json(['success' => false, 'message' => 'Appointment ID is required.'], 400);
            }

            $appointment = Visit::where('appoint_id', $appointId)->first();
            if (! $appointment) {
                return response()->json(['success' => false, 'message' => 'Appointment not found.'], 404);
            }

            if ($appointment->appoint_status !== 'upcoming' || $appointment->appoint_closed) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only an open appointment can be rescheduled.',
                ], 409);
            }

            $reason = trim((string) $json->input('reason', ''));

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
                    $builder->whereNull('appoint_closed')
                        ->whereBetween('appoint_start', [now()->startOfDay(), now()->endOfDay()]);
                } elseif ($status === 'done') {
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

        protected function filterByDateRange($query, Request $json): void
        {
            $date = trim((string) $json->input('date', ''));
            $from = trim((string) $json->input('date_from', $json->input('from', '')));
            $to = trim((string) $json->input('date_to', $json->input('to', '')));

            if ($date !== '') {
                try {
                    $query->whereDate('appoint_start', Carbon::parse($date)->toDateString());
                } catch (\Throwable $e) {
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
            }
        }

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

        protected function slotState(string $type, Carbon $start, Carbon $end, ?int $excludeId = null): array
        {
            $capacity = $this->slotCapacity($type);

            $bookedQuery = Visit::where('appoint_type', $type)
                ->whereNull('appoint_closed');
            if ($excludeId !== null) {
                $bookedQuery->where('appoint_id', '!=', $excludeId);
            }
            $booked = $bookedQuery
                ->where('appoint_start', '<', $end)
                ->where('appoint_end', '>', $start)
                ->count();

            $minStaff = 1;
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
                'pending_replacements' => $this->pendingReplacements(),
            ];
        }

        protected function requestedStart(Request $json)
        {
            $start = $json->input('appoint_start');

            return ($start === null || $start === '') ? $json->input('appoint_date') : $start;
        }

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

        protected function rosterFor(Carbon $day): ?DayRoster
        {
            try {
                return DayRoster::for($day);
            } catch (\Throwable $e) {
                return null;
            }
        }

        public function rosterHeadcount(\DateTimeInterface $start, \DateTimeInterface $end): ?int
        {
            $start = Carbon::instance($start);
            $end   = Carbon::instance($end);
            $roster = $this->rosterFor($start);

            return $roster ? $roster->headcount($start, $end) : null;
        }

        protected function pendingReplacements(): int
        {
            try {
                return (int) Schedule::pendingReplacements();
            } catch (\Throwable $e) {
                return 0;
            }
        }

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

        protected function slotDuration(string $type): int
        {
            return 10;
        }

        protected function slotCapacity(string $type): int
        {
            return $type === 'CLAIM'
                ? max(1, min(5, (int) $this->settingValue('pickup_slot_capacity', 5)))
                : max(1, min(1, (int) $this->settingValue('visit_slot_capacity', 1)));
        }

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
            }
        }

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

                    try {
                        if (! empty($appointment->emp_id)) {
                            $this->logEmployee((int) $appointment->emp_id, 'auto-close',
                                'Auto-closed visit appointment #'. $appointment->appoint_id
                                . ' (no-show, window expired)');
                        }
                    } catch (\Throwable $e) {
                    }

                    try {
                        $this->notifyCustomer((int) $appointment->cust_id,
                            '[PRIORITY] Your visit appointment #' . $appointment->appoint_id
                                . ' on ' . ($appointment->appoint_start ?? 'your booked slot')
                                . ' was not attended and has closed. '
                                . 'Please book a new slot if you still need to visit the store.');
                    } catch (\Throwable $e) {
                    }
                }
            } catch (\Throwable $e) {
            }
        }
}
