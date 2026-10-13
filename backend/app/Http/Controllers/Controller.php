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
    const walkInPhone = '0000000000';

    protected array $announcedPendingReplacements = [];

    protected function nextId(string $table, string $pk): int
    {
        return IdAllocator::next($table, $pk);
    }

    protected function existingColumns(string $table, array $attributes): array
    {
        static $listing = [];

        $columns = $listing[$table] ??= Schema::getColumnListing($table);

        return array_filter(
            $attributes,
            static fn (string $column) => in_array($column, $columns, true),
            ARRAY_FILTER_USE_KEY
        );
    }

    protected function fail(string $message, int $status = 400)
    {
        return response()->json([
            'success' => false,
            'message' => (string) $message,
        ], $status);
    }

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

    protected function customerId(Request $request): ?int
    {
        $user = $request->user('api');

        return $user instanceof Customer ? (int) $user->cust_id : null;
    }

    protected function isEmployee($user): bool
    {
        return $user instanceof Employee;
    }

    protected function isSuperAdmin($user): bool
    {
        return $user instanceof Employee && $user->isSuperAdmin();
    }

    protected function isAdmin($user): bool
    {
        return $user instanceof Employee && $user->isAdmin();
    }

    protected function requireEmployee(Request $json)
    {
        if (!$this->isEmployee($json->user('api'))) {
            return response()->json([
                'success' => false,
                'message' => 'Access denied. Employee accounts only.'
            ], 403);
        }

        return null;
    }

    protected function requireSuperAdmin(Request $json)
    {
        if (!$this->isSuperAdmin($json->user('api'))) {
            return response()->json([
                'success' => false,
                'message' => 'Super admin only.'
            ], 403);
        }

        return null;
    }

    protected function credentialChangeBlocked($stamp)
    {
        if ($stamp && $stamp->copy()->addDays(30)->isFuture()) {
            return response()->json([
                'success' => false,
                'message' => 'This change is locked within 30 days of the last update.'
            ], 409);
        }

        return null;
    }

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
            'message' => 'Availability is locked for block #' . $block->sched_id
                . ' started at ' . $block->sched_time_start->toDateTimeString()
                . '. A super admin must override this change.',
            'code'    => 'ALR_AVAIL_AFTER_BLOCK_START',
        ], 403);
    }

    protected function currentBlock(int $empId): ?Schedule
    {
        return Schedule::where('emp_id', $empId)
            ->whereNull('sched_disabled')
            ->where('sched_time_end', '>=', now())
            ->orderBy('sched_time_start')
            ->first();
    }

    protected function walkInVisitRequired(Customer $customer, string $action): ?array
    {
        if ($customer === null || $customer->cust_phone !== self::walkInPhone) {
            return null;
        }

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

    protected function notifyCustomer(int $custId, string $message): void
    {
        CustNotif::create([
            'custnotif_id'      => $this->nextId('custnotif', 'custnotif_id'),
            'cust_id'           => $custId,
            'custnotif_created' => now(),
            'custnotif_read'    => null,
            'custnotif_msg'     => $message,
            'custnotif_type'    => str_starts_with($message, '[PRIORITY]') ? 'priority' : 'regular',
        ]);
    }

    protected function notifyStaffShortage(): void    {
        $slotMinutes = (int) SystemSettings::get('slot_minutes', 10);

        foreach (Visit::where('appoint_status', 'upcoming')
            ->whereNull('appoint_closed')
            ->where('appoint_start', '>=', now())
            ->get() as $appointment) {

            $start = $appointment->appoint_start;
            $end = $appointment->appoint_end ?? $start->copy()->addMinutes($slotMinutes);

            $inStore   = (new AppointmentsAPI())->rosterHeadcount($start, $end);
            $minStaff  = 1;

            if ($inStore === null || $inStore >= $minStaff) continue;

            $message = '[PRIORITY] Your appointment #' . $appointment->appoint_id
                . ' on ' . $start->format('Y-m-d H:i')
                . ' is unavailable. Reason: staff shortage. '
                . 'Please reschedule at your earliest convenience.';

            if (CustNotif::where('cust_id', $appointment->cust_id)
                ->where('custnotif_msg', 'like', '%appointment #' . $appointment->appoint_id . '%')
                ->where('custnotif_msg', 'like', '%staff shortage%')
                ->exists()) {
                continue;
            }

            $this->notifyCustomer((int) $appointment->cust_id, $message);
        }
    }

    protected function staffBlocksNeedingCover(Employee $employee): \Illuminate\Support\Collection
    {
        return Schedule::where('emp_id', $employee->getKey())
            ->whereNull('sched_disabled')
            ->where('sched_time_end', '>=', now())
            ->orderBy('sched_time_start')
            ->get();
    }

    protected function announceBlocksPendingReplacement($blocks): void
    {
        foreach ($blocks as $shift) {
            if (! $shift instanceof Schedule) {
                continue;
            }

            $key = (int) $shift->sched_id;
            if (isset($this->announcedPendingReplacements[$key])) {
                continue;
            }
            $this->announcedPendingReplacements[$key] = true;

            $employee = $shift->employee;
            if ($employee === null) {
                continue;
            }
            $employeeName = trim($employee->emp_givname . ' ' . $employee->emp_surname);

            $window = ($shift->sched_time_start ? $shift->sched_time_start->toDateString() : '?')
                . ' (' . optional($shift->sched_time_start)->format('H:i')
                . ' - ' . optional($shift->sched_time_end)->format('H:i') . ')';

            $this->notifyEmployeesByType(
                ['SUPER ADMIN'],
                '[PRIORITY] Shift block #' . $shift->sched_id . ' assigned to ' . $employeeName
                . ' on ' . $window
                . ' is now PENDING REPLACEMENT as of ' . now()->toDateTimeString() . '.'
            );
        }
    }

    protected function notifyEmployee(int $empId, string $message): void
    {
        EmpNotif::create([
            'empnotif_id'      => $this->nextId('empnotif', 'empnotif_id'),
            'emp_id'           => $empId,
            'empnotif_created' => now(),
            'empnotif_read'    => null,
            'empnotif_msg'     => $message,
            'empnotif_type'    => str_starts_with($message, '[PRIORITY]') ? 'priority' : 'regular',
        ]);
    }

    private static ?bool $employeeHasDisabledColumn = null;
    protected function employeeDisabledColumnExists(): bool
    {
        if (self::$employeeHasDisabledColumn === null) {
            try {
                self::$employeeHasDisabledColumn = Schema::hasColumn('employee', 'emp_disabled');
            } catch (\Throwable $e) {
                return false;
            }
        }

        return self::$employeeHasDisabledColumn;
    }

    protected function activeEmployeeQuery()
    {
        $query = Employee::whereNull('emp_deleted');

        if ($this->employeeDisabledColumnExists()) {
            $query->whereNull('emp_disabled');
        }

        return $query;
    }

    protected function notifyAllEmployees(string $message): void
    {
        $employees = $this->activeEmployeeQuery()->get();
        foreach ($employees as $employee) {
            $this->notifyEmployee((int) $employee->emp_id, $message);
        }
    }

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

    private static ?bool $employeeHasTypeColumn = null;

    protected function employeeCategoryExpression(): string
    {
        if (self::$employeeHasTypeColumn === null) {
            try {
                self::$employeeHasTypeColumn = Schema::hasColumn('employee', 'emp_type');
            } catch (\Throwable $e) {
                return 'emp_categ';
            }
        }

        return self::$employeeHasTypeColumn
            ? "COALESCE(NULLIF(emp_categ, ''), emp_type)"
            : 'emp_categ';
    }

    private function normalizeAccess(string $access): string
    {
        $access = strtolower(trim($access));

        if (in_array($access, ['auth', 'view', 'edit', 'delete'], true)) {
            return $access;
        }

        return $access === 'authentication' ? 'auth' : 'view';
    }

    protected function logCustomer(int $custId, string $access, string $endpoint): void
    {
        try {
            \App\Models\CustLog::create([
                'custlog_id' => $this->nextId('custlog', 'custlog_id'),
                'cust_id' => $custId,
                'custlog_access' => $this->normalizeAccess($access),
                'custlog_endpoint' => $endpoint,
                'custlog_created' => now(),
            ]);
        } catch (\Throwable $e) {
        }
    }

    protected function logEmployee(int $empId, string $access, string $endpoint): void
    {
        try {
            EmpLog::create([
                'emplog_id' => $this->nextId('emplog', 'emplog_id'),
                'emp_id' => $empId,
                'emplog_access' => $this->normalizeAccess($access),
                'emplog_endpoint' => $endpoint,
                'emplog_created' => now(),
            ]);
        } catch (\Throwable $e) {
        }
    }

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
        }
    }

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

        if ($kind === 'walkin') {
            return 'guest';
        }

        return (string) $kind;
    }

    const otpPurposes = ['password_change', 'backup_contacts', 'checkout', 'appointment'];

    const otpTtlMinutes = 5;
    const otpMaxAttempts = 5;
    const otpCooldownSeconds = 45;
    const otpVerifiedTtlMinutes = 10;

    protected function otpCodeKey(int $userId, string $purpose, string $scope = 'cust'): string
    {
        return 'otp:code:' . $scope . ':' . $userId . ':' . $purpose;
    }

    protected function signupPendingKey(int $custId): string
    {
        return 'auth:signup_pending:' . $custId;
    }

    protected function otpVerifiedKey(int $userId, string $purpose, string $scope = 'cust'): string
    {
        return 'otp:ok:' . $scope . ':' . $userId . ':' . $purpose;
    }

    protected function otpScope(object $user): string
    {
        return $user instanceof Employee ? 'emp' : 'cust';
    }

    protected function otpSubjectId(object $user): int
    {
        return (int) ($user instanceof Employee ? $user->emp_id : $user->cust_id);
    }

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
        ], now()->addMinutes(self::otpTtlMinutes));

        Cache::put('otp:cool:' . $scope . ':' . $userId . ':' . $purpose, true, self::otpCooldownSeconds);

        $message = '[PRIORITY] Your verification code is ' . $code
            . '. It expires in ' . self::otpTtlMinutes . ' minutes. Do not share it with anyone.';

        if ($user instanceof Employee) {
            $this->notifyEmployee($userId, $message);
            $this->mailEmployeeOtp($user, $code);
        } else {
            $this->notifyCustomer($userId, $message);
        }

        return [$code, null];
    }

    protected function mailEmployeeOtp(Employee $employee, string $code): void
    {
        try {
            $to = (string) $employee->emp_email;
            if ($to === '') {
                return;
            }

            Mail::raw(
                "Your Tindahan ni Isko verification code is {$code}.\n\n"
                . 'It expires in ' . self::otpTtlMinutes . ' minutes. Do not share it with anyone.',
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
        }
    }

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

            if ($tries >= self::otpMaxAttempts) {
                Cache::forget($this->otpCodeKey($userId, $purpose, $scope));

                return [false, 'Too many attempts. Request a new code.'];
            }

            Cache::put($this->otpCodeKey($userId, $purpose, $scope),
                ['hash' => $entry['hash'], 'tries' => $tries],
                now()->addMinutes(self::otpTtlMinutes));

            return [false, 'Incorrect code. Please try again.'];
        }

        Cache::forget($this->otpCodeKey($userId, $purpose, $scope));
        Cache::put($this->otpVerifiedKey($userId, $purpose, $scope), true,
            now()->addMinutes(self::otpVerifiedTtlMinutes));

        return [true, 'Code verified.'];
    }

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
            'message' => 'Verification is required before saving.',
            'data'    => [
                'purpose' => $purpose,
                'channel' => $user instanceof Employee ? 'email' : 'phone',
            ],
        ], 428);
    }

    protected function consumeOtp(Request $json, string $purpose): void
    {
        $user = $json->user('api');

        if ($user instanceof Customer || $user instanceof Employee) {
            Cache::forget($this->otpVerifiedKey($this->otpSubjectId($user), $purpose, $this->otpScope($user)));
        }
    }

    protected function settingValue(string $key, $default = null)
    {
        return SystemSettings::get($key, $default);
    }

        protected function maskPhone(?string $phone): string
        {
            $phone = trim((string) $phone);
            $length = strlen($phone);

            if ($length < 7) {
                return $phone;
            }

            return substr($phone, 0, 4) . str_repeat('*', $length - 7) . substr($phone, -3);
        }

        protected function logActor(Request $json, string $access, string $endpoint): void
        {
            $user = $json->user('api');
            if ($user instanceof Employee) {
                $this->logEmployee((int) $user->getKey(), $access, $endpoint);
            } elseif ($user instanceof Customer) {
                $this->logCustomer((int) $user->getKey(), $access, $endpoint);
            }
        }

    protected function customerAliases(Customer $customer): array
    {
        $address = array_map('trim', explode(',', (string) $customer->cust_address));
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
