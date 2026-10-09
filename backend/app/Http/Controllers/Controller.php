<?php

namespace App\Http\Controllers;

use App\Models\Visit;
use App\Models\Customer;
use App\Models\CustNotif;
use App\Models\EmpLog;
use App\Models\EmpNotif;
use App\Models\Employee;
use App\Models\Product;
use App\Models\Schedule;
use App\Models\Setting;
use App\Support\IdAllocator;
use App\Support\SystemSettings;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;

abstract class Controller
{
    // The single phone value every walk-in customer record carries
    const WALK_IN_PHONE = '0000000000';

    // ==========================================
    // PRIMARY KEY ALLOCATION (legacy tables have no sequence)
    // ==========================================

    /**
     * Next free primary key for a table whose legacy bigint PK carries no
     * sequence / identity / default (bag, orders, items, pickup, delivery,
     * appointments, wishlist, custnotif, empnotif, custlog, emplog, ...).
     *
     * See App\Support\IdAllocator for the full per-table decision (payment,
     * parcel and the legacy singular `appointment` table own a sequence and
     * must NEVER be passed here) and for the CONCURRENCY CAVEAT: this is a
     * best-effort MAX(pk)+1 read, so two simultaneous requests can be handed
     * the same number and the loser of the insert fails with a duplicate-key
     * error. When the insert already runs inside DB::transaction(), call this
     * inside that same transaction (checkout, appointment booking) to keep the
     * allocation next to the write - it narrows, but does not close, the race.
     *
     * @param string $table physical table name (e.g. 'orders')
     * @param string $pk    primary key column (e.g. 'ord_id')
     */
    protected function nextId(string $table, string $pk): int
    {
        return IdAllocator::next($table, $pk);
    }

    /**
     * Keeps the subset of $attributes whose columns exist on the connected
     * schema. The system-new.docx SCHEMA (live) and the pre-migration
     * fixture phpunit runs on do not carry the same names, and writing a
     * column the connection does not have - or omitting one it requires -
     * fails the whole statement.
     *
     * Shared by every controller that force-creates a legacy row
     * (UserAPI::employeeSignup / customerSignup, SystemAPI::initialize).
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    protected function existingColumns(string $table, array $attributes): array
    {
        static $listing = [];

        $columns = $listing[$table] ??= Schema::getColumnListing($table);

        return array_filter(
            $attributes,
            // ARRAY_FILTER_USE_KEY hands the key - the column name - as
            // the callback's only argument.
            static fn (string $column) => in_array($column, $columns, true),
            ARRAY_FILTER_USE_KEY
        );
    }

    // ==========================================
    // SHARED RESPONSE / LOOKUP HELPERS
    // ==========================================

    /**
     * The one `{success:false, message}` error envelope every controller
     * answers a rejected request with. Shared so the shape can never drift
     * between modules (rule 76).
     */
    protected function fail(string $message, int $status = 400)
    {
        return response()->json([
            'success' => false,
            'message' => $message,
        ], $status);
    }

    /**
     * Resolve a product reference. `prod_id` may also arrive as a `prod_tag`,
     * so a numeric key is tried as an id first and anything else as a tag; a
     * bad key never reaches SQL. Shared by the cart (UserAPI) and the register
     * (OrdersAPI), which used to carry identical private copies (rule 76).
     */
    protected function resolveProduct($prodKey): ?Product
    {
        if ($prodKey === null || $prodKey === '') {
            return null;
        }

        if (is_numeric($prodKey)) {
            $product = Product::find((int) $prodKey);
            if ($product) {
                return $product;
            }
        }

        return Product::where('prod_tag', (string) $prodKey)->first();
    }

    // ==========================================
    // AUTHORIZATION HELPERS
    // ==========================================

    protected function customerId(Request $request): ?int
    {
        $user = $request->user('api');

        return $user instanceof Customer ? (int) $user->cust_id : null;
    }

    // True when the sanctum-authenticated account is an employee
    protected function isEmployee($user): bool
    {
        return $user instanceof Employee;
    }

    // True when the API-authenticated account carries SUPER ADMIN (REQ-UM-01)
    protected function isSuperAdmin($user): bool
    {
        return $user instanceof Employee && $user->isSuperAdmin();
    }

    protected function isAdmin($user): bool
    {
        return $user instanceof Employee && $user->isAdmin();
    }

    // Returns null when the caller is any employee, otherwise a 403 response
    protected function requireEmployee(Request $json)
    {
        if (!$this->isEmployee($json->user('api'))) {
            return response()->json([
                'success' => false,
                'message' => 'Only employee accounts may access this endpoint'
            ], 403);
        }

        return null;
    }

    // Returns null when the caller is a SUPER ADMIN employee, otherwise a 403 response
    protected function requireSuperAdmin(Request $json)
    {
        if (!$this->isSuperAdmin($json->user('api'))) {
            return response()->json([
                'success' => false,
                'message' => 'Only super admin employees may perform this action'
            ], 403);
        }

        return null;
    }

    // ==========================================
    // ACCOUNT PROTECTION HELPERS
    // ==========================================

    // REQ-APC-01: returns a 409 response when the account's most recent
    // credential change happened within the last thirty days. A null stamp
    // means the credentials were never changed, so the change is allowed.
    protected function credentialChangeBlocked($stamp)
    {
        if ($stamp && $stamp->copy()->addDays(30)->isFuture()) {
            return response()->json([
                'success' => false,
                'message' => 'Sensitive credentials cannot be changed within thirty days of the most recent change'
            ], 409);
        }

        return null;
    }

    // REQ-APC-01: true only when the payload really rewrites one of the given
    // login identifiers, so an ordinary profile save is never blocked.
    protected function sensitiveFieldsTouched($user, array $payload, array $fields): bool
    {
        foreach ($fields as $field) {
            if (! array_key_exists($field, $payload)) {
                continue;
            }
            if (trim((string) $payload[$field]) !== trim((string) $user->{$field})) {
                return true;
            }
        }

        return false;
    }

    // ==========================================
    // AVAILABILITY DEADLINE (REQ-SS-02)
    // ==========================================

    // REQ-SS-02: availability stays editable until the exact minute the
    // employee’s duty block starts, and is locked from that minute on.
    // Only non-super-admins are restricted, so a super admin passes this gate
    // for every block and may override the deadline at any time.
    protected function availabilityDeadlineBlocked(Request $json, int $empId)
    {
        if ($this->isSuperAdmin($json->user('api'))) {
            return null;
        }

        $block = $this->currentBlock($empId);
        if ($block === null || $block->sched_time_start->isFuture()) {
            return null;
        }

        return response()->json([
            'success' => false,
            'message' => 'Availability is locked: schedule block #' . $block->sched_id
                . ' started at ' . $block->sched_time_start->toDateTimeString()
                . '. A super admin must override this change.',
            'code'    => 'ALR_AVAIL_AFTER_BLOCK_START',
        ], 403);
    }

    // REQ-SS-02: the employee's current prescheduled block - the running one
    // while a block is in progress, otherwise the next one from now on. It is
    // the block whose start decides the deadline, so a block already under way
    // has passed its deadline and locks the change. Null when the employee has
    // no block left whose end is still ahead.
    protected function currentBlock(int $empId): ?Schedule
    {
        return Schedule::where('emp_id', $empId)
            ->whereNull('sched_disabled')
            ->where('sched_time_end', '>=', now())
            ->orderBy('sched_time_start')
            ->first();
    }

    // ==========================================
    // WALK-IN GUARD (REQ-POS-02 / REQ-ALR-03)
    // ==========================================

    // A walk-in customer (cust_phone 0000000000) has no account to return to,
    // so REQ-POS-02 only lets them cancel or return an order while an open
    // VISIT appointment backs the request. Returns the REQ-ALR-03 error detail
    // for a rejection, or null when the walk-in may proceed.
    protected function walkInVisitRequired(Customer $customer, string $action): ?array
    {
        if ($customer === null || $customer->cust_phone !== self::WALK_IN_PHONE) {
            return null;
        }

        // AppointmentsAPI stores the type uppercase ('VISIT' / 'CLAIM') while the
        // column default and older rows are lowercase, so the match is
        // case-insensitive instead of assuming one spelling. An appointment
        // only backs the request while it is still open (Visit::isOpen(): an
        // open status AND no closing timestamp).
        $hasOpenVisit = Visit::where('cust_id', $customer->cust_id)
            ->whereRaw('UPPER(appoint_type) = ?', ['VISIT'])
            ->where('appoint_status', 'upcoming')
            ->whereNull('appoint_closed')
            ->where('appoint_end', '>=', now())
            ->exists();

        if ($hasOpenVisit) {
            return null;
        }

        return [
            'code'        => 'ALR_WALK_IN_NO_VISIT',
            'description' => 'Walk-in customers must hold an open VISIT appointment to request an order '
                . $action . '. Please book a visit appointment first.',
            'timestamp'   => now()->toDateTimeString(),
        ];
    }

    // ==========================================
    // NOTIFICATION HELPERS
    // ==========================================

    // Inserts a regular (or explicitly prefixed) notification for a customer
    protected function notifyCustomer(int $custId, string $message): void
    {
        CustNotif::create([
            // Legacy table: custnotif_id is bigint NOT NULL with no sequence.
            'custnotif_id'      => $this->nextId('custnotif', 'custnotif_id'),
            'cust_id'           => $custId,
            'custnotif_created' => now(),
            'custnotif_read'    => null,
            'custnotif_msg'     => $message,
            // FLOW-NOTIF-03: unread rows sort with `priority` on top, so the
            // type has to be written explicitly - the column default alone
            // would make every row priority and flatten that ordering.
            'custnotif_type'    => str_starts_with($message, '[PRIORITY]') ? 'priority' : 'regular',
        ]);
    }

    /*
        Rule 10 / REQ-EMP_SCHED-06: a slot nobody is prescheduled for cannot be
        staffed, so every still-open booking in it is unworkable and those
        customers are told to reschedule once. The headcount is per slot, and a
        customer already told about a slot is never told twice.
    */
    protected function notifyStaffShortage(): void
    {
        $slotMinutes = (int) SystemSettings::get('slot_minutes', 10);

        foreach (Visit::where('appoint_status', 'upcoming')
            ->whereNull('appoint_closed')
            ->where('appoint_start', '>=', now())
            ->get() as $appointment) {

            $start = $appointment->appoint_start;
            $end = $appointment->appoint_end ?? $start->copy()->addMinutes($slotMinutes);

            // The headcount is the one the calendar and the checkout gate
            // already apply (REQ-AB-03): a VISIT needs two in-store
            // employees, a CLAIM one. Reading it through the roster instead
            // of raw blocks is what makes REQ-SS-03 work - a block whose
            // assignee just logged off does not staff anything, even though
            // the row is still there. A null count means the roster source is
            // unavailable on this connection; the calendar skips the staffing
            // rule then, so no shortage may be announced either.
            $inStore   = (new AppointmentsAPI())->rosterHeadcount($start, $end);
            $minStaff  = strtoupper((string) $appointment->appoint_type) === 'CLAIM' ? 1 : 2;

            if ($inStore === null || $inStore >= $minStaff) continue;

            $message = '[PRIORITY] Your appointment #' . $appointment->appoint_id
                . ' on ' . $start->format('Y-m-d H:i')
                . ' is unavailable. Reason: staff shortage. '
                . 'Please reschedule at your earliest convenience.';

            // One notice per booking, no matter how often the roster changes
            if (CustNotif::where('cust_id', $appointment->cust_id)
                ->where('custnotif_msg', 'like', '%appointment #' . $appointment->appoint_id . '%')
                ->where('custnotif_msg', 'like', '%staff shortage%')
                ->exists()) {
                continue;
            }

            $this->notifyCustomer((int) $appointment->cust_id, $message);
        }
    }

    // Inserts a notification for a single employee
    protected function notifyEmployee(int $empId, string $message): void
    {
        EmpNotif::create([
            // Legacy table: empnotif_id is bigint NOT NULL with no sequence.
            'empnotif_id'      => $this->nextId('empnotif', 'empnotif_id'),
            'emp_id'           => $empId,
            'empnotif_created' => now(),
            'empnotif_read'    => null,
            'empnotif_msg'     => $message,
            // FLOW-NOTIF-03: same priority / regular split as custnotif.
            'empnotif_type'    => str_starts_with($message, '[PRIORITY]') ? 'priority' : 'regular',
        ]);
    }

    /**
     * The live Supabase `employee` table has no `emp_disabled` column (it
     * ships emp_deleted / emp_suspended instead - probed read-only through
     * information_schema), while the legacy/sqlite schema used by the test
     * suite still carries it. Filtering on a column that does not exist kills
     * the whole query with an undefined-column error, so the filter is applied
     * only when the column is actually there, and the probe result is kept for
     * the lifetime of the process (the schema never changes mid-request).
     */
    private static ?bool $employeeHasDisabledColumn = null;

    protected function employeeDisabledColumnExists(): bool
    {
        if (self::$employeeHasDisabledColumn === null) {
            try {
                self::$employeeHasDisabledColumn = Schema::hasColumn('employee', 'emp_disabled');
            } catch (\Throwable $e) {
                return false; // schema not readable right now: skip, do not cache
            }
        }

        return self::$employeeHasDisabledColumn;
    }

    /** The employee rows that count as active for a broadcast. */
    protected function activeEmployeeQuery()
    {
        $query = Employee::whereNull('emp_deleted');

        if ($this->employeeDisabledColumnExists()) {
            $query->whereNull('emp_disabled');
        }

        return $query;
    }

    // Inserts a notification for every employee row that counts as active
    // (not soft-deleted, and not disabled when the legacy column exists).
    protected function notifyAllEmployees(string $message): void
    {
        $employees = $this->activeEmployeeQuery()->get();
        foreach ($employees as $employee) {
            $this->notifyEmployee((int) $employee->emp_id, $message);
        }
    }

    // Inserts a notification for active employees whose emp_categ is in $types
    // (case-insensitive, e.g. ['ADMIN', 'SUPER ADMIN'] for REQ-IM-03)
    //
    // Rule 32 spells the rank `emp_categ`, but the seeded super admin and
    // older rows still carry it in the legacy `emp_type` column. EnsureRole
    // and Employee::category() judge a rank from either spelling, so a
    // broadcast has to reach exactly the accounts those guards would - a
    // priority alert that skips the seeded super admin would never be seen.
    protected function notifyEmployeesByType(array $types, string $message): void
    {
        $upper = array_map('strtoupper', $types);
        $placeholders = implode(',', array_fill(0, count($upper), '?'));
        $category = $this->employeeCategoryExpression();

        $employees = $this->activeEmployeeQuery()
            ->whereRaw('UPPER(' . $category . ') IN (' . $placeholders . ')', $upper)
            ->get();

        foreach ($employees as $employee) {
            $this->notifyEmployee((int) $employee->emp_id, $message);
        }
    }

    /**
     * The SQL expression that reads an employee's rank on this connection:
     * `COALESCE(NULLIF(emp_categ, ''), emp_type)` when the legacy column still
     * exists (test sqlite / pre-rename schemas), plain `emp_categ` on the live
     * table. Same probe style as employeeDisabledColumnExists().
     */
    private static ?bool $employeeHasTypeColumn = null;

    protected function employeeCategoryExpression(): string
    {
        if (self::$employeeHasTypeColumn === null) {
            try {
                self::$employeeHasTypeColumn = Schema::hasColumn('employee', 'emp_type');
            } catch (\Throwable $e) {
                // Schema not readable right now: answer with the live column
                // and do not cache the guess.
                return 'emp_categ';
            }
        }

        return self::$employeeHasTypeColumn
            ? "COALESCE(NULLIF(emp_categ, ''), emp_type)"
            : 'emp_categ';
    }

    // ==========================================
    // ACCESS LOG (DOMAIN 32)
    // ==========================================

    // FLOW-ACCESS_LOG-01..06: every authentication / view / edit action of an
    // account lands in custlog or emplog. Rows are append-only (REQ-ACCESS_LOG-01).
    //
    // The access vocabulary is the one the access-log screen filters on
    // (auth | view | edit, see SystemAPI::accessValue): an authentication
    // action is written as `auth`, whatever the caller named it.
    private function normalizeAccess(string $access): string
    {
        $access = strtolower(trim($access));

        if (in_array($access, ['auth', 'view', 'edit'], true)) {
            return $access;
        }

        return $access === 'authentication' ? 'auth' : 'view';
    }

    protected function logCustomer(int $custId, string $access, string $endpoint): void
    {
        try {
            \App\Models\CustLog::create([
                // Legacy table: custlog_id is bigint NOT NULL with no sequence.
                'custlog_id' => $this->nextId('custlog', 'custlog_id'),
                'cust_id' => $custId,
                'custlog_access' => $this->normalizeAccess($access),
                'custlog_endpoint' => $endpoint,
                'custlog_created' => now(),
            ]);
        } catch (\Throwable $e) {
            // An audit write must never break the action it describes.
        }
    }

    protected function logEmployee(int $empId, string $access, string $endpoint): void
    {
        try {
            EmpLog::create([
                // Legacy table: emplog_id is bigint NOT NULL with no sequence.
                'emplog_id' => $this->nextId('emplog', 'emplog_id'),
                'emp_id' => $empId,
                'emplog_access' => $this->normalizeAccess($access),
                'emplog_endpoint' => $endpoint,
                'emplog_created' => now(),
            ]);
        } catch (\Throwable $e) {
            // An audit write must never break the action it describes.
        }
    }

    // FLOW-ACCESS_LOG-03: a customer reading a customer-facing resource is
    // recorded on the account (best-effort). Guests are anonymous and not
    // logged, and the CacheReads middleware already short-circuits cached
    // GETs, so a repeat view inside the cache window is not logged twice.
    protected function logView(Request $json, string $description = ''): void
    {
        try {
            $user = $json->user('api');
            $suffix = $description !== '' ? ' - ' . $description : '';
            if ($user instanceof Customer) {
                $this->logCustomer((int) $user->cust_id, 'view', 'GET ' . $json->path() . $suffix);
            } elseif ($user instanceof Employee) {
                $this->logEmployee((int) $user->emp_id, 'view', 'GET ' . $json->path() . $suffix);
            }
        } catch (\Throwable $e) {
            // An audit write must never break the endpoint it describes.
        }
    }

    // ==========================================
    // SIGNUP TYPE NORMALISATION (DOMAIN 17 / FLOW-CUST_SIGNUP-02)
    // ==========================================

    /**
     * Folds a posted account type onto one of the two values the spec allows:
     * `bueno` (the "BUeño" half of FLOW-CUST_SIGNUP-02) or `guest`.
     *
     * The signup form sends "Student" / "Alumni" / "Faculty" / "Guest" while
     * the canonical vocabulary is "BUeño" | "guest", so the diacritics fold
     * first ("BUeño" -> "bueno"), every non-letter then drops out, and the
     * legacy academic roles land on BUeño.
     *
     * @param  mixed  $raw
     */
    protected function normalizeSignupType($raw): string
    {
        $kind = mb_strtolower(trim((string) $raw));

        $kind = strtr($kind, [
            'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u',
            'ü' => 'u', 'ñ' => 'n',
        ]);

        $kind = preg_replace('/[^a-z]/', '', $kind);

        if (in_array($kind, ['student', 'alumni', 'faculty'], true)) {
            return 'bueno';
        }

        // Walk-in accounts are guests everywhere else in the system (POS).
        if ($kind === 'walkin') {
            return 'guest';
        }

        return (string) $kind;
    }

    // ==========================================
    // PHONE OTP VERIFICATION (DOMAIN 29 / REQ-CUST_SET-02)
    // ==========================================

    /**
     * The sensitive customer flows that must be OTP-verified first
     * (FLOW-CUST_SET-03, FLOW-CUST_SET-06, REQ-CUST_SET-02,
     * FLOW-CHECKOUT-08, FLOW-BOOK_APP-05).
     */
    const OTP_PURPOSES = ['password_change', 'backup_contacts', 'checkout', 'appointment'];

    // A code lives five minutes, may be tried five times, and may be
    // re-requested after a 45-second cooldown. No new table or column is
    // used: codes live in the file cache and are delivered in-app.
    const OTP_TTL_MINUTES = 5;
    const OTP_MAX_ATTEMPTS = 5;
    const OTP_COOLDOWN_SECONDS = 45;
    const OTP_VERIFIED_TTL_MINUTES = 10;

    /** Cache key of a code issued for one account + purpose. */
    protected function otpCodeKey(int $userId, string $purpose, string $scope = 'cust'): string
    {
        return 'otp:code:' . $scope . ':' . $userId . ':' . $purpose;
    }

    /**
     * Cache flag of an account whose signup row exists but whose phone OTP
     * never cleared (FLOW-CUST_SIGNUP-05: the account is created, not
     * finalized). While the flag lives, the next login resumes that
     * challenge instead of opening a session, and clearing it is what
     * finalizes the signup. Lives a week: a customer may well come back
     * to finish a signup on another day.
     */
    protected function signupPendingKey(int $custId): string
    {
        return 'auth:signup_pending:' . $custId;
    }

    /**
     * Cache key flagging that an account already passed verification.
     *
     * The scope matters: employee and customer ids come from independent
     * sequences, so without `emp:` / `cust:` in the key employee 7 would
     * inherit the verification customer 7 already earned.
     */
    protected function otpVerifiedKey(int $userId, string $purpose, string $scope = 'cust'): string
    {
        return 'otp:ok:' . $scope . ':' . $userId . ':' . $purpose;
    }

    /** `emp` for an employee (email OTP), `cust` for a customer (phone OTP). */
    protected function otpScope(object $user): string
    {
        return $user instanceof Employee ? 'emp' : 'cust';
    }

    /** The account id behind an OTP subject. */
    protected function otpSubjectId(object $user): int
    {
        return (int) ($user instanceof Employee ? $user->emp_id : $user->cust_id);
    }

    /**
     * Issues a six-digit code for an account.
     *
     * A customer's code is delivered to their phone inbox (REQ-CUST_SIGNUP-04
     * allows SMS or in-app delivery, and no SMS gateway is configured); an
     * employee's is delivered to their Bicol University mailbox and to their
     * in-app notification feed - the employee channel is email, never SMS.
     *
     * @return array{0: string|null, 1: string|null} [code, error message]
     */
    protected function issueOtpCode(object $user, string $purpose): array
    {
        $scope = $this->otpScope($user);
        $userId = $this->otpSubjectId($user);

        if (Cache::get('otp:cool:' . $scope . ':' . $userId . ':' . $purpose)) {
            return [null, 'Please wait before requesting another code.'];
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        Cache::put($this->otpCodeKey($userId, $purpose, $scope), [
            'hash'  => hash('sha256', $code),
            'tries' => 0,
        ], now()->addMinutes(self::OTP_TTL_MINUTES));

        Cache::put('otp:cool:' . $scope . ':' . $userId . ':' . $purpose, true, self::OTP_COOLDOWN_SECONDS);

        $message = '[PRIORITY] Your verification code is ' . $code
            . '. It expires in ' . self::OTP_TTL_MINUTES . ' minutes. Do not share it with anyone.';

        if ($user instanceof Employee) {
            $this->notifyEmployee($userId, $message);
            $this->mailEmployeeOtp($user, $code);
        } else {
            $this->notifyCustomer($userId, $message);
        }

        return [$code, null];
    }

    /**
     * FLOW - the employee channel for a verification code is email: the six
     * digits go to the Bicol University mailbox on file. Delivery is
     * best-effort exactly like the enrollment mail (MAIL_MAILER=log keeps an
     * unconfigured transport from failing the request) - the code still lives
     * in the cache and the in-app notification either way.
     */
    protected function mailEmployeeOtp(Employee $employee, string $code): void
    {
        try {
            $to = (string) $employee->emp_email;
            if ($to === '') {
                return;
            }

            Mail::raw(
                "Your Tindahan ni Isko verification code is {$code}.\n\n"
                . 'It expires in ' . self::OTP_TTL_MINUTES . ' minutes. Do not share it with anyone.',
                function ($message) use ($to, $employee) {
                    $message->to($to)
                        ->subject('Your verification code - Tindahan ni Isko')
                        ->from(
                            (string) config('mail.from.address', 'tindahan.ni.isko@bicol-u.edu.ph'),
                            'Tindahan ni Isko'
                        );
                    unset($employee);
                }
            );
        } catch (\Throwable $e) {
            // Never let a mail transport problem block the verification flow.
        }
    }

    /** Verifies a submitted code and flags the purpose as verified. */
    protected function verifyOtpCode(object $user, string $purpose, string $code): array
    {
        $scope = $this->otpScope($user);
        $userId = $this->otpSubjectId($user);
        $entry = Cache::get($this->otpCodeKey($userId, $purpose, $scope));

        if (! is_array($entry)) {
            return [false, 'No verification code is active. Request a new one.'];
        }

        if (! hash_equals((string) ($entry['hash'] ?? ''), hash('sha256', $code))) {
            $tries = (int) ($entry['tries'] ?? 0) + 1;

            if ($tries >= self::OTP_MAX_ATTEMPTS) {
                Cache::forget($this->otpCodeKey($userId, $purpose, $scope));

                return [false, 'Too many attempts. Request a new code.'];
            }

            Cache::put($this->otpCodeKey($userId, $purpose, $scope),
                ['hash' => $entry['hash'], 'tries' => $tries],
                now()->addMinutes(self::OTP_TTL_MINUTES));

            return [false, 'Incorrect code. Please try again.'];
        }

        Cache::forget($this->otpCodeKey($userId, $purpose, $scope));
        Cache::put($this->otpVerifiedKey($userId, $purpose, $scope), true,
            now()->addMinutes(self::OTP_VERIFIED_TTL_MINUTES));

        return [true, 'Code verified.'];
    }

    /**
     * Returns a 428 response when the account has not yet verified the given
     * purpose, or null when the caller may proceed (system actors - and any
     * account that is neither a customer nor an employee - are never gated).
     *
     * REQ-CUST_SET-02 covers customers, whose channel is the phone; the admin
     * side answers the same rule with the employee's email channel, so both
     * sides of the portal clear their own OTP before a sensitive change lands.
     */
    protected function otpGate(Request $json, string $purpose)
    {
        $user = $json->user('api');

        if (! $user instanceof Customer && ! $user instanceof Employee) {
            return null;
        }

        $scope = $this->otpScope($user);
        if (Cache::get($this->otpVerifiedKey($this->otpSubjectId($user), $purpose, $scope))) {
            return null;
        }

        return response()->json([
            'success' => false,
            'code'    => 'OTP_REQUIRED',
            'message' => 'Verification is required before this change can be saved.',
            'data'    => [
                'purpose' => $purpose,
                // Which channel the code went to: customers get SMS/phone
                // inbox, employees get their Bicol University mailbox.
                'channel' => $user instanceof Employee ? 'email' : 'phone',
            ],
        ], 428);
    }

    /**
     * Burns a verification so the next sensitive change needs its own code
     * (FLOW-CUST_SET-06: "OTP verification for each change").
     */
    protected function consumeOtp(Request $json, string $purpose): void
    {
        $user = $json->user('api');

        if ($user instanceof Customer || $user instanceof Employee) {
            Cache::forget($this->otpVerifiedKey($this->otpSubjectId($user), $purpose, $this->otpScope($user)));
        }
    }

    // ==========================================
    // SETTINGS HELPER
    // ==========================================

    // Reads a persisted system setting, falling back to $default when the
    // value was never stored (or the settings table does not exist yet)
    protected function settingValue(string $key, $default = null)
    {
        return SystemSettings::get($key, $default);
    }

        /** 09171234567 -> 0917****567 (REQ-CUST_SIGNUP-04 delivery notice). */
        protected function maskPhone(?string $phone): string
        {
            $phone = trim((string) $phone);
            $length = strlen($phone);

            if ($length < 7) {
                return $phone;
            }

            return substr($phone, 0, 4) . str_repeat('*', $length - 7) . substr($phone, -3);
        }


        /**
         * DOMAIN 32 - every auth/view/edit action taken through this controller
         * leaves a custlog / emplog row for whoever performed it.
         */
        protected function logActor(Request $json, string $access, string $endpoint): void
        {
            $user = $json->user('api');
            if ($user instanceof Employee) {
                $this->logEmployee((int) $user->getKey(), $access, $endpoint);
            } elseif ($user instanceof Customer) {
                $this->logCustomer((int) $user->getKey(), $access, $endpoint);
            }
        }


    // ==========================================
    // LEGACY RESPONSE ALIASES (never read from the database)
    // ==========================================

    /** @see SecurityAPI::customerAliases() - same contract, kept in sync. */
    protected function customerAliases(Customer $customer): array
    {
        $address = array_map('trim', explode(',', (string) $customer->cust_address));
        // REQ-CUST_PROF-03: the same column also holds the ' | '-separated
        // list of delivery addresses the customer maintains in Settings.
        $addresses = array_values(array_filter(
            array_map('trim', explode(' | ', (string) $customer->cust_address)),
            fn (string $entry) => $entry !== ''
        ));
        [$backupCallcode, $backupPhone] = $this->splitBackupPhone($customer->cust_backup_phone);

        return [
            'cust_nickname' => trim($customer->cust_givname . ' ' . $customer->cust_surname),
            'cust_birthday' => $customer->cust_bday?->format('Y-m-d'),
            'cust_photo' => $customer->cust_avatar,
            'cust_brgy' => $address[0] ?? '',
            'cust_city' => $address[1] ?? '',
            'cust_province' => $address[2] ?? '',
            'cust_country' => $address[3] ?? '',
            'cust_addresses' => $addresses,
            'cust_backupcallcode' => $backupCallcode,
            'cust_backupphone' => $backupPhone,
            'cust_backupemail' => $customer->cust_backup_email,
            'cust_cart' => $customer->cust_bag,
            'cust_appoints' => $customer->cust_appoint,
            'cust_disabled' => $customer->cust_suspended,
        ];
    }


    /** @see SecurityAPI::employeeAliases() - same contract, kept in sync. */
    protected function employeeAliases(Employee $employee): array
    {
        [$backupCallcode, $backupPhone] = $this->splitBackupPhone($employee->emp_backup_phone);

        return [
            'emp_type' => strtoupper((string) $employee->emp_categ),
            'emp_instore' => $employee->inStore(),
            'emp_disabled' => $employee->emp_suspended,
            'emp_photo' => $employee->emp_avatar,
            'emp_college' => null,
            'emp_backupcallcode' => $backupCallcode !== '' ? $backupCallcode : $employee->emp_callcode,
            'emp_backupphone' => $backupPhone,
            'emp_backupemail' => $employee->emp_backup_email,
        ];
    }


    protected function splitBackupPhone(?string $value): array
    {
        $value = trim((string) $value);
        if ($value === '') {
            return ['', ''];
        }
        if (preg_match('/^(\+\d{1,4})\s+(.+)$/', $value, $matches)) {
            return [$matches[1], $matches[2]];
        }

        return ['', $value];
    }

}
