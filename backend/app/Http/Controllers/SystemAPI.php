<?php

namespace App\Http\Controllers;

use App\Models\CustLog;
use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\EmpLog;
use App\Models\EmpNotif;
use App\Models\Employee;
use App\Models\Schedule;
use App\Services\ReportBuilder;
use App\Support\EmployeePassword;
use App\Support\SystemSettings;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

/**
 * SystemAPI
 *
 * DOMAIN 1 / 5 / 6 / 7 / 14 / 15 / 31 / 32 - system-wide concerns: setup, settings, scheduling, notifications, analytics, access logs, monitoring/suspension and API<->model integration.
 *
 * Repackaged from: Settings API, Setup API, Shift API, Notif API, Reports API, Health API, Accounts API, Access API.
 */
class SystemAPI extends Controller
{

    // ===== from the Setup API file =====
/**
 * DOMAIN 1 - SETUP.
 *
 * FLOW-SETUP-05: a setup wizard has to be able to ask the system what is
 * still missing and to mint the very first super admin (FLOW-SETUP-04) with a
 * securely generated, stored password (REQ-SETUP-03).
 *
 * Nothing here may create a row unless the store has no employees at all:
 * `POST /setup/initialize` is a one-shot bootstrap, so against a database
 * that already holds a staff roster it answers 409 and changes nothing.
 *
 * Configuration is written to the SystemSettings JSON document, never to the
 * database - the SCHEMA lists no settings table (FLOW-SETUP-01).
 */

    // ===== from the Setup API file =====

    /** The only store configuration the wizard is allowed to write (FLOW-SETUP-01). */
    private const CONFIG_KEYS = [
        'store_name' => 'string',
        'store_location' => 'string',
        'store_contact' => 'string',
        'operating_hours' => 'string',
    ];

    /** Rule 27 / REQ-EMP_ENROLL-02: staff identities live on the university domain. */
    private const BICOL_DOMAIN = '@bicol-u.edu.ph';

    /*
        GET /api/setup/status  (public - nothing is authenticated yet)
    */
    public function status()
    {
        try {
            return $this->performStatus();
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not read the setup status. Please try again.', 500);
        }
    }

    private function performStatus()
    {
        $missing = SystemSettings::missingCritical();

        return response()->json([
            'success' => true,
            'message' => 'Setup status retrieved successfully.',
            'data'    => [
                // REQ-SETUP-02: false until every critical field is filled.
                'setup_complete' => count($missing) === 0,
                'missing_critical' => $missing,
                // FLOW-SETUP-04: the wizard only has an account to create
                // while the roster is empty.
                'needs_initial_super_admin' => $this->rosterEmpty(),
                'bicol_domain' => self::BICOL_DOMAIN,
                'store' => [
                    'store_name'      => (string) SystemSettings::get('store_name', ''),
                    'store_location'  => (string) SystemSettings::get('store_location', ''),
                    'store_contact'   => (string) SystemSettings::get('store_contact', ''),
                    'operating_hours' => (string) SystemSettings::get('operating_hours', ''),
                ],
            ],
        ], 200);
    }

    /*
        POST /api/setup/initialize  (public, throttled - one-shot bootstrap)

        JSON REQUEST
        email    - string (req - Bicol University address)
        surname  - string (req)
        givname  - string (req)
        phone    - string (req)
        password - string (opt - generated when absent; must clear REQ-SETUP-03)
        store_name / store_location / store_contact / operating_hours - opt
    */
    public function initialize(Request $json)
    {
        if (! $this->rosterEmpty()) {
            return response()->json([
                'success' => false,
                'code'    => 'ALREADY_INITIALIZED',
                'message' => 'The store already has employees. Ask a super admin to enroll you instead.',
            ], 409);
        }

        // REQ-SETUP-01: every posted value is validated before anything is
        // written - to the settings document or to the database.
        $email = strtolower(trim((string) $json->input('email', '')));
        $surname = trim((string) $json->input('surname', ''));
        $givname = trim((string) $json->input('givname', ''));
        $phone = trim((string) $json->input('phone', ''));

        if ($email === '' || $surname === '' || $givname === '' || $phone === '') {
            return response()->json([
                'success' => false,
                'message' => 'Email, surname, given name and phone are required.',
            ], 422);
        }

        if (! str_ends_with($email, self::BICOL_DOMAIN)) {
            return response()->json([
                'success' => false,
                'message' => 'The super admin email must be a Bicol University address (' . self::BICOL_DOMAIN . ').',
            ], 422);
        }

        if (Employee::where('emp_email', $email)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Email already exists',
            ], 409);
        }

        // FLOW-SETUP-04: secure password generation. A wizard may hand one in
        // instead, but REQ-SETUP-03 decides whether it is good enough.
        $generated = false;
        $password = (string) $json->input('password', '');

        if ($password === '') {
            $password = EmployeePassword::generateTemporary(20);
            $generated = true;
        } elseif (! EmployeePassword::meetsStandard($password)) {
            return response()->json([
                'success' => false,
                'code'    => 'WEAK_PASSWORD',
                'message' => 'Super admin passwords must be at least 16 characters and include an uppercase letter, a lowercase letter, a number and a symbol.',
            ], 422);
        }

        // REQ-SETUP-02: configuration is saved only when the critical fields
        // it carries are all non-empty - a partial block may never half-apply.
        $config = [];
        foreach (self::CONFIG_KEYS as $key => $_type) {
            if ($json->has($key)) {
                $config[$key] = trim((string) $json->input($key));
            }
        }

        $configuring = count($config) > 0;
        if ($configuring) {
            foreach ($config as $value) {
                if ($value === '') {
                    return response()->json([
                        'success' => false,
                        'code'    => 'INCOMPLETE_CONFIG',
                        'message' => 'Critical configuration fields may not be left empty.',
                    ], 422);
                }
            }
        }

        try {
            $employee = Employee::forceCreate($this->existingColumns('employee', [
                'emp_created'  => now(),
                'emp_password' => EmployeePassword::make($password),
                'emp_surname'  => $surname,
                'emp_givname'  => $givname,
                'emp_midname'  => '',
                'emp_suffix'   => '',
                'emp_pronoun'  => 'they/them',
                'emp_callcode' => '+63',
                'emp_phone'    => $phone,
                'emp_email'    => $email,
                'emp_categ'    => 'super admin',
                'emp_type'     => 'SUPER ADMIN',
                // existingColumns() keeps only the spelling the connected
                // schema carries (emp_instore on the fixture, emp_present on
                // live), so the account opens as not in-store either way.
                'emp_instore'  => false,
                'emp_present'  => false,
                // FLOW-SETUP-04: the account opens active, never suspended.
                'emp_suspended' => null,
                'emp_deleted'   => null,
            ]));

            if ($configuring) {
                SystemSettings::putMany($config);
            }

            // REQ-SETUP-04: the setup action is logged for audit, filed under
            // the id of the account it just created.
            $this->logEmployee((int) $employee->emp_id, 'edit',
                'POST /api/setup/initialize - initial super admin created'
                . ($configuring ? ' and configuration saved' : ''));

            return response()->json([
                'success' => true,
                'message' => $generated
                    ? 'Setup complete. Your super admin account is ready - copy the generated password now, it is shown once.'
                    : 'Setup complete. Your super admin account is ready.',
                'data'    => array_merge($employee->toArray(), [
                    'setup_complete' => count(SystemSettings::missingCritical()) === 0,
                    // Only a generated secret is echoed back; a chosen one is
                    // already stored as a bcrypt digest and never round-trips.
                    'generated_password' => $generated ? $password : null,
                    'must_change_password' => $generated,
                ]),
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Setup failed',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /** True while no employee row exists - the only state a bootstrap may run in. */
    private function rosterEmpty(): bool
    {
        try {
            return ! Employee::query()->exists();
        } catch (\Throwable $e) {
            return false;
        }
    }

    // ==========================================
    // SYSTEM-WIDE SETTINGS (shared, rule 76)
    // ==========================================

    /**
     * The system-wide half of a settings payload: every SystemSettings value
     * plus the FLOW-SETUP-01 readiness flags. SystemAPI owns the system
     * settings document, so UserAPI's routed displaySettings endpoint reuses
     * this instead of duplicating the read (rule 76).
     */
    public function systemSettingsPayload(): array
    {
        $settings = SystemSettings::all();

        $missing = SystemSettings::missingCritical();
        $settings['setup_complete'] = count($missing) === 0;
        $settings['missing_critical'] = $missing;

        return $settings;
    }

    /**
     * Validates and writes a batch of system-wide settings (D1 / REQ-SETUP-01).
     *
     * Every value is validated BEFORE anything is saved, and a document that
     * could not be written answers with a real error - a super admin must
     * never be told "saved" while the change only ever lived in this one
     * request.
     *
     * @return \Illuminate\Http\JsonResponse|null null on success, or the
     *         422 / 500 error envelope the caller should return as-is.
     */
    public function applySystemSettings(array $system)
    {
        if (empty($system)) {
            return null;
        }

        foreach ($system as $key => $value) {
            $problem = SystemSettings::invalid((string) $key, $value);
            if ($problem !== null) {
                return response()->json([
                    'success' => false,
                    'message' => $problem,
                ], 422);
            }
        }

        if (! SystemSettings::putMany($system)) {
            return response()->json([
                'success' => false,
                'message' => 'System settings could not be written to storage. Nothing was saved.',
            ], 500);
        }

        return null;
    }

    // ===== from the Shift API file =====

    // Fields a staff member may submit through the schedule UI
    const SHIFT_FIELDS = ['emp_id', 'shift_date', 'shift_start', 'shift_end', 'unavailable'];

    // FLOW-EMP_SCHED-04: the employee's own "unavailable" flag. The request
    // spelling is a plain boolean; `schedules` stores it as the timestamp the
    // exception was logged (REQ-SS-01), which is also what makes the block
    // permanently distinct from a freshly prescheduled one.
    const SHIFT_UNAVAILABLE_FIELD = 'unavailable';

    /*
        Listing duty shifts
        ----------
        QUERY PARAMS (all optional)
        emp_id, date, date_from, date_to, status
    */
    public function displayShifts(Request $json)
    {
        try {
            return $this->performDisplayShifts($json);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not retrieve the duty shifts. Please try again.', 500);
        }
    }

    private function performDisplayShifts(Request $json)
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
        $validator = (new DatabaseAPI())->createShift($json);
        if ($validator) return $validator;

        // DOMAIN 7 - every preschedule is validated before the row exists:
        // the 10-minute grid, the 24-hour past limit, overlapping blocks and
        // the weekly minimum (FLOW-EMP_SCHED-03/05, REQ-EMP_SCHED-01/03/04).
        $start = $this->windowStart($json);
        $end   = $this->windowEnd($json);
        if ($start === null || $end === null) {
            return $this->fail('A schedule block needs both a start and an end time.');
        }

        $blocked = $this->shiftWindowBlocked(
            $json,
            (int) $json->input('emp_id'),
            $start,
            $end
        );
        if ($blocked) return $blocked;

        try {
            // FLOW-EMP_SCHED-08 / REQ-EMP_SCHED-05: every roster write is
            // attributed to the employee who made it, with its timestamp.
            $this->logActor($json, 'edit', 'POST /api/shifts');

            $start = $this->windowStart($json);
            $end   = $this->windowEnd($json);

            $shift = Schedule::create([
                // SYSTEM RULE / App\Support\IdAllocator: `schedules.sched_id` is
                // a bare bigint NOT NULL primary key with no sequence, identity
                // or column default on the live connection, so an Eloquent insert
                // that omits the key dies on a NOT NULL violation. The number is
                // allocated here - INSIDE the same statement the window is
                // resolved from, before the row is written - exactly as
                // ProductsAPI::addProduct allocates product.prod_id /
                // prodvar.prodvar_id and UserAPI::prescheduleNewEmployee
                // allocates its baseline block.
                'sched_id'         => $this->nextId('schedules', 'sched_id'),
                'emp_id'         => (int) $json->input('emp_id'),
                'sched_time_start' => $start,
                'sched_time_end'   => $end,
                'sched_created'  => now(),
                'sched_disabled' => null,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Duty shift created successfully',
                'data'    => $this->shiftPayload($shift->load('employee')),
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to create duty shift.',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Updating a duty shift
        ----------
        JSON REQUEST (route supplies the shift id)
        any of emp_id, shift_date, shift_start, shift_end, emp_instore,
        unavailable
    */
    public function updateShift(Request $json, $shiftId)
    {
        $shift = Schedule::with('employee')->find($shiftId);
        if (! $shift) {
            return response()->json(['success' => false, 'message' => 'Duty shift not found'], 404);
        }

        /*
            FLOW-EMP_SCHED-04: "Employees must be able to view their own
            schedule and mark specific time blocks as 'unavailable'".

            Rule 38 keeps the rest of the roster with the super admins, so a
            non-admin caller may touch ONE field on ONE block - their own
            `unavailable` exception - and nothing else. Admins and super admins
            keep every field exactly as before. The block itself is still
            validated against the same rules (the 10-minute grid, the overlap
            rule, the weekly floor and the REQ-SS-02 deadline) and still costs
            the same REQ-SS-03 announcement when it stops staffing the roster.
        */
        $actor = $json->user('api');
        $isAdmin = $actor instanceof Employee && ($this->isSuperAdmin($actor) || $actor->isAdmin());

        if (! $isAdmin) {
            if (! $actor instanceof Employee || (int) $actor->getKey() !== (int) $shift->emp_id) {
                return response()->json([
                    'success' => false,
                    'message' => 'You may only change your own schedule (rule 38).',
                ], 403);
            }

            // Every roster field stays with the admins; the employee's own
            // exception is the single value a non-admin may send.
            $adminOnly = [
                'emp_id', 'shift_date', 'shift_start', 'shift_end',
                'emp_instore', 'shift_type', 'shift_location', 'status',
            ];
            $attempted = array_values(array_filter(
                array_keys($json->all()),
                fn ($key) => in_array($key, $adminOnly, true)
            ));

            if ($attempted !== []) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only your own availability exception can be changed here. '
                        . 'A super admin preschedules and amends duty blocks.',
                ], 403);
            }
        }

        // Captured before anything is written so "the block just lost its
        // assignee" is decided against the stored state, not the edited one.
        $wasStaffed = $shift->isStaffed();

        // The stored block is needed so a partial update is still checked
        // against the window it will end up with.
        $validator = (new DatabaseAPI())->updateShift($json, $shift);
        if ($validator) return $validator;

        // The window is one value pair, so a partial update is applied
        // onto the stored one instead of overwriting half of it. It is
        // resolved BEFORE the row is touched, so the DOMAIN 7 rules below
        // judge the block as it will be stored.
        $start = $this->windowStart($json, $shift);
        $end   = $this->windowEnd($json, $shift);

        $storedStart = $shift->sched_time_start;
        $storedEnd   = $shift->sched_time_end;

        $windowChanged = ($start !== null && (! $storedStart || ! $start->equalTo($storedStart)))
            || ($end !== null && (! $storedEnd || ! $end->equalTo($storedEnd)));

        $resultingStart = $start ?? $storedStart;
        $resultingEnd   = $end ?? $storedEnd;

        if ($windowChanged && $resultingStart && $resultingEnd) {
            $empId = (int) ($json->input('emp_id') ?: $shift->emp_id);
            $blocked = $this->shiftWindowBlocked(
                $json,
                $empId,
                $resultingStart,
                $resultingEnd,
                (int) $shift->sched_id
            );
            if ($blocked) return $blocked;
        }

        try {
            // Availability is a separate change from the block fields: it is
            // gated by REQ-SS-02 and cross-referenced against open bookings by
            // REQ-SS-03.
            if ($json->has('emp_instore')) {
                $blocked = $this->availabilityDeadlineBlocked($json, (int) $shift->emp_id);
                if ($blocked) return $blocked;
                $this->changeAvailability($shift, $json->boolean('emp_instore'));
            }

            // FLOW-EMP_SCHED-04: the employee's own "unavailable" exception on
            // one block. Same REQ-SS-02 deadline as a store-wide availability
            // change, and the same REQ-SS-03 consequence: the block stops
            // staffing the roster, so an affected booking is told to
            // reschedule and the super admins are told to find a substitute.
            if ($json->has(self::SHIFT_UNAVAILABLE_FIELD)) {
                $unavailable = $json->boolean(self::SHIFT_UNAVAILABLE_FIELD);

                $blocked = $this->availabilityDeadlineBlocked($json, (int) $shift->emp_id);
                if ($blocked) return $blocked;

                if ($unavailable && $shift->sched_disabled === null) {
                    // REQ-EMP_SCHED-01: a disabled block no longer counts toward
                    // the weekly floor, so the week is re-judged without it.
                    $weekMinutes = $this->weekMinutes(
                        (int) $shift->emp_id,
                        $shift->sched_time_start,
                        $shift->sched_time_end,
                        (int) $shift->sched_id
                    ) - $shift->minutes();

                    $floor = $this->weeklyFloorProblem($weekMinutes);
                    if ($floor !== null) return $floor;

                    $shift->sched_disabled = now();
                } elseif (! $unavailable && $shift->sched_disabled !== null) {
                    // Clearing the exception restores the block, so the week is
                    // judged WITH it again.
                    $weekMinutes = $this->weekMinutes(
                        (int) $shift->emp_id,
                        $shift->sched_time_start,
                        $shift->sched_time_end,
                        (int) $shift->sched_id
                    ) + $shift->minutes();

                    $floor = $this->weeklyFloorProblem($weekMinutes);
                    if ($floor !== null) return $floor;

                    $shift->sched_disabled = null;
                }
            }

            // REQ-SS-03 / FLOW-EMP_SCHED-06: the exception is only announced
            // once, after the row it belongs to is written, so the headcount
            // the announcement is computed from is the stored one.
            $justUnavailable = $json->boolean(self::SHIFT_UNAVAILABLE_FIELD)
                && $shift->sched_disabled !== null
                && ! $shift->isStaffed()
                && ! $wasStaffed;

            if ($json->has('emp_id')) $shift->emp_id = (int) $json->input('emp_id');

            if ($start !== null) $shift->sched_time_start = $start;
            if ($end !== null) $shift->sched_time_end = $end;

            $shift->save();

            if ($justUnavailable) {
                $this->announceBlockUnavailable($shift);
            }

            if ($shift->wasChanged()) {
                // FLOW-EMP_SCHED-08 / REQ-EMP_SCHED-05: every roster write is
                // attributed to the employee who made it, with its timestamp.
                $this->logActor($json, 'edit', 'PUT /api/shifts/' . $shift->sched_id);
            }

            return response()->json([
                'success' => true,
                'message' => 'Duty shift updated successfully',
                'data'    => $this->shiftPayload($shift->fresh('employee')),
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update duty shift.',
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
        try {
            return $this->performCancelShift($json, $shiftId);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not cancel the duty shift. Please try again.', 500);
        }
    }

    private function performCancelShift(Request $json, $shiftId)
    {
        $shift = Schedule::with('employee')->find($shiftId);
        if (! $shift) {
            return response()->json(['success' => false, 'message' => 'Duty shift not found'], 404);
        }

        // FLOW-EMP_SCHED-05 / REQ-EMP_SCHED-01: cancelling a block is a
        // scheduling change too, so the employee must keep the weekly minimum
        // afterwards. A super admin may always override (rule 38 - they own
        // the roster and are the only one who can re-plan a week).
        if (! $this->isSuperAdmin($json->user('api')) && $shift->isStaffed()) {
            $weekAfter = $this->weekMinutes(
                (int) $shift->emp_id,
                $shift->sched_time_start,
                $shift->sched_time_end,
                (int) $shift->sched_id
            ) - $shift->minutes();

            $floor = $this->weeklyFloorProblem($weekAfter);
            if ($floor !== null) return $floor;
        }

        $cancelled = $this->shiftPayload($shift);
        $shift->delete();

        // FLOW-EMP_SCHED-08 / REQ-EMP_SCHED-05: cancelling a block is a
        // scheduling change too, so it is attributed and timestamped.
        $this->logActor($json, 'delete', 'DELETE /api/shifts/' . $shiftId);

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

    // ==========================================
    // DOMAIN 7 (EMPLOYEE SCHEDULING) RULES
    // ==========================================

    /*
        FLOW-EMP_SCHED-03 / FLOW-EMP_SCHED-05 + REQ-EMP_SCHED-01/03/04:
        every write to `schedules` is judged against the DOMAIN 7 rules
        BEFORE the row is touched, and the rejection is a plain message the
        schedule screen can show as-is.

        Returns the rejection response, or null when the block may proceed.
    */
    private function shiftWindowBlocked(
        Request $json,
        int $empId,
        Carbon $start,
        Carbon $end,
        ?int $ignoreShiftId = null
    ) {
        $grid = $this->shiftOffGrid($start) ?? $this->shiftOffGrid($end);
        if ($grid !== null) return $grid;

        $past = $this->shiftTooFarInPast($json, $start);
        if ($past !== null) return $past;

        $clash = $this->overlappingShift($empId, $start, $end, $ignoreShiftId);
        if ($clash !== null) {
            return $this->fail(
                'That time block overlaps block #' . $clash->sched_id . ' ('
                . $clash->sched_time_start->toDateTimeString() . ' to '
                . $clash->sched_time_end->toDateTimeString()
                . ') already scheduled for the same employee. Overlapping schedule blocks are not allowed '
                . '(REQ-EMP_SCHED-04) - pick a window that does not cross it.'
            );
        }

        return $this->weeklyFloorProblem(
            $this->weekMinutes($empId, $start, $end, $ignoreShiftId)
        );
    }

    // FLOW-EMP_SCHED-03: the schedule calendar only offers 10-minute steps,
    // so a block that lands off the grid is refused here rather than stored
    // as a time the calendar can never show again.
    private function shiftOffGrid(Carbon $time)
    {
        if ((int) $time->minute % 10 === 0 && (int) $time->second === 0) {
            return null;
        }

        return $this->fail(
            'Schedule blocks are set in 10-minute steps (FLOW-EMP_SCHED-03), and '
            . $time->format('H:i') . ' is not on that grid. Use a start or end time like 08:00, 08:10 or 08:20.'
        );
    }

    // REQ-EMP_SCHED-03: only a super admin may write a block that is already
    // more than twenty-four hours in the past.
    private function shiftTooFarInPast(Request $json, Carbon $start)
    {
        if ($this->isSuperAdmin($json->user('api'))) {
            return null;
        }

        if (! $start->copy()->addDay()->isPast()) {
            return null;
        }

        return $this->fail(
            'Schedule blocks that start more than 24 hours in the past cannot be written (REQ-EMP_SCHED-03). '
            . 'A super admin may still override the roster.'
        );
    }

    /*
        REQ-EMP_SCHED-04: the employee's live blocks that cross the proposed
        window. A block sitting ENTIRELY INSIDE a wider one is not a conflict
        - that is exactly how a duty slot reads inside the baseline
        availability block an enrolled employee is prescheduled with
        (FLOW-EMP_ENROLL-06), so only a partial cross is refused.
    */
    private function overlappingShift(int $empId, Carbon $start, Carbon $end, ?int $ignoreShiftId = null): ?Schedule
    {
        $crossing = Schedule::where('emp_id', $empId)
            ->whereNull('sched_disabled')
            ->where('sched_time_start', '<', $end)
            ->where('sched_time_end', '>', $start)
            ->when($ignoreShiftId !== null, fn ($query) => $query->where('sched_id', '!=', $ignoreShiftId))
            ->get()
            ->first(function (Schedule $block) use ($start, $end) {
                return ! ($block->sched_time_start->lte($start) && $block->sched_time_end->gte($end));
            });

        return $crossing;
    }

    /*
        REQ-EMP_SCHED-01: every prescheduled minute the employee keeps in the
        week the block lands in (Monday-based), including the block itself.
        Disabled blocks (the employee's own "unavailable" flag) count for
        nothing - they no longer staff the roster.
    */
    private function weekMinutes(int $empId, Carbon $start, Carbon $end, ?int $ignoreShiftId = null): int
    {
        $weekStart = $start->copy()->startOfWeek();
        $weekEnd   = $weekStart->copy()->addWeek();

        $minutes = Schedule::where('emp_id', $empId)
            ->whereNull('sched_disabled')
            ->where('sched_time_start', '>=', $weekStart)
            ->where('sched_time_start', '<', $weekEnd)
            ->when($ignoreShiftId !== null, fn ($query) => $query->where('sched_id', '!=', $ignoreShiftId))
            ->get()
            ->sum(fn (Schedule $block) => $block->minutes());

        return (int) $minutes + max(0, (int) $start->diffInMinutes($end));
    }

    // FLOW-EMP_SCHED-05 / rule 46: the weekly floor, read from the same
    // setting the enrollment preschedule uses. Null when the week still
    // clears it.
    private function weeklyFloorProblem(int $minutes)
    {
        $floor = (int) SystemSettings::get('min_weekly_minutes', 180);
        if ($floor <= 0 || $minutes >= $floor) {
            return null;
        }

        return $this->fail(
            'That change would leave the employee with ' . $minutes . ' scheduled minutes that week, below the '
            . $floor . '-minute weekly minimum (FLOW-EMP_SCHED-05). Extend the block, schedule the rest of the '
            . 'week first, or ask a super admin to re-plan the roster.'
        );
    }

    // Builds the shift query, applying the optional list filters. Every date
    // filter resolves against the block's start, which is what the calendar
    // positions on.
    private function filteredShifts(Request $json)    {
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
            // FLOW-EMP_SCHED-04: the employee's own exception on this block.
            // `schedules` keeps it as the timestamp it was logged.
            'unavailable'    => $shift->sched_disabled !== null,
            'unavailable_at' => optional($shift->sched_disabled)->toDateTimeString(),
            'status'         => $this->shiftStatus($shift),
            'shift_created'  => optional($shift->sched_created)->toDateTimeString(),
            'created_by'     => null,
        ];
    }

    // `schedules` has no status column, so the status is derived from the
    // assignee's availability and the block window relative to now.
    // REQ-SS-03: an employee who is no longer available - logged out of the
    // store, or flagged this very block unavailable - leaves the block
    // PENDING REPLACEMENT; slotState() already treats that block as unstaffed.
    private function shiftStatus(Schedule $shift): string
    {
        if (! $shift->isStaffed()) {
            return 'PENDING REPLACEMENT';
        }

        if ($shift->employee === null || ! $shift->employee->inStore()) {
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
        if ($employee === null || $employee->inStore() === $inStore) return;

        $employee->setInStore($inStore);

        if ($inStore) return;

        $this->notifyStaffShortage();
        // Going off duty strips the assignee off EVERY block of theirs that is
        // still ahead, not just the one being edited - that is what the cover
        // queue on the schedule screen has to show.
        $this->announceBlocksPendingReplacement(
            $this->staffBlocksNeedingCover($employee)
        );
    }

    // FLOW-EMP_SCHED-06 / 07: a block the employee flagged unavailable stops
    // staffing the roster, so every still-open booking inside it has to be told
    // to reschedule and every super admin has to be told to find a substitute.
    private function announceBlockUnavailable(Schedule $shift): void
    {
        $this->notifyStaffShortage();
        $this->announceBlocksPendingReplacement([$shift]);
    }

    // ===== from the Notif API file =====

        /**
         * DOMAIN 31 - custnotif_type / empnotif_type are always one of
         * priority | regular (default priority, per DDL).
         */
        private function notifType(Request $json): string
        {
            $type = strtolower((string) $json->input('notif_type', $json->input('type', 'priority')));

            return in_array($type, ['priority', 'regular'], true) ? $type : 'priority';
        }

        /*
            Creating notifications
            ----------
            JSON REQUEST

            recipient_type - string (req: customer | employee)
            recipient_id - integer (req)
            notif_msg - string (req)
            notif_type - string (opt: priority | regular, def priority)
        */
        public function createNotification(Request $json)
        {
            $validator = (new DatabaseAPI())->createNotification($json);
            if ($validator) return $validator;

            try {
                $recipientType = strtolower($json->input('recipient_type'));
                $recipientId   = $json->input('recipient_id');
                $notifMsg      = $json->input('notif_msg');
                $notifType     = $this->notifType($json);

                if ($recipientType === 'customer') {
                    $recipient = Customer::where('cust_id', $recipientId)->first();
                    if (!$recipient) {
                        return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
                    }

                    $notif = CustNotif::create([
                        // No sequence for custnotif_id on the live table.
                        'custnotif_id'      => $this->nextId('custnotif', 'custnotif_id'),
                        'cust_id'           => $recipientId,
                        'custnotif_created' => now(),
                        'custnotif_read'    => null,
                        'custnotif_type'    => $notifType,
                        'custnotif_msg'     => $notifMsg,
                    ]);
                } else {
                    $recipient = Employee::where('emp_id', $recipientId)->first();
                    if (!$recipient) {
                        return response()->json(['success' => false, 'message' => 'Employee not found'], 404);
                    }

                    $notif = EmpNotif::create([
                        // No sequence for empnotif_id on the live table.
                        'empnotif_id'       => $this->nextId('empnotif', 'empnotif_id'),
                        'emp_id'           => $recipientId,
                        'empnotif_created' => now(),
                        'empnotif_read'    => null,
                        'empnotif_type'    => $notifType,
                        'empnotif_msg'     => $notifMsg,
                    ]);
                }

                // D32 - the staff member who pushed it, not the recipient.
                $this->logActor($json, 'edit', 'POST /api/notif/create');

                return response()->json([
                    'success' => true,
                    'message' => 'Notification created successfully',
                    'data'    => $notif
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to create notification.',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Distributing notifications
            ----------
            JSON REQUEST

            recipient_type - string (req: customer | employee)
            notif_msg - string (req)
            recipient_ids - array of integers (opt, if omitted sends to ALL of that type)
            notif_type - string (opt: priority | regular, def priority)
        */
        public function distributeNotifications(Request $json)
        {
            $validator = (new DatabaseAPI())->distributeNotifications($json);
            if ($validator) return $validator;

            try {
                $recipientType = strtolower($json->input('recipient_type'));
                $notifMsg      = $json->input('notif_msg');
                $recipientIds  = $json->input('recipient_ids');
                $notifType     = $this->notifType($json);

                $sentCount = 0;
                $now = now();

                if ($recipientType === 'customer') {
                    // Fetch target customers (soft-deleted / suspended are skipped)
                    $query = Customer::whereNull('cust_deleted')->whereNull('cust_suspended');
                    if (!empty($recipientIds) && is_array($recipientIds)) {
                        $query->whereIn('cust_id', $recipientIds);
                    }
                    $customers = $query->get();

                    $sentCount = 0;
                    foreach ($customers as $customer) {
                        // Live custnotif has no sequence, so every row carries
                        // its own allocated key: the allocator reuses the
                        // lowest vacant key, so a pre-computed run of ids
                        // (MAX+1, MAX+2, ...) could hand out a key that is
                        // already taken.
                        CustNotif::create([
                            'custnotif_id'      => $this->nextId('custnotif', 'custnotif_id'),
                            'cust_id'           => $customer->cust_id,
                            'custnotif_created' => $now,
                            'custnotif_read'    => null,
                            'custnotif_type'    => $notifType,
                            'custnotif_msg'     => $notifMsg,
                        ]);
                        $sentCount++;
                    }
                } else {
                    // Fetch target employees (soft-deleted / suspended are skipped)
                    $query = Employee::whereNull('emp_deleted')->whereNull('emp_suspended');
                    if (!empty($recipientIds) && is_array($recipientIds)) {
                        $query->whereIn('emp_id', $recipientIds);
                    }
                    $employees = $query->get();

                    foreach ($employees as $employee) {
                        // Same reason as the customer branch: allocate one
                        // key per row instead of a pre-computed run, so the
                        // lowest-vacant-key rule is honoured for every row.
                        EmpNotif::create([
                            'empnotif_id'       => $this->nextId('empnotif', 'empnotif_id'),
                            'emp_id'           => $employee->emp_id,
                            'empnotif_created' => $now,
                            'empnotif_read'    => null,
                            'empnotif_type'    => $notifType,
                            'empnotif_msg'     => $notifMsg,
                        ]);
                        $sentCount++;
                    }
                }

                // D32 - one row for the actor; recipients are not actors here.
                $this->logActor($json, 'edit', 'POST /api/notif/distribute');

                return response()->json([
                    'success' => true,
                    'message' => 'Notifications distributed successfully',
                    'data' => [
                        'recipient_type' => $recipientType,
                        'notif_type'     => $notifType,
                        'sent_count'     => $sentCount,
                    ]
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to distribute notifications.',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

    // ===== from the Reports API file =====

    private ReportBuilder $builder;

    public function __construct()
    {
        $this->builder = new ReportBuilder();
    }

    /*
        Reports API (DOMAIN 14 - saved report templates)
        ----------
        The `reports` table keeps one row per saved filter template
        (report_title + a JSON report_text of {type, filters}); the report
        DATA itself is built on the fly by ReportBuilder and never stored.
        Every route requires an admin-ranked employee (rule 32), and an
        admin only ever sees their own templates.
    */

    public function index(Request $json)
    {
        try {
            $user = $json->user();

            if (! $user instanceof Employee || ! $user->isAdmin()) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $reports = DB::table('reports')
                ->where('emp_id', $user->emp_id)
                ->orderBy('report_created', 'desc')
                ->get();

            return response()->json([
                'success' => true,
                'message' => 'Reports retrieved successfully',
                'data' => $reports,
            ], 200);
        } catch (\Throwable $e) {
            Log::error('SystemAPI index error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve reports.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function show(Request $json, $id)
    {
        try {
            $user = $json->user();

            if (! $user instanceof Employee || ! $user->isAdmin()) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $report = DB::table('reports')
                ->where('report_id', $id)
                ->where('emp_id', $user->emp_id)
                ->first();

            if (! $report) {
                return response()->json(['success' => false, 'message' => 'Report not found'], 404);
            }

            return response()->json([
                'success' => true,
                'message' => 'Report retrieved successfully',
                'data' => $report,
            ], 200);
        } catch (\Throwable $e) {
            Log::error('SystemAPI show error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve report',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function store(Request $json)
    {
        try {
            $user = $json->user();

            if (! $user instanceof Employee || ! $user->isAdmin()) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $reportType = $json->input('report_type');
            $filters = $json->input('filters', []);
            $saveTemplate = $json->input('save_template', false);
            $templateName = $json->input('template_name');

            $reportData = match ($reportType) {
                'sales' => $this->builder->buildSalesReport($filters),
                'inventory' => $this->builder->buildInventoryReport($filters),
                'appointments' => $this->builder->buildAppointmentsReport($filters),
                'staffing' => $this->builder->buildStaffingReport($filters),
                default => throw new \InvalidArgumentException('Invalid report type'),
            };

            $report = null;
            if ($saveTemplate && $templateName) {
                // reports owns its own key (no IdAllocator), so the number is
                // left to the database and the saved row is read back.
                $reportId = DB::table('reports')->insertGetId([
                    'emp_id' => $user->emp_id,
                    'report_created' => now(),
                    'report_title' => $templateName,
                    'report_text' => json_encode([
                        'type' => $reportType,
                        'filters' => $filters,
                    ]),
                    'report_file' => null,
                ], 'report_id');

                $report = DB::table('reports')->where('report_id', $reportId)->first();
            }

            return response()->json([
                'success' => true,
                'message' => 'Report generated successfully',
                'data' => [
                    'report' => $report,
                    'report_data' => $reportData,
                ],
            ], 201);
        } catch (\Throwable $e) {
            Log::error('SystemAPI store error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to generate report',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function update(Request $json, $id)
    {
        try {
            $user = $json->user();

            if (! $user instanceof Employee || ! $user->isAdmin()) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $report = DB::table('reports')
                ->where('report_id', $id)
                ->where('emp_id', $user->emp_id)
                ->first();

            if (! $report) {
                return response()->json(['success' => false, 'message' => 'Report not found'], 404);
            }

            DB::table('reports')->where('report_id', $report->report_id)->update([
                'report_title' => $json->input('report_title', $report->report_title),
                'report_text' => $json->input('report_text', $report->report_text),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Report template updated successfully',
                'data' => DB::table('reports')->where('report_id', $report->report_id)->first(),
            ], 200);
        } catch (\Throwable $e) {
            Log::error('SystemAPI update error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to update report',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function destroy(Request $json, $id)
    {
        try {
            $user = $json->user();

            if (! $user instanceof Employee || ! $user->isAdmin()) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $report = DB::table('reports')
                ->where('report_id', $id)
                ->where('emp_id', $user->emp_id)
                ->first();

            if (! $report) {
                return response()->json(['success' => false, 'message' => 'Report not found'], 404);
            }

            DB::table('reports')->where('report_id', $report->report_id)->delete();

            return response()->json([
                'success' => true,
                'message' => 'Report template deleted successfully',
            ], 200);
        } catch (\Throwable $e) {
            Log::error('SystemAPI destroy error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete report',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // ===== from the Health API file =====

    // Minutes without a heartbeat before the scheduler counts as stalled
    const STALE_MINUTES = 120;

    /*
        Scheduler health check
        ----------
        No params. Returns 200 while the heartbeat is fresh, 503 once it is
        stale or missing.
    */
    public function schedulerHealth(Request $json)
    {
        try {
            return $this->performSchedulerHealth($json);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not read the scheduler heartbeat. Please try again.', 500);
        }
    }

    private function performSchedulerHealth(Request $json)
    {
        $lastRun = trim((string) @file_get_contents(storage_path('framework/scheduler-heartbeat')));
        $ageSeconds = $lastRun === ''
            ? null
            : (int) Carbon::parse($lastRun)->diffInSeconds(now(), true);
        $isRunning = $ageSeconds !== null && $ageSeconds <= self::STALE_MINUTES * 60;

        return response()->json([
            'success'             => true,
            'status'              => $isRunning ? 'RUNNING' : 'STALLED',
            'job'                 => 'priority-notification-follow-ups',
            'last_heartbeat'      => $lastRun === '' ? null : $lastRun,
            'age_seconds'         => $ageSeconds,
            'stale_after_minutes' => self::STALE_MINUTES,
        ], $isRunning ? 200 : 503);
    }

    // ===== from the Accounts API file =====
/**
 * Accounts API - user management (DOMAIN 5 / DOMAIN 6, rules 36-40).
 *
 * Everything is written against the live schema: employees carry
 * `emp_categ` ('staff' | 'admin' | 'super admin'), `emp_suspended`,
 * `emp_deleted` and `emp_present`; customers carry `cust_suspended`,
 * `cust_deleted`, `cust_type`, `cust_categ`, `cust_address`, `cust_bday`
 * and `cust_avatar`.
 *
 * The legacy column names (`emp_type`, `emp_instore`, `emp_disabled`,
 * `emp_photo`, `cust_nickname`, `cust_birthday`, `cust_photo`,
 * `cust_brgy`/`city`/`province`/`country`, `cust_disabled`, ...) are never
 * READ from the database - they are derived on the way OUT as response
 * aliases so the current frontend keeps working.
 *
 * Response envelope: {success, message?, data?}.
 */

    // ===== from the Accounts API file =====

    // ==========================================
    // AUTHORIZATION (resolved on the `api` guard: config's default guard is
    // still the stateless-less `web` one, so Controller::requireEmployee()
    // would see a null user here)
    // ==========================================

    private function denyUnlessEmployee(Request $json)
    {
        if (! $json->user('api') instanceof Employee) {
            return response()->json([
                'success' => false,
                'message' => 'Access denied. Employee accounts only.',
            ], 403);
        }

        return null;
    }

    private function denyUnlessSuperAdmin(Request $json)
    {
        if (! $this->isSuperAdmin($json->user('api'))) {
            return response()->json([
                'success' => false,
                'message' => 'Only super admin employees may perform this action',
            ], 403);
        }

        return null;
    }

    /*
        Changing account type (rule 37 / REQ-UM-01)
        ----------
        JSON REQUEST

        user_id - integer (req)
        account_type - string (req: customer | employee)
        new_type - string (req: STAFF | ADMIN | SUPER ADMIN)
    */
    public function changeAccountType(Request $json)
    {
        $validator = (new DatabaseAPI())->changeAccountType($json);
        if ($validator) return $validator;

        $denied = $this->denyUnlessSuperAdmin($json);
        if ($denied) return $denied;

        try {
            $userId = $json->input('user_id');
            $accountType = strtolower($json->input('account_type'));
            $newType = strtolower(trim($json->input('new_type')));

            if ($accountType === 'customer') {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer and employee accounts cannot be converted.',
                ], 422);
            }
            // Rule 32 / D5: emp_categ carries exactly these three values
            if (! in_array($newType, ['staff', 'admin', 'super admin'], true)) {
                return response()->json(['success' => false, 'message' => 'Invalid employee role.'], 422);
            }

            $user = Employee::find($userId);
            if (! $user) {
                return response()->json(['success' => false, 'message' => 'Employee account not found'], 404);
            }

            $previousType = strtoupper((string) $user->emp_categ);
            $actor = $json->user('api');
            $user->update(['emp_categ' => $newType]);

            // REQ-UM-04 / DOMAIN 32: role change logged with the super admin
            $this->logEmployee(
                (int) $user->emp_id,
                'edit',
                'PUT /api/accounts/type - role changed from ' . $previousType . ' to '
                    . strtoupper($newType) . ' by super admin #' . $actor->emp_id
            );

            $fresh = $user->fresh();

            return response()->json([
                'success' => true,
                'message' => 'Account type updated successfully',
                'data' => array_merge($fresh->toArray(), $this->employeeAliases($fresh)),
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to change account type',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Enrolling an employee (DOMAIN 5 / REQ-EMP_ENROLL-*, rule 36)
        ----------
        Thin alias of the live enrolment path (POST /auth/emp_signup): the
        @bicol-u.edu.ph email rule, the 409 on duplicate, the generated
        temporary password, emp_present=true and the emplog 'edit' row all
        live in UserAPI::employeeSignup() so there is exactly one
        implementation. Wire `POST /accounts/enroll` to this method if the
        accounts-namespaced route is wanted.
    */
    public function enrollEmployee(Request $json)
    {
        return (new UserAPI())->employeeSignup($json);
    }

    /*
        Deleting accounts (rule 38 / REQ-UM-03)
        ----------
        JSON REQUEST

        user_id - integer (req)
        account_type - string (req: customer | employee)
        hard_delete - boolean (opt, default: false)
    */
    public function deleteAccount(Request $json)
    {
        $validator = (new DatabaseAPI())->deleteAccount($json);
        if ($validator) return $validator;

        $denied = $this->denyUnlessSuperAdmin($json);
        if ($denied) return $denied;

        try {
            $userId = $json->input('user_id');
            $accountType = strtolower($json->input('account_type'));
            $hardDelete = (bool) $json->input('hard_delete', false);
            $adminId = (int) $json->user('api')->emp_id;

            if ($accountType === 'employee' && (int) $userId === $adminId) {
                return response()->json([
                    'success' => false,
                    'message' => 'You cannot delete your own account.',
                ], 409);
            }

            if ($accountType === 'customer') {
                $user = Customer::where('cust_id', $userId)->first();
                if (! $user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                if ($hardDelete) {
                    Log::warning('Customer account permanently deleted', [
                        'customer_id' => $userId,
                        'actor_id' => $adminId,
                    ]);
                    try {
                        $user->delete();
                    } catch (\Illuminate\Database\QueryException $e) {
                        // Linked rows (orders, logs, ...) keep the purge from
                        // completing: fall back to the soft delete.
                        if ((string) ($e->errorInfo[0] ?? '') !== '23503') {
                            throw $e;
                        }
                        $user->update([
                            'cust_deleted' => now(),
                            'cust_login_active' => null,
                        ]);
                    }
                    // The customer row is gone (or marked): record the purge
                    // against the acting super admin instead of the target.
                    $this->logEmployee(
                        $adminId,
                        'edit',
                        'DELETE /api/accounts/delete - customer #' . $userId . ' purged by super admin #' . $adminId
                    );
                } else {
                    $user->update([
                        'cust_deleted' => now(),
                        // REQ-UM-02: every outstanding token dies with the row
                        'cust_login_active' => null,
                    ]);
                    $this->logCustomer(
                        (int) $userId,
                        'edit',
                        'DELETE /api/accounts/delete - soft-deleted by super admin #' . $adminId
                    );
                }
            } else {
                $user = Employee::where('emp_id', $userId)->first();
                if (! $user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                if ($hardDelete) {
                    Log::warning('Employee account permanently deleted', [
                        'employee_id' => $userId,
                        'actor_id' => $adminId,
                    ]);
                    try {
                        $user->delete();
                    } catch (\Illuminate\Database\QueryException $e) {
                        // Linked rows (logs, schedule blocks, ...) keep the
                        // purge from completing: fall back to the soft delete
                        // instead of failing the request outright.
                        if ((string) ($e->errorInfo[0] ?? '') !== '23503') {
                            throw $e;
                        }
                        $user->update([
                            'emp_deleted' => now(),
                            'emp_login_active' => null,
                        ]);
                    }
                } else {
                    $user->update([
                        'emp_deleted' => now(),
                        'emp_login_active' => null,
                    ]);
                }

                $this->logEmployee(
                    $adminId,
                    'edit',
                    'DELETE /api/accounts/delete - ' . ($hardDelete ? 'purged' : 'soft-deleted')
                        . ' employee #' . $userId
                );
            }

            return response()->json([
                'success' => true,
                'message' => $hardDelete ? 'Account permanently deleted' : 'Account soft-deleted successfully',
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete account',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Disabling accounts (rule 38 / REQ-UM-02, REQ-UM-04)
        ----------
        JSON REQUEST

        user_id - integer (req)
        account_type - string (req: customer | employee)
        reason - string (req)
    */
    public function disableAccount(Request $json)
    {
        $validator = (new DatabaseAPI())->disableAccount($json);
        if ($validator) return $validator;

        $denied = $this->denyUnlessSuperAdmin($json);
        if ($denied) return $denied;

        try {
            $userId = $json->input('user_id');
            $accountType = strtolower($json->input('account_type'));
            $reason = trim((string) $json->input('reason'));
            $adminId = (int) $json->user('api')->emp_id;

            if ($accountType === 'customer') {
                $user = Customer::where('cust_id', $userId)->first();
                if (! $user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                $user->update([
                    'cust_suspended' => now(),
                    // REQ-UM-02: terminate every active session immediately
                    'cust_login_active' => null,
                ]);

                $this->logCustomer(
                    (int) $userId,
                    'edit',
                    'POST /api/accounts/disable - disabled by super admin #' . $adminId
                        . ' at ' . now() . '. Reason: ' . $reason
                );

                $this->notifyCustomer((int) $userId, 'Your account has been disabled. Reason: ' . $reason);
            } else {
                $user = Employee::where('emp_id', $userId)->first();
                if (! $user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                $user->update([
                    'emp_suspended' => now(),
                    'emp_login_active' => null,
                ]);

                $this->logEmployee(
                    (int) $userId,
                    'edit',
                    'POST /api/accounts/disable - disabled by super admin #' . $adminId
                        . ' at ' . now() . '. Reason: ' . $reason
                );

                $this->notifyEmployee((int) $userId, 'Your account has been disabled. Reason: ' . $reason);
            }

            $fresh = $user->fresh();

            return response()->json([
                'success' => true,
                'message' => 'Account disabled successfully',
                'data' => $accountType === 'customer'
                    ? array_merge($fresh->toArray(), $this->customerAliases($fresh))
                    : array_merge($fresh->toArray(), $this->employeeAliases($fresh)),
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to disable account',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Displaying accounts (rule 37 / REQ-EMP_LIST-01..05)
        ----------
        JSON REQUEST / QUERY PARAMS

        account_type - string (opt: customer | employee | all)
    */
    public function displayAccounts(Request $json)
    {
        $denied = $this->denyUnlessEmployee($json);
        if ($denied) return $denied;

        try {
            $accountType = strtolower($json->input('account_type', 'all'));

            $customers = [];
            $employees = [];

            if (in_array($accountType, ['customer', 'all'])) {
                $customers = Customer::whereNull('cust_deleted')
                    ->orderBy('cust_created', 'desc')
                    ->get()
                    ->map(fn (Customer $customer) => array_merge($customer->toArray(), $this->customerAliases($customer)))
                    ->values();
            }
            if (in_array($accountType, ['employee', 'all'])) {
                $employees = Employee::whereNull('emp_deleted')
                    ->orderBy('emp_created', 'desc')
                    ->get()
                    ->map(fn (Employee $employee) => array_merge($employee->toArray(), $this->employeeAliases($employee)))
                    ->values();
            }

            $this->logEmployee((int) $json->user('api')->emp_id, 'view', 'GET /api/accounts/display');

            return response()->json([
                'success' => true,
                'message' => 'Accounts retrieved successfully',
                'data' => [
                    'customers' => $customers,
                    'employees' => $employees,
                ],
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to display accounts',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Recovering accounts (rule 38 / REQ-UM-02)
        ----------
        JSON REQUEST

        user_id - integer (req)
        account_type - string (req: customer | employee)
        reason - string (opt)
    */
    public function recoverAccount(Request $json)
    {
        $validator = (new DatabaseAPI())->recoverAccount($json);
        if ($validator) return $validator;

        $denied = $this->denyUnlessSuperAdmin($json);
        if ($denied) return $denied;

        try {
            $userId = $json->input('user_id');
            $accountType = strtolower($json->input('account_type'));
            $reason = trim((string) $json->input('reason', ''));
            $adminId = (int) $json->user('api')->emp_id;

            if ($accountType === 'customer') {
                $user = Customer::where('cust_id', $userId)->first();
                if (! $user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                $user->update([
                    'cust_suspended' => null,
                    'cust_deleted' => null,
                ]);

                $this->logCustomer(
                    (int) $userId,
                    'edit',
                    'POST /api/accounts/recover - recovered by super admin #' . $adminId
                        . ' at ' . now() . ($reason !== '' ? '. Reason: ' . $reason : '.')
                );

                $this->notifyCustomer((int) $userId, 'Your account has been recovered and is active again.');
            } else {
                $user = Employee::where('emp_id', $userId)->first();
                if (! $user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                $user->update([
                    'emp_suspended' => null,
                    'emp_deleted' => null,
                ]);

                $this->logEmployee(
                    (int) $userId,
                    'edit',
                    'POST /api/accounts/recover - recovered by super admin #' . $adminId
                        . ' at ' . now() . ($reason !== '' ? '. Reason: ' . $reason : '.')
                );

                $this->notifyEmployee((int) $userId, 'Your account has been recovered and is active again.');
            }

            $fresh = $user->fresh();

            return response()->json([
                'success' => true,
                'message' => 'Account recovered successfully',
                'data' => $accountType === 'customer'
                    ? array_merge($fresh->toArray(), $this->customerAliases($fresh))
                    : array_merge($fresh->toArray(), $this->employeeAliases($fresh)),
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to recover account',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Searching accounts (REQ-EMP_LIST-02)
        ----------
        JSON REQUEST / QUERY PARAMS

        q - string (req)
        account_type - string (opt: customer | employee | all)
    */
    public function searchAccounts(Request $json)
    {
        $denied = $this->denyUnlessEmployee($json);
        if ($denied) return $denied;

        try {
            $query = (string) $json->input('q', '');
            $accountType = strtolower($json->input('account_type', 'all'));

            $customers = [];
            $employees = [];

            if (in_array($accountType, ['customer', 'all'])) {
                $customers = Customer::whereNull('cust_deleted')
                    ->where(function ($builder) use ($query) {
                        $builder->where('cust_givname', 'like', "%{$query}%")
                            ->orWhere('cust_surname', 'like', "%{$query}%")
                            ->orWhere('cust_phone', 'like', "%{$query}%")
                            ->orWhere('cust_email', 'like', "%{$query}%");
                    })
                    ->get()
                    ->map(fn (Customer $customer) => array_merge($customer->toArray(), $this->customerAliases($customer)))
                    ->values();
            }

            if (in_array($accountType, ['employee', 'all'])) {
                $employees = Employee::whereNull('emp_deleted')
                    ->where(function ($builder) use ($query) {
                        $builder->where('emp_surname', 'like', "%{$query}%")
                            ->orWhere('emp_givname', 'like', "%{$query}%")
                            ->orWhere('emp_email', 'like', "%{$query}%")
                            ->orWhere('emp_phone', 'like', "%{$query}%");
                    })
                    ->get()
                    ->map(fn (Employee $employee) => array_merge($employee->toArray(), $this->employeeAliases($employee)))
                    ->values();
            }

            $this->logEmployee((int) $json->user('api')->emp_id, 'view', 'GET /api/accounts/search');

            return response()->json([
                'success' => true,
                'message' => 'Account search completed',
                'data' => [
                    'customers' => $customers,
                    'employees' => $employees,
                ],
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to search accounts',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Sorting accounts (REQ-EMP_LIST-03)
        ----------
        JSON REQUEST / QUERY PARAMS

        sort_by - string (opt: created | name | type)
        order - string (opt: asc | desc)
        account_type - string (opt: customer | employee | all)
    */
    public function sortAccounts(Request $json)
    {
        $denied = $this->denyUnlessEmployee($json);
        if ($denied) return $denied;

        try {
            $sortBy = $json->input('sort_by', 'created');
            $order = strtolower($json->input('order', 'asc')) === 'desc' ? 'desc' : 'asc';
            $accountType = strtolower($json->input('account_type', 'all'));

            $customers = [];
            $employees = [];

            if (in_array($accountType, ['customer', 'all'])) {
                $col = $sortBy === 'name' ? 'cust_surname' : ($sortBy === 'type' ? 'cust_type' : 'cust_created');
                $customers = Customer::whereNull('cust_deleted')->orderBy($col, $order)->get()
                    ->map(fn (Customer $customer) => array_merge($customer->toArray(), $this->customerAliases($customer)))
                    ->values();
            }

            if (in_array($accountType, ['employee', 'all'])) {
                $col = $sortBy === 'name' ? 'emp_surname' : ($sortBy === 'type' ? 'emp_categ' : 'emp_created');
                $employees = Employee::whereNull('emp_deleted')->orderBy($col, $order)->get()
                    ->map(fn (Employee $employee) => array_merge($employee->toArray(), $this->employeeAliases($employee)))
                    ->values();
            }

            $this->logEmployee((int) $json->user('api')->emp_id, 'view', 'GET /api/accounts/sort');

            return response()->json([
                'success' => true,
                'message' => 'Accounts sorted successfully',
                'data' => [
                    'customers' => $customers,
                    'employees' => $employees,
                ],
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to sort accounts',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // ===== from the Access API file =====
/**
 * Access log API (DOMAIN 32, REQ-ACCESS_LOG-01..03).
 *
 * custlog / emplog rows are append-only: every authentication, view and
 * edit action of an account lands in one of them with
 * `*_access` in auth | view | edit and a short `*_endpoint` description.
 * Nothing here ever updates or deletes a log row.
 *
 * Response envelope: {success, message?, data?}.
 */

    // ===== from the Access API file =====

    /** Endpoints may hold a route plus a short note: keep them column-sized. */
    private const MAX_ENDPOINT = 250;

    /*
        Flagging irregularities
        ----------
        JSON REQUEST

        action  - string (req)
        desc    - string (req)
        access  - string (opt: auth | view | edit, default view)
        endpoint - string (opt: overrides the composed target description)
    */
    public function flagIrregularity(Request $json)
    {
        $validator = (new DatabaseAPI())->flagIrregularity($json);
        if ($validator) return $validator;

        try {
            $employee = $json->user('api');
            if (! $employee instanceof Employee) {
                return response()->json(['success' => false, 'message' => 'Employee authentication required'], 403);
            }

            EmpLog::create([
                // No sequence for emplog_id on the live table.
                'emplog_id'       => $this->nextId('emplog', 'emplog_id'),
                'emp_id'         => $employee->emp_id,
                'emplog_access'  => $this->accessValue($json->input('access'), 'view'),
                'emplog_endpoint' => $this->short($this->endpointFrom($json, 'FLAG')),
                'emplog_created' => now(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Irregularity flagged successfully',
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to flag irregularity',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Logging actions
        ----------
        JSON REQUEST

        action   - string (req)
        desc     - string (req)
        access   - string (opt: auth | view | edit, default view)
        endpoint - string (opt: overrides the composed target description)
    */
    public function logAction(Request $json)
    {
        $validator = (new DatabaseAPI())->logAction($json);
        if ($validator) return $validator;

        try {
            $employee = $json->user('api');
            if (! $employee instanceof Employee) {
                return response()->json(['success' => false, 'message' => 'Employee authentication required'], 403);
            }

            EmpLog::create([
                // No sequence for emplog_id on the live table.
                'emplog_id'       => $this->nextId('emplog', 'emplog_id'),
                'emp_id'         => $employee->emp_id,
                'emplog_access'  => $this->accessValue($json->input('access'), 'view'),
                'emplog_endpoint' => $this->short($this->endpointFrom($json, 'LOG')),
                'emplog_created' => now(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Action logged successfully',
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to log action',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Merged access log (FLOW-ACCESS_LOG-07, REQ-ACCESS_LOG-02/03)
        ----------
        GET /api/access/logs (super admin only)

        QUERY PARAMS (all optional)
        scope  - string (all | customers | employees, default all)
        q      - string (matches the endpoint text or the actor's name)
        access - string (auth | view | edit)
        from   - date (YYYY-MM-DD, inclusive)
        to     - date (YYYY-MM-DD, inclusive)
        limit  - int (1..500, default 200)

        Read-only: this endpoint never modifies a log row. Newest first, and
        every entry carries the acting account's name and type.
    */
    public function accessLog(Request $json)
    {
        try {
            return $this->performAccessLog($json);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not retrieve the access log. Please try again.', 500);
        }
    }

    private function performAccessLog(Request $json)
    {
        // The route already carries role:super_admin; the guard-resolved
        // check below keeps the rule true even if the route is re-wired.
        if (! $this->isSuperAdmin($json->user('api'))) {
            return response()->json([
                'success' => false,
                'message' => 'Only super admin employees may perform this action',
            ], 403);
        }

        $scope = strtolower(trim((string) $json->input('scope', 'all')));
        if (! in_array($scope, ['all', 'customers', 'employees'], true)) {
            $scope = 'all';
        }

        $search = trim((string) $json->input('q', ''));
        $access = strtolower(trim((string) $json->input('access', '')));
        if ($access !== '' && ! in_array($access, ['auth', 'view', 'edit', 'delete'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Access must be auth, view, edit or delete.',
            ], 422);
        }

        $from = $this->dayStart($json->input('from'));
        $to = $this->dayEnd($json->input('to'));
        $limit = (int) $json->input('limit', 200);
        $limit = max(1, min(500, $limit));

        $rows = [];

        if ($scope !== 'employees') {
            $rows = array_merge($rows, $this->customerLogRows($search, $access, $from, $to, $limit));
        }
        if ($scope !== 'customers') {
            $rows = array_merge($rows, $this->employeeLogRows($search, $access, $from, $to, $limit));
        }

        usort($rows, fn (array $a, array $b) => strcmp($b['created'], $a['created']));
        $rows = array_slice($rows, 0, $limit);

        // DOMAIN 32: reading the audit trail is itself an audited view
        $actor = $json->user('api');
        if ($actor instanceof Employee) {
            $this->logEmployee((int) $actor->emp_id, 'view', 'GET /api/access/logs');
        }

        return response()->json([
            'success' => true,
            'message' => 'Access log retrieved successfully',
            'data' => $rows,
        ], 200);
    }

    /*
        Access-log retention purge (DOMAIN 32, REQ-ACCESS_LOG-01 override)
        ----------
        DELETE /api/access/logs (super admin only)

        One action removes EVERY custlog and emplog entry older than 24
        months (DatabaseAPI::ACCESS_LOG_PURGE_MONTHS) and notifies every
        super admin of the count. This is the manual half of the owner's
        retention policy: the system asks for it once every two weeks, and
        the daily 60-month sweep would delete those rows anyway. Nothing
        younger than 24 months is ever touched, and the purge itself is
        written back into the surviving trail as a `delete` entry.
    */
    public function purgeAccessLogs(Request $json)
    {
        try {
            return $this->performPurgeAccessLogs($json);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not purge the access log. Please try again.', 500);
        }
    }

    private function performPurgeAccessLogs(Request $json)
    {
        // The route already carries role:super_admin; the guard-resolved
        // check below keeps the rule true even if the route is re-wired.
        $actor = $json->user('api');

        if (! $this->isSuperAdmin($actor)) {
            return response()->json([
                'success' => false,
                'message' => 'Only super admin employees may perform this action',
            ], 403);
        }

        $months = DatabaseAPI::ACCESS_LOG_PURGE_MONTHS;
        $purged = (new DatabaseAPI())->purgeAccessLogs($months);
        $total = array_sum($purged);

        // DOMAIN 32: purging the trail is itself recorded in the trail.
        if ($actor instanceof Employee) {
            $this->logEmployee(
                (int) $actor->emp_id,
                'delete',
                'DELETE /api/access/logs - ' . $total . ' entries older than ' . $months . ' months'
            );
        }

        return response()->json([
            'success' => true,
            'message' => $total === 0
                ? 'No access log entries are older than ' . $months . ' months.'
                : $total . ' access log entries older than ' . $months . ' months were permanently deleted.',
            'data' => [
                'purged' => $purged,
                'total'  => $total,
            ],
        ], 200);
    }

    // ==========================================
    // QUERY BUILDERS (read-only)
    // ==========================================

    /** @return array<int, array<string, mixed>> */
    private function customerLogRows(string $search, string $access, ?string $from, ?string $to, int $limit): array
    {
        $query = DB::table('custlog')
            ->join('customer', 'customer.cust_id', '=', 'custlog.cust_id')
            ->select(
                'custlog.custlog_id as log_id',
                'custlog.cust_id as actor_id',
                'custlog.custlog_access as access',
                'custlog.custlog_endpoint as endpoint',
                'custlog.custlog_created as created',
                DB::raw("trim(customer.cust_givname || ' ' || customer.cust_surname) as actor_name"),
                DB::raw("coalesce(customer.cust_categ, customer.cust_type, 'customer') as actor_role")
            );

        if ($access !== '') {
            $query->where('custlog.custlog_access', $access);
        }
        if ($from !== null) {
            $query->where('custlog.custlog_created', '>=', $from);
        }
        if ($to !== null) {
            $query->where('custlog.custlog_created', '<=', $to);
        }
        if ($search !== '') {
            $like = '%' . $search . '%';
            $query->where(function ($builder) use ($like) {
                $builder->where('custlog.custlog_endpoint', 'like', $like)
                    ->orWhere('customer.cust_givname', 'like', $like)
                    ->orWhere('customer.cust_surname', 'like', $like)
                    ->orWhere('customer.cust_email', 'like', $like)
                    ->orWhere('customer.cust_phone', 'like', $like);
            });
        }

        return $query
            ->orderBy('custlog.custlog_created', 'desc')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => $this->normalizeRow($row, 'customer'))
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function employeeLogRows(string $search, string $access, ?string $from, ?string $to, int $limit): array
    {
        $query = DB::table('emplog')
            ->join('employee', 'employee.emp_id', '=', 'emplog.emp_id')
            ->select(
                'emplog.emplog_id as log_id',
                'emplog.emp_id as actor_id',
                'emplog.emplog_access as access',
                'emplog.emplog_endpoint as endpoint',
                'emplog.emplog_created as created',
                DB::raw("trim(employee.emp_givname || ' ' || employee.emp_surname) as actor_name"),
                DB::raw("coalesce(employee.emp_categ, 'employee') as actor_role")
            );

        if ($access !== '') {
            $query->where('emplog.emplog_access', $access);
        }
        if ($from !== null) {
            $query->where('emplog.emplog_created', '>=', $from);
        }
        if ($to !== null) {
            $query->where('emplog.emplog_created', '<=', $to);
        }
        if ($search !== '') {
            $like = '%' . $search . '%';
            $query->where(function ($builder) use ($like) {
                $builder->where('emplog.emplog_endpoint', 'like', $like)
                    ->orWhere('employee.emp_givname', 'like', $like)
                    ->orWhere('employee.emp_surname', 'like', $like)
                    ->orWhere('employee.emp_email', 'like', $like);
            });
        }

        return $query
            ->orderBy('emplog.emplog_created', 'desc')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => $this->normalizeRow($row, 'employee'))
            ->all();
    }

    /** Shapes one joined row into the shared log-entry payload. */
    private function normalizeRow(object $row, string $scope): array
    {
        $role = (string) ($row->actor_role ?? '');
        $created = (string) $row->created;

        return [
            'scope' => $scope,                 // 'customer' | 'employee'
            'log_id' => (int) $row->log_id,
            'id' => (int) $row->log_id,
            'actor_id' => (int) $row->actor_id,
            'actor_name' => (string) ($row->actor_name ?? ''),
            'actor_type' => $scope,
            'actor_role' => $role,
            'access' => (string) $row->access, // auth | view | edit
            'endpoint' => (string) ($row->endpoint ?? ''),
            'created' => $created,
            // Legacy-style per-table keys so old consumers can tell the
            // two sources apart without a scope field.
            'custlog_id' => $scope === 'customer' ? (int) $row->log_id : null,
            'emplog_id' => $scope === 'employee' ? (int) $row->log_id : null,
            'custlog_access' => $scope === 'customer' ? (string) $row->access : null,
            'emplog_access' => $scope === 'employee' ? (string) $row->access : null,
            'custlog_endpoint' => $scope === 'customer' ? (string) ($row->endpoint ?? '') : null,
            'emplog_endpoint' => $scope === 'employee' ? (string) ($row->endpoint ?? '') : null,
            'custlog_created' => $scope === 'customer' ? $created : null,
            'emplog_created' => $scope === 'employee' ? $created : null,
        ];
    }

    // ==========================================
    // HELPERS
    // ==========================================

    /**
     * auth | view | edit | delete, falling back to $default for anything else.
     * `delete` is in the set because REQ-MANAGE_REV-04 asks for a review
     * deletion to be distinguishable from a read in the access log.
     */
    private function accessValue($value, string $default): string
    {
        $value = strtolower(trim((string) $value));

        return in_array($value, ['auth', 'view', 'edit', 'delete'], true) ? $value : $default;
    }

    /** "<endpoint> - <action>: <desc>", cut to the column width. */
    private function endpointFrom(Request $json, string $fallbackAction): string
    {
        $explicit = trim((string) $json->input('endpoint', ''));
        if ($explicit !== '') {
            return $explicit;
        }

        $action = trim((string) $json->input('action', '')) ?: $fallbackAction;
        $desc = trim((string) $json->input('desc', ''));

        return $desc !== '' ? $action . ' - ' . $desc : $action;
    }

    private function short(string $endpoint): string
    {
        return mb_strlen($endpoint) > self::MAX_ENDPOINT
            ? mb_substr($endpoint, 0, self::MAX_ENDPOINT)
            : $endpoint;
    }

    /** Start of the given day (inclusive), or null when absent/invalid. */
    private function dayStart($value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }
        try {
            return \Carbon\Carbon::parse($value)->startOfDay()->toDateTimeString();
        } catch (\Throwable $e) {
            return null;
        }
    }

    /** End of the given day (inclusive), or null when absent/invalid. */
    private function dayEnd($value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }
        try {
            return \Carbon\Carbon::parse($value)->endOfDay()->toDateTimeString();
        } catch (\Throwable $e) {
            return null;
        }
    }
}
