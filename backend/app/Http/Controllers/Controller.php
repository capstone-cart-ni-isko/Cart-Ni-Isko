<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Customer;
use App\Models\CustNotif;
use App\Models\DutyShift;
use App\Models\EmpNotif;
use App\Models\Employee;
use App\Models\Setting;
use App\Support\DayRoster;
use Carbon\Carbon;
use Illuminate\Http\Request;

abstract class Controller
{
    // The single phone value every walk-in customer record carries
    const WALK_IN_PHONE = '0000000000';

    // ==========================================
    // AUTHORIZATION HELPERS
    // ==========================================

    protected function customerId(Request $request): ?int
    {
        $user = $request->user('sanctum');

        return $user instanceof Customer ? (int) $user->cust_id : null;
    }

    // True when the sanctum-authenticated account is an employee
    protected function isEmployee($user): bool
    {
        return $user instanceof Employee;
    }

    // True when the employee account carries the SUPER ADMIN type (REQ-UM-01)
    protected function isSuperAdmin($user): bool
    {
        return $user instanceof Employee
            && stripos((string) $user->emp_type, 'SUPER ADMIN') !== false;
    }

    protected function isAdmin($user): bool
    {
        $type = strtoupper((string) ($user->emp_type ?? ''));

        return $user instanceof Employee
            && (str_contains($type, 'ADMIN') || str_contains($type, 'SUPER'));
    }

    // Returns null when the caller is any employee, otherwise a 403 response
    protected function requireEmployee(Request $json)
    {
        if (!$this->isEmployee($json->user())) {
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
        if (!$this->isSuperAdmin($json->user())) {
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
        if ($this->isSuperAdmin($json->user('sanctum'))) {
            return null;
        }

        $block = $this->currentBlock($empId);
        if ($block === null || $block->startsAt()->isFuture()) {
            return null;
        }

        return response()->json([
            'success' => false,
            'message' => 'Availability is locked: shift block #' . $block->shift_id
                . ' started at ' . $block->startsAt()->toDateTimeString()
                . '. A super admin must override this change.',
            'code'    => 'ALR_AVAIL_AFTER_BLOCK_START',
        ], 403);
    }

    // REQ-SS-02: the employee’s next duty block (the one whose start decides
    // the deadline), or null when they have none today or later. Only today
    // and later can qualify, and the window is joined in PHP because
    // shift_date and shift_start are two columns in two different formats.
    protected function currentBlock(int $empId): ?DutyShift
    {
        return DutyShift::where('emp_id', $empId)
            ->where('shift_date', '>=', now()->format('Y-m-d'))
            ->orderBy('shift_date')
            ->orderBy('shift_start')
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
            ->where('appoint_type', 'VISIT')
            ->whereNull('appoint_closed')
            ->where('appoint_date', '>=', now())
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
        REQ-AB-03 / REQ-SS-03: a block whose in-store headcount falls below the
        minimum (2 for VISIT, 1 for CLAIM) makes every still-open booking in
        that block unworkable, so those customers are told to reschedule once.
        The headcount is per block, not per day, and a customer already told
        about a block is never told twice.
    */
    protected function notifyStaffShortage(): void
    {
        foreach (Appointment::whereNull('appoint_closed')
            ->where('appoint_date', '>=', now())
            ->get() as $appointment) {

            $type = (string) $appointment->appoint_type;
            $minimum = $type === 'CLAIM' ? 1 : 2;
            // The model carries no datetime cast, so parse rather than trust
            $start = Carbon::parse($appointment->appoint_date);
            $end = $start->copy()->addMinutes(
                $type === 'CLAIM'
                    ? (int) $this->settingValue('claim_slot_duration', 30)
                    : (int) $this->settingValue('visit_slot_duration', 10)
            );

            if (DayRoster::for($start)->headcount($start, $end) >= $minimum) continue;

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

    // Inserts a notification for every active (not disabled/deleted) employee
    protected function notifyAllEmployees(string $message): void
    {
        $employees = Employee::whereNull('emp_deleted')->whereNull('emp_disabled')->get();
        foreach ($employees as $employee) {
            $this->notifyEmployee((int) $employee->emp_id, $message);
        }
    }

    // Inserts a notification for active employees whose emp_type is in $types
    // (case-insensitive, e.g. ['ADMIN', 'SUPER ADMIN'] for REQ-IM-03)
    protected function notifyEmployeesByType(array $types, string $message): void
    {
        $upper = array_map('strtoupper', $types);
        $placeholders = implode(',', array_fill(0, count($upper), '?'));

        $employees = Employee::whereNull('emp_deleted')
            ->whereNull('emp_disabled')
            ->whereRaw('UPPER(emp_type) IN (' . $placeholders . ')', $upper)
            ->get();

        foreach ($employees as $employee) {
            $this->notifyEmployee((int) $employee->emp_id, $message);
        }
    }

    // ==========================================
    // SETTINGS HELPER
    // ==========================================

    // Reads a persisted system setting, falling back to $default when the
    // value was never stored (or the settings table does not exist yet)
    protected function settingValue(string $key, $default = null)
    {
        return Setting::getValue($key, $default);
    }
}
