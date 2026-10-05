<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\CustNotif;
use App\Models\EmpNotif;
use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Setting;
use App\Support\SystemSettings;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

abstract class Controller
{
    // The single phone value every walk-in customer record carries
    const WALK_IN_PHONE = '0000000000';

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

    // REQ-SS-02: the employee’s next prescheduled block (the one whose start
    // decides the deadline), or null when they have none today or later.
    protected function currentBlock(int $empId): ?Schedule
    {
        return Schedule::where('emp_id', $empId)
            ->whereNull('sched_disabled')
            ->where('sched_time_start', '>=', now())
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

        $hasOpenVisit = Appointment::where('cust_id', $customer->cust_id)
            ->where('appoint_type', 'visit')
            ->where('appoint_status', 'upcoming')
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
            'cust_id'           => $custId,
            'custnotif_created' => now(),
            'custnotif_read'    => null,
            'custnotif_msg'     => $message,
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

        foreach (Appointment::where('appoint_status', 'upcoming')
            ->whereNull('appoint_closed')
            ->where('appoint_start', '>=', now())
            ->get() as $appointment) {

            $start = $appointment->appoint_start;
            $end = $appointment->appoint_end ?? $start->copy()->addMinutes($slotMinutes);

            $staffed = Schedule::whereNull('sched_disabled')
                ->where('sched_time_start', '<=', $start)
                ->where('sched_time_end', '>=', $end)
                ->exists();

            if ($staffed) continue;

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
            'emp_id'           => $empId,
            'empnotif_created' => now(),
            'empnotif_read'    => null,
            'empnotif_msg'     => $message,
        ]);
    }

    // Inserts a notification for every active (not suspended/deleted) employee
    protected function notifyAllEmployees(string $message): void
    {
        $employees = Employee::whereNull('emp_deleted')->whereNull('emp_disabled')->get();
        foreach ($employees as $employee) {
            $this->notifyEmployee((int) $employee->emp_id, $message);
        }
    }

    // Inserts a notification for active employees whose emp_categ is in $types
    // (case-insensitive, e.g. ['ADMIN', 'SUPER ADMIN'] for REQ-IM-03)
    protected function notifyEmployeesByType(array $types, string $message): void
    {
        $upper = array_map('strtoupper', $types);
        $placeholders = implode(',', array_fill(0, count($upper), '?'));

        $employees = Employee::whereNull('emp_deleted')
            ->whereNull('emp_disabled')
            ->whereRaw('UPPER(emp_categ) IN (' . $placeholders . ')', $upper)
            ->get();

        foreach ($employees as $employee) {
            $this->notifyEmployee((int) $employee->emp_id, $message);
        }
    }

    // ==========================================
    // ACCESS LOG (DOMAIN 32)
    // ==========================================

    // FLOW-ACCESS_LOG-01..06: every authentication / view / edit action of an
    // account lands in custlog or emplog. Rows are append-only (REQ-ACCESS_LOG-01).
    protected function logCustomer(int $custId, string $access, string $endpoint): void
    {
        try {
            \App\Models\CustLog::create([
                'cust_id' => $custId,
                'custlog_access' => $access,
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
                'emp_id' => $empId,
                'emplog_access' => $access,
                'emplog_endpoint' => $endpoint,
                'emplog_created' => now(),
            ]);
        } catch (\Throwable $e) {
            // An audit write must never break the action it describes.
        }
    }

    // ==========================================
    // PHONE OTP VERIFICATION (DOMAIN 29 / REQ-CUST_SET-02)
    // ==========================================

    /**
     * The sensitive customer flows that must be OTP-verified first
     * (FLOW-CUST_SET-03, FLOW-CUST_SET-06, REQ-CUST_SET-02).
     */
    const OTP_PURPOSES = ['password_change', 'backup_contacts'];

    // A code lives five minutes, may be tried five times, and may be
    // re-requested after a 45-second cooldown. No new table or column is
    // used: codes live in the file cache and are delivered in-app.
    const OTP_TTL_MINUTES = 5;
    const OTP_MAX_ATTEMPTS = 5;
    const OTP_COOLDOWN_SECONDS = 45;
    const OTP_VERIFIED_TTL_MINUTES = 10;

    /** Cache key of a code issued for one account + purpose. */
    protected function otpCodeKey(int $custId, string $purpose): string
    {
        return 'otp:code:' . $custId . ':' . $purpose;
    }

    /** Cache key flagging that an account already passed verification. */
    protected function otpVerifiedKey(int $custId, string $purpose): string
    {
        return 'otp:ok:' . $custId . ':' . $purpose;
    }

    /**
     * Issues a six-digit code for a customer: it is hashed into the cache and
     * delivered through the account's own notification inbox (REQ-CUST_SIGNUP-04
     * allows SMS or in-app delivery, and no SMS gateway is configured).
     *
     * @return array{0: string|null, 1: string|null} [code, error message]
     */
    protected function issueOtpCode(Customer $customer, string $purpose): array
    {
        $custId = (int) $customer->cust_id;

        if (Cache::get('otp:cool:' . $custId . ':' . $purpose)) {
            return [null, 'Please wait before requesting another code.'];
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        Cache::put($this->otpCodeKey($custId, $purpose), [
            'hash'  => hash('sha256', $code),
            'tries' => 0,
        ], now()->addMinutes(self::OTP_TTL_MINUTES));

        Cache::put('otp:cool:' . $custId . ':' . $purpose, true, self::OTP_COOLDOWN_SECONDS);

        $this->notifyCustomer($custId, '[PRIORITY] Your verification code is ' . $code
            . '. It expires in ' . self::OTP_TTL_MINUTES . ' minutes. Do not share it with anyone.');

        return [$code, null];
    }

    /** Verifies a submitted code and flags the purpose as verified. */
    protected function verifyOtpCode(Customer $customer, string $purpose, string $code): array
    {
        $custId = (int) $customer->cust_id;
        $entry = Cache::get($this->otpCodeKey($custId, $purpose));

        if (! is_array($entry)) {
            return [false, 'No verification code is active. Request a new one.'];
        }

        if (! hash_equals((string) ($entry['hash'] ?? ''), hash('sha256', $code))) {
            $tries = (int) ($entry['tries'] ?? 0) + 1;

            if ($tries >= self::OTP_MAX_ATTEMPTS) {
                Cache::forget($this->otpCodeKey($custId, $purpose));

                return [false, 'Too many attempts. Request a new code.'];
            }

            Cache::put($this->otpCodeKey($custId, $purpose), ['hash' => $entry['hash'], 'tries' => $tries],
                now()->addMinutes(self::OTP_TTL_MINUTES));

            return [false, 'Incorrect code. Please try again.'];
        }

        Cache::forget($this->otpCodeKey($custId, $purpose));
        Cache::put($this->otpVerifiedKey($custId, $purpose), true,
            now()->addMinutes(self::OTP_VERIFIED_TTL_MINUTES));

        return [true, 'Code verified.'];
    }

    /**
     * Returns a 428 response when a customer has not yet verified the given
     * purpose, or null when the caller may proceed (employees and system
     * actors are never OTP-gated here).
     */
    protected function otpGate(Request $json, string $purpose)
    {
        $user = $json->user('api');

        if (! $user instanceof Customer) {
            return null;
        }

        if (Cache::get($this->otpVerifiedKey((int) $user->cust_id, $purpose))) {
            return null;
        }

        return response()->json([
            'success' => false,
            'code'    => 'OTP_REQUIRED',
            'message' => 'Phone OTP verification is required before this change can be saved.',
            'data'    => ['purpose' => $purpose],
        ], 428);
    }

    /**
     * Burns a verification so the next sensitive change needs its own code
     * (FLOW-CUST_SET-06: "OTP verification for each change").
     */
    protected function consumeOtp(Request $json, string $purpose): void
    {
        $user = $json->user('api');

        if ($user instanceof Customer) {
            Cache::forget($this->otpVerifiedKey((int) $user->cust_id, $purpose));
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
}
