<?php

namespace App\Http\Controllers;

use App\Models\Schedule;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class DatabaseAPI extends Controller
{
    public static function passToDatabase(string $query, array $bindings, callable $execute)
    {
        if (trim($query) === '') {
            throw new \InvalidArgumentException('DatabaseAPI rejected an empty query.');
        }

        foreach ($bindings as $binding) {
            if (is_array($binding)
                || (is_object($binding)
                    && ! $binding instanceof \DateTimeInterface
                    && ! $binding instanceof \BackedEnum)) {
                throw new \InvalidArgumentException('DatabaseAPI rejected a non-scalar query binding.');
            }
        }

        $startedAt = microtime(true);

        try {
            return $execute();
        } finally {
            $elapsed = microtime(true) - $startedAt;

            if ($elapsed >= 1.0 && static::$slowestQuery < $elapsed) {
                static::$slowestQuery = $elapsed;
                static::$slowestSql = $query;
            }
        }
    }

    public static function slowestQuerySeconds(): float
    {
        return static::$slowestQuery;
    }

    public static function slowestQuerySql(): ?string
    {
        return static::$slowestSql;
    }

    private static float $slowestQuery = 0.0;
    private static ?string $slowestSql = null;

    public const purgeAfterMonths = 18;

    private const purgeTargets = [
        'orders' => [
            'pk'      => 'ord_id',
            'status'  => ['ord_status' => ['cancelled', 'unclaimed']],
            'since'   => 'ord_created',
            'requires' => ['ord_status', 'ord_created'],
            'cascade' => [
                ['items', 'ord_id'],
                ['pickup', 'ord_id'],
                ['delivery', 'ord_id'],
                ['parcel', 'ord_id'],
            ],
        ],
        'parcel' => [
            'pk'      => 'parcel_id',
            'deleted' => 'parcel_completed',
        ],
        'delivery' => [
            'pk'      => 'deliver_id',
            'deleted' => ['deliver_completed', 'deliver_deleted'],
        ],
        'bag'      => ['pk' => 'bag_id',      'deleted' => 'bag_deleted',      'held_by' => [['items', 'bag_id']]],
        'wishlist' => ['pk' => 'wish_id',     'deleted' => 'wish_hidden',      'held_by' => []],
        'prodvar'  => ['pk' => 'prodvar_id',  'deleted' => 'prodvar_deleted',  'held_by' => [
            ['bag', 'prodvar_id'],
            ['prodsales', 'prodvar_id'],
        ]],
        'reviews' => [
            'pk'       => 'rev_id',
            'raw'      => "(rev_msg LIKE '[DELETED]%' OR rev_msg LIKE '[REJECTED]%') AND rev_approved IS NULL",
            'since'    => 'rev_created',
            'requires' => ['rev_msg', 'rev_approved', 'rev_created'],
        ],
        'product'  => ['pk' => 'prod_id',     'deleted' => 'prod_deleted',     'held_by' => [
            ['prodvar', 'prod_id'],
            ['reviews', 'prod_id'],
        ]],
        'appointments' => [
            'pk'         => 'appoint_id',
            'status'     => ['appoint_status' => ['cancelled', 'absent']],
            'since_expr' => 'COALESCE(appoint_closed, appoint_created)',
            'requires'   => ['appoint_status', 'appoint_closed', 'appoint_created'],
            'held_by'    => [['pickup', 'appoint_id']],
        ],
        'custnotif' => ['pk' => 'custnotif_id', 'read' => 'custnotif_read'],
        'empnotif'  => ['pk' => 'empnotif_id',  'read' => 'empnotif_read'],
        'employee' => ['pk' => 'emp_id',      'deleted' => 'emp_deleted',      'held_by' => [
            ['appointment', 'emp_id'],
            ['appointments', 'emp_id'],
            ['schedules', 'emp_id'],
            ['duty_shift', 'emp_id'],
            ['emplog', 'emp_id'],
            ['empnotif', 'emp_id'],
        ]],
        'customer' => ['pk' => 'cust_id',     'deleted' => 'cust_deleted',     'held_by' => [
            ['orders', 'cust_id'],
            ['appointment', 'cust_id'],
            ['appointments', 'cust_id'],
            ['bag', 'cust_id'],
            ['wishlist', 'cust_id'],
            ['delivery', 'cust_id'],
            ['custlog', 'cust_id'],
            ['custnotif', 'cust_id'],
            ['reviews', 'cust_id'],
        ]],
    ];

    public static function purgeSoftDeleted(?int $months = null): array
    {
        $months = $months ?? self::purgeAfterMonths;
        $cutoff = now()->subMonths($months);
        $purged = [];

        foreach (self::purgeTargets as $table => $target) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $target['pk'])) {
                continue;
            }

            foreach (self::purgeQueries($table, $target, $cutoff) as $build) {
                foreach ($target['cascade'] ?? [] as [$child, $fk]) {
                    if (! Schema::hasTable($child) || ! Schema::hasColumn($child, $fk)) {
                        continue;
                    }

                    $cascaded = DB::table($child)
                        ->whereIn($fk, $build()->select($target['pk']))
                        ->delete();

                    if ($cascaded > 0) {
                        $purged[$child] = ($purged[$child] ?? 0) + $cascaded;
                    }
                }

                $count = self::holdHeldBack($build(), $table, $target)->delete();

                if ($count > 0) {
                    $purged[$table] = ($purged[$table] ?? 0) + $count;
                }
            }
        }

        return $purged;
    }

    private static function purgeQueries(string $table, array $target, $cutoff): array
    {
        $queries = [];

        foreach ((array) ($target['deleted'] ?? []) as $column) {
            if (! Schema::hasColumn($table, $column)) {
                continue;
            }

            $queries[] = fn () => DB::table($table)
                ->whereNotNull($column)
                ->where($column, '<=', $cutoff);
        }

        if (! empty($target['read']) && Schema::hasColumn($table, $target['read'])) {
            $column = $target['read'];

            $queries[] = fn () => DB::table($table)
                ->whereNotNull($column)
                ->where($column, '<=', $cutoff);
        }

        if (empty($target['status']) && empty($target['raw'])) {
            return $queries;
        }

        foreach ($target['requires'] ?? [] as $column) {
            if (! Schema::hasColumn($table, $column)) {
                return [];
            }
        }

        $queries[] = function () use ($table, $target, $cutoff) {
            $query = DB::table($table);

            foreach ($target['status'] ?? [] as $column => $values) {
                $query->whereRaw(
                    'LOWER(' . $column . ') IN (' . implode(',', array_fill(0, count($values), '?')) . ')',
                    array_map('strtolower', $values)
                );
            }

            if (! empty($target['raw'])) {
                $query->whereRaw($target['raw']);
            }

            if (! empty($target['since_expr'])) {
                $query->whereRaw($target['since_expr'] . ' <= ?', [$cutoff]);
            } elseif (! empty($target['since'])) {
                $query->where($target['since'], '<=', $cutoff);
            }

            return $query;
        };

        return $queries;
    }

    private static function holdHeldBack($query, string $table, array $target)
    {
        foreach ($target['held_by'] ?? [] as [$refTable, $refColumn]) {
            if (! Schema::hasTable($refTable) || ! Schema::hasColumn($refTable, $refColumn)) {
                continue;
            }

            $query->whereNotExists(function ($sub) use ($table, $target, $refTable, $refColumn) {
                $sub->selectRaw('1')
                    ->from($refTable)
                    ->whereColumn($refTable . '.' . $refColumn, $table . '.' . $target['pk']);
            });
        }

        return $query;
    }

    public const accessLogPurgeMonths = 24;

    public const accessLogAutoPurgeMonths = 60;

    public const accessLogAskEveryDays = 14;

    public const accessLogAsk = 'Access-log retention: does a super admin want every access log entry older than 24 months permanently deleted now? A super admin may decide from Admin > Settings > Access Log. If none of you decides, every entry older than 24 months will be deleted anyway 60 months after it was recorded.';

    public function purgeAccessLogs(int $months): array
    {
        $cutoff = now()->subMonths($months);
        $purged = [];

        foreach (['custlog' => 'custlog_created', 'emplog' => 'emplog_created'] as $table => $column) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
                continue;
            }

            $count = DB::table($table)->where($column, '<=', $cutoff)->delete();

            if ($count > 0) {
                $purged[$table] = $count;
            }
        }

        if ($purged !== []) {
            $this->notifyEmployeesByType(['SUPER ADMIN'], $this->accessLogPurgeNotice($purged, $months));
        }

        return $purged;
    }

    public function sweepAccessLogRetention(): array
    {
        $purged = $this->purgeAccessLogs(self::accessLogAutoPurgeMonths);

        if ($purged !== []) {
            \Log::info('Access-log retention sweep (60 months)', $purged);
        }

        return $purged;
    }

    public function promptAccessLogPurge(?string $marker = null): bool
    {
        $marker = $marker ?? storage_path('framework/access-log-purge-asked');

        $lastAsked = @file_get_contents($marker);

        if ($lastAsked !== false
            && Carbon::parse($lastAsked)->addDays(self::accessLogAskEveryDays)->isFuture()) {
            return false;
        }

        $audience = $this->activeEmployeeQuery()
            ->whereRaw('UPPER(' . $this->employeeCategoryExpression() . ') IN (?)', ['SUPER ADMIN'])
            ->count();

        if ($audience === 0) {
            return false;
        }

        $this->notifyEmployeesByType(['SUPER ADMIN'], self::accessLogAsk);

        @file_put_contents($marker, now()->toIso8601String());

        return true;
    }

    private function accessLogPurgeNotice(array $purged, int $months): string
    {
        $total = array_sum($purged);
        $breakdown = $this->logBreakdown($purged);

        if ($months >= self::accessLogAutoPurgeMonths) {
            return 'Access-log retention: ' . $total . ' access log entries older than '
                . $months . ' months were permanently deleted (' . $breakdown . ').';
        }

        return 'Access-log retention: a super admin ran the ' . $months . '-month purge and '
            . $total . ' access log entries were permanently deleted (' . $breakdown . ').';
    }

    private function logBreakdown(array $purged): string
    {
        $parts = [];

        foreach (['custlog' => 'customer', 'emplog' => 'employee'] as $table => $label) {
            if (! empty($purged[$table])) {
                $parts[] = $purged[$table] . ' ' . $label;
            }
        }

        return $parts === [] ? 'none' : implode(', ', $parts);
    }

    public function customerSignup(Request $json)
    {
        $this->aliasSignupFields($json);

        $requiredCheck = $this->validateFields($json, [
            'email'    => 'required|email:rfc',
            'phone'    => 'required',
            'password' => 'required',
            'givname'  => 'required|string|max:100',
            'surname'  => 'required|string|max:100',
            'type'     => 'required|string|max:50',
        ], [
            'email.required'    => 'Email address is required.',
            'email.email'       => 'Invalid email format.',
            'phone.required'    => 'Phone number is required.',
            'password.required' => 'Password is required.',
            'givname.required'  => 'Given name is required.',
            'surname.required'  => 'Surname is required.',
            'type.required'     => 'Please choose your account type.',
        ]);
        if ($requiredCheck) {
            return $requiredCheck;
        }

        $kind = $this->normalizeSignupType($json->input('type'));

        if (! in_array($kind, ['bueno', 'guest'], true)) {
            return $this->fail('Account type must be either "BUeño" or "guest".', 422);
        }

        if ($kind === 'guest') {
            return $this->validateAllFormats($json);
        }

        $buenoCheck = $this->validateFields($json, [
            'cust_categ'   => 'required|in:student,alumni,faculty',
            'cust_college' => 'required|string|max:120',
            'cust_dept'    => 'required|string|max:120',
            'email'        => 'required|email:rfc|ends_with:bicol-u.edu.ph',
        ], [
            'cust_categ.required'   => 'Please choose your category (student, alumni, or faculty).',
            'cust_categ.in'         => 'Please choose your category (student, alumni, or faculty).',
            'cust_college.required' => 'College or institute is required.',
            'cust_dept.required'    => 'Department or program is required.',
            'email.required'        => 'Bicol University email address is required.',
            'email.ends_with'       => 'Use a Bicol University email address (name@bicol-u.edu.ph).',
        ]);
        if ($buenoCheck) {
            return $buenoCheck;
        }

        return $this->validateAllFormats($json);
    }

    private function aliasSignupFields(Request $json): void
    {
        $pairs = [
            'cust_categ'   => ['categ'],
            'cust_college' => ['college'],
            'cust_dept'    => ['dept', 'course', 'program'],
            'bday'         => ['birthday'],
            'backup_phone' => ['backupphone'],
            'backup_email' => ['backupemail', 'backup_email'],
            'type'         => ['cust_type', 'role'],
        ];

        foreach ($pairs as $canonical => $aliases) {
            if ($json->filled($canonical)) {
                continue;
            }
            foreach ($aliases as $alias) {
                if ($json->filled($alias)) {
                    $json->merge([$canonical => $json->input($alias)]);
                    break;
                }
            }
        }

        if (! $json->filled('cust_categ')) {
            $fromType = preg_replace('/[^a-z]/', '', strtolower((string) $json->input('type')));
            if (in_array($fromType, ['student', 'alumni', 'faculty'], true)) {
                $json->merge(['cust_categ' => $fromType]);
            }
        }

        $mirror = [
            'birthday'    => 'bday',
            'backupphone' => 'backup_phone',
            'backupemail' => 'backup_email',
        ];
        foreach ($mirror as $legacy => $canonical) {
            if (! $json->filled($legacy) && $json->filled($canonical)) {
                $json->merge([$legacy => $json->input($canonical)]);
            }
        }

        if (! $json->filled('givname') && $json->filled('nickname')) {
            $full = trim(preg_replace('/\s+/', ' ', (string) $json->input('nickname')));
            $space = strpos($full, ' ');
            $json->merge([
                'givname' => $space === false ? $full : substr($full, 0, $space),
                'surname' => $space === false ? $full : substr($full, $space + 1),
            ]);
        }
    }

    public function customerLogin(Request $json)
    {
        $requiredCheck = $this->validateFields($json, [
            'email'    => 'required_without:phone|nullable|string|max:255',
            'phone'    => 'required_without:email',
            'password' => 'required',
        ], [
            'email.required_without' => 'Email address is required to log in.',
            'phone.required_without' => 'Email address is required to log in.',
            'password.required'      => 'Password is required.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        if ($json->filled('email') && ! str_contains((string) $json->input('email'), '@')) {
            $json->merge([
                'phone' => $json->input('phone') ?: $json->input('email'),
                'email' => null,
            ]);
        }

        if ($json->filled('email')) {
            $emailCheck = $this->validateFields($json, [
                'email' => 'required|email:rfc',
            ], [
                'email.email' => 'Invalid email format.',
            ]);
            if ($emailCheck) return $emailCheck;
        }

        return $this->validateAllFormats($json);
    }

    public function otpChallengeStart(Request $json)
    {
        return $this->validateFields($json, [
            'purpose'   => 'required|in:signup,login',
            'challenge' => 'required|string',
        ], [
            'purpose.required'   => 'A verification purpose is required.',
            'purpose.in'         => 'Unknown verification purpose.',
            'challenge.required' => 'The verification session expired. Please start again.',
        ]);
    }

    public function otpChallengeVerify(Request $json)
    {
        return $this->validateFields($json, [
            'purpose'   => 'required|in:signup,login',
            'challenge' => 'required|string',
            'code'      => 'required|string|digits:6',
        ], [
            'purpose.required'    => 'A verification purpose is required.',
            'purpose.in'          => 'Unknown verification purpose.',
            'challenge.required'  => 'The verification session expired. Please start again.',
            'code.required'       => 'The verification code is required.',
            'code.digits'         => 'The verification code must be 6 digits.',
        ]);
    }

    public function employeeSignup(Request $json)
    {
        $requiredCheck = $this->validateFields($json, [
            'email' => 'required',
            'phone' => 'required',
            'surname' => 'required',
            'givname' => 'required',
        ], [
            'email.required' => 'University email is required.',
            'phone.required' => 'Phone number is required.',
            'surname.required' => 'Surname is required.',
            'givname.required' => 'Given name is required.',
        ]);
        if ($requiredCheck) {
            return $requiredCheck;
        }

        $emailCheck = $this->validateFields($json, [
            'email' => 'required|email:rfc|ends_with:bicol-u.edu.ph',
        ], [
            'email.required' => 'University email is required.',
            'email.email' => 'Invalid email format.',
            'email.ends_with' => 'Use a Bicol University email address.',
        ]);
        if ($emailCheck) {
            return $emailCheck;
        }

        $categoryCheck = $this->validateFields($json, [
            'categ' => 'nullable|in:staff,admin,super admin,STAFF,ADMIN,SUPER ADMIN',
            'type' => 'nullable|in:staff,admin,super admin,STAFF,ADMIN,SUPER ADMIN',
        ], [
            'categ.in' => 'Category must be staff, admin or super admin.',
            'type.in' => 'Category must be staff, admin or super admin.',
        ]);
        if ($categoryCheck) {
            return $categoryCheck;
        }

        $optionalCheck = $this->validateFields($json, [
            'midname'   => 'nullable|string|max:100',
            'suffix'    => 'nullable|string|max:20',
            'studnum'   => 'nullable|string|max:50',
            'pronoun'   => 'nullable|string|max:50',
            'birthday'  => 'nullable|date|before:today',
            'brgy'      => 'nullable|string|max:100',
            'city'      => 'nullable|string|max:100',
            'province'  => 'nullable|string|max:100',
            'country'   => 'nullable|string|max:100',
            'callcode'  => 'nullable|regex:/^\+?[0-9]{1,4}$/',
            'instore'   => 'nullable|boolean',
        ], [
            'callcode.regex' => 'Call code must be a valid country code (e.g., +63).',
            'instore.boolean' => 'In-store status must be true or false.',
        ]);
        if ($optionalCheck) {
            return $optionalCheck;
        }

        $shiftCheck = $this->validateFields($json, [
            'shifts'                    => 'nullable|array|max:30',
            'shifts.*.shift_date'       => 'required_with:shifts|date_format:Y-m-d',
            'shifts.*.shift_start'      => 'required_with:shifts|date_format:H:i',
            'shifts.*.shift_end'        => 'required_with:shifts|date_format:H:i',
        ], [
            'shifts.array'              => 'The schedule must be a list of duty blocks.',
            'shifts.max'                => 'An enrollment can preschedule at most 30 duty blocks.',
            'shifts.*.shift_date.required_with' => 'Every duty block needs a date.',
            'shifts.*.shift_date.date_format'  => 'Every duty block date must use the YYYY-MM-DD format.',
            'shifts.*.shift_start.required_with' => 'Every duty block needs a start time.',
            'shifts.*.shift_start.date_format'  => 'Duty block times must use the HH:MM 24-hour format.',
            'shifts.*.shift_end.required_with' => 'Every duty block needs an end time.',
            'shifts.*.shift_end.date_format'  => 'Duty block times must use the HH:MM 24-hour format.',
        ]);
        if ($shiftCheck) {
            return $shiftCheck;
        }

        return $this->validateAllFormats($json);
    }

    public function employeeLogin(Request $json)
    {
        $requiredCheck = $this->validateFields($json, [
            'email'    => 'required',
            'password' => 'required',
        ], [
            'email.required'    => 'Email is required.',
            'password.required' => 'Password is required.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        return null;
    }

    protected function validateAllFormats(Request $json)
    {
        $checks = [
            $this->email($json),
            $this->backupEmail($json),
            $this->phone($json),
            $this->backupPhone($json),
            $this->password($json),
            $this->nickname($json),
            $this->birthday($json),
            $this->names($json),
            $this->callcodes($json),
            $this->generalStrings($json),
            $this->booleans($json)
        ];

        foreach ($checks as $check) {
            if ($check) return $check;
        }

        return null;
    }

    public function email(Request $json)
    {
        return $this->validateFields($json, [
            'email' => 'nullable|email:rfc'
        ], [
            'email.email' => 'Invalid email format.'
        ]);
    }

    public function backupEmail(Request $json)
    {
        return $this->validateFields($json, [
            'backupemail' => 'nullable|email:rfc'
        ], [
            'backupemail.email' => 'Invalid backup email format.'
        ]);
    }

    public function phone(Request $json)
    {
        if ($json->has('phone')) {
            $cleaned = preg_replace('/[^0-9]/', '', (string)$json->input('phone'));
            if (strlen($cleaned) >= 12 && strpos($cleaned, '63') === 0) {
                $cleaned = '0' . substr($cleaned, 2);
            }
            if ($cleaned === '0000000000') {
                return $this->fail('Phone number is reserved.', 422);
            }
            $json->merge(['phone' => $cleaned]);
        }

        return $this->validateFields($json, [
            'phone' => 'nullable|regex:/^[0-9]{10,11}$/'
        ], [
            'phone.regex' => 'Phone number must be 10 to 11 digits.'
        ]);
    }

    public function backupPhone(Request $json)
    {
        if ($json->has('backupphone')) {
            $cleaned = preg_replace('/[^0-9]/', '', (string)$json->input('backupphone'));
            if (strlen($cleaned) >= 12 && strpos($cleaned, '63') === 0) {
                $cleaned = '0' . substr($cleaned, 2);
            }
            $json->merge(['backupphone' => $cleaned]);
        }

        return $this->validateFields($json, [
            'backupphone' => 'nullable|regex:/^[0-9]{10,11}$/'
        ], [
            'backupphone.regex' => 'Backup phone number must be 10 to 11 digits.'
        ]);
    }

    public function password(Request $json)
    {
        return $this->validateFields($json, [
            'password' => [
                'nullable',
                'string',
                'min:8',
                'regex:/^[^\s\x00-\x1F\x7F]+$/'
            ]
        ], [
            'password.min'   => 'Password must be at least 8 characters.',
            'password.regex' => 'Password contains invalid control characters.'
        ]);
    }

    public function nickname(Request $json)
    {
        return $this->validateFields($json, [
            'nickname' => 'nullable|string|min:2|regex:/^[A-Za-z0-9_\s\.\-]+$/'
        ], [
            'nickname.min'   => 'Nickname must be at least 2 characters.',
            'nickname.regex' => 'Nickname contains invalid characters.'
        ]);
    }

    public function birthday(Request $json)
    {
        return $this->validateFields($json, [
            'birthday' => 'nullable|date|before:today'
        ], [
            'birthday.date'   => 'Birthday must be a valid date.',
            'birthday.before' => 'Birthday must be a date in the past.'
        ]);
    }

    public function names(Request $json)
    {
        return $this->validateFields($json, [
            'surname' => 'nullable|string|max:100',
            'givname' => 'nullable|string|max:100',
            'midname' => 'nullable|string|max:100',
            'suffix'  => 'nullable|string|max:20',
        ], [
            'surname.string' => 'Surname must be a string.',
            'givname.string' => 'Given name must be a string.',
            'midname.string' => 'Middle name must be a string.',
            'suffix.string'  => 'Suffix must be a string.',
        ]);
    }

    public function callcodes(Request $json)
    {
        return $this->validateFields($json, [
            'callcode'       => 'nullable|regex:/^\+?[0-9]{1,4}$/',
            'backupcallcode' => 'nullable|regex:/^\+?[0-9]{1,4}$/'
        ], [
            'callcode.regex'       => 'Call code must be a valid country code (e.g., +63).',
            'backupcallcode.regex' => 'Backup call code must be a valid country code (e.g., +63).'
        ]);
    }

    public function generalStrings(Request $json)
    {
        return $this->validateFields($json, [
            'pronoun'  => 'nullable|string|max:50',
            'address'  => 'nullable|string|max:255',
            'brgy'     => 'nullable|string|max:100',
            'city'     => 'nullable|string|max:100',
            'province' => 'nullable|string|max:100',
            'country'  => 'nullable|string|max:100',
            'type'     => 'nullable|string|max:50',
            'college'  => 'nullable|string|max:100',
            'program'  => 'nullable|string|max:100',
            'year'     => 'nullable|integer|min:1|max:5',
            'bloc'     => 'nullable|string|max:50',
            'studnum'  => 'nullable|string|max:50',
        ]);
    }

    public function booleans(Request $json)
    {
        return $this->validateFields($json, [
            'instore' => 'nullable|boolean'
        ], [
            'instore.boolean' => 'In-store status must be true or false.'
        ]);
    }

    public function addProduct(Request $json)
    {
        return $this->validateFields($json, [
            'prod_name'  => 'required|string',
            'prod_price' => 'required|numeric',
        ], [
            'prod_name.required'  => 'Product name is required.',
            'prod_name.string'    => 'Product name must be text.',
            'prod_price.required' => 'Product price is required.',
            'prod_price.numeric'  => 'Product price must be a number.',
        ]);
    }

    public function updateProductDetails(Request $json)
    {
        $requiredCheck = $this->validateFields($json, [
            'prod_id' => 'required',
        ], [
            'prod_id.required' => 'Product ID is required to update details.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        $prodId = $json->input('prod_id');

        return $this->validateFields($json, [
            'prod_id'    => 'integer|exists:product,prod_id',
            'prod_name'  => 'nullable|string|max:255|unique:product,prod_name,' . $prodId . ',prod_id',
            'prod_tag'   => 'nullable|string|max:255|unique:product,prod_tag,' . $prodId . ',prod_id',
            'prod_categ' => 'nullable|string|max:100',
            'prod_price' => 'nullable|numeric|min:0',
            'prod_qty'   => 'nullable|integer|min:0',
            'prodvar_id' => 'nullable|integer|exists:prodvar,prodvar_id',
            'prod_desc'  => 'nullable|string',
        ], [
            'prod_id.exists'     => 'Product not found.',
            'prodvar_id.exists'  => 'Product variation not found.',
            'prod_name.unique'   => 'Product name already exists.',
            'prod_tag.unique'    => 'Product tag already exists.',
            'prod_price.numeric' => 'Product price must be a number.',
            'prod_price.min'     => 'Product price cannot be negative.',
            'prod_qty.integer'   => 'Product quantity must be an integer.',
            'prod_qty.min'       => 'Product quantity cannot be negative.',
        ]);
    }

    public function flagIrregularity(Request $json)
    {
        return $this->validateFields($json, [
            'action' => 'required',
            'desc'   => 'required',
        ], [
            'action.required' => 'Action title is required.',
            'desc.required'   => 'Description is required.',
        ]);
    }

    public function logAction(Request $json)
    {
        return $this->validateFields($json, [
            'action' => 'required',
            'desc'   => 'required',
        ], [
            'action.required' => 'Action name is required.',
            'desc.required'   => 'Description is required.',
        ]);
    }

    public function changeAccountType(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
            'new_type'     => 'required',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type (customer or employee) is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
            'new_type.required'     => 'New account type is required.',
        ]);
    }

    public function deleteAccount(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
        ]);
    }

    public function disableAccount(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
            'reason'       => 'required',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
            'reason.required'       => 'A reason for disabling the account is required.',
        ]);
    }

    public function recoverAccount(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
        ]);
    }

    public function updateAccountDetails(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
        ]);
    }

    public function createShift(Request $json)
    {
        $requiredCheck = $this->validateFields($json, [
            'emp_id'      => 'required|integer|exists:employee,emp_id',
            'shift_date'  => 'required|date_format:Y-m-d',
            'shift_start' => 'required|date_format:H:i',
            'shift_end'   => 'required|date_format:H:i|after:shift_start',
        ], [
            'emp_id.required'         => 'Employee ID is required.',
            'emp_id.integer'          => 'Employee ID must be a whole number.',
            'emp_id.exists'           => 'Employee does not exist.',
            'shift_date.required'     => 'Shift date is required.',
            'shift_date.date_format'  => 'Shift date must use the YYYY-MM-DD format.',
            'shift_start.required'    => 'Shift start time is required.',
            'shift_start.date_format' => 'Shift start time must use the HH:MM 24-hour format.',
            'shift_end.required'      => 'Shift end time is required.',
            'shift_end.date_format'   => 'Shift end time must use the HH:MM 24-hour format.',
            'shift_end.after'         => 'Shift end time must be later than the start time.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        return $this->validateFields($json, [
            'status'         => 'nullable|in:SCHEDULED,ACTIVE,COMPLETED,PENDING REPLACEMENT',
            'shift_type'     => 'nullable|string|max:100',
            'shift_location' => 'nullable|string|max:100',
        ], [
            'status.in' => 'Status must be SCHEDULED, ACTIVE, COMPLETED or PENDING REPLACEMENT.',
        ]);
    }

    public function updateShift(Request $json, Schedule $shift)
    {
        $requiredCheck = $this->validateFields($json, [
            'emp_id'      => 'nullable|integer|exists:employee,emp_id',
            'shift_date'  => 'nullable|date_format:Y-m-d',
            'shift_start' => 'nullable|date_format:H:i',
            'shift_end'   => 'nullable|date_format:H:i',
            'emp_instore' => 'nullable|boolean',
            'unavailable' => 'nullable|boolean',
            'shift_type'     => 'nullable|string|max:100',
            'shift_location' => 'nullable|string|max:100',
        ], [
            'emp_id.exists'           => 'Employee does not exist.',
            'shift_date.date_format'  => 'Shift date must use the YYYY-MM-DD format.',
            'shift_start.date_format' => 'Shift start time must use the HH:MM 24-hour format.',
            'shift_end.date_format'   => 'Shift end time must use the HH:MM 24-hour format.',
            'emp_instore.boolean'     => 'Availability must be true or false.',
            'unavailable.boolean'     => 'Unavailable must be true or false.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        $start = (string) $json->input(
            'shift_start',
            optional($shift->sched_time_start)->format('H:i')
        );
        $end = (string) $json->input(
            'shift_end',
            optional($shift->sched_time_end)->format('H:i')
        );

        if ($start !== '' && $end !== '' && $end <= $start) {
            return $this->fail('Shift end time must be later than the start time.');
        }

        return null;
    }

    public function createAppointment(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id'       => 'required',
            'appoint_date'  => 'required_without:appoint_start',
            'appoint_start' => 'nullable',
            'appoint_type'  => 'required',
        ], [
            'cust_id'       => 'Customer ID is required.',
            'appoint_date.required_without' => 'Appointment date is required: send appoint_start (live column) or appoint_date (legacy alias).',
            'appoint_type'  => 'Appointment type is required.',
        ]);
    }

    public function closeAppointment(Request $json)
    {
        return $this->validateFields($json, [
            'appoint_id' => 'required',
            'reason'     => 'required|string|max:500',
        ], [
            'appoint_id.required' => 'Appointment ID is required.',
            'reason.string'       => 'Reason must be a string.',
        ]);
    }

    public function updateAppointmentDetails(Request $json)
    {
        return $this->validateFields($json, [
            'appoint_id' => 'required',
        ], [
            'appoint_id.required' => 'Appointment ID is required.',
        ]);
    }

    public function backupCredentials(Request $json)
    {
        return $this->validateAllFormats($json);
    }

    public function recoverCredentials(Request $json)
    {
        return $this->validateFields($json, [
            'identifier'   => 'required',
            'account_type' => 'required|in:customer,employee',
        ], [
            'identifier.required'   => 'Identifier (phone or email) is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
        ]);
    }

    public function updateCredentials(Request $json)
    {
        $credentials = $this->validateFields($json, [
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:8|regex:/^[^\s\x00-\x1F\x7F]+$/',
            'new_password_confirmation' => 'nullable|same:new_password',
        ], [
            'current_password.required' => 'Current password is required.',
            'new_password.required' => 'New password is required.',
            'new_password.min' => 'New password must be at least 8 characters.',
            'new_password.regex' => 'New password contains invalid characters.',
            'new_password_confirmation.same' => 'New password confirmation does not match.',
        ]);
        if ($credentials) {
            return $credentials;
        }

        return $this->validateAllFormats($json);
    }

    public function createReview(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'     => 'required_without:prod_id',
            'prod_id'    => 'required_without:ord_id',
            'ord_rating' => 'required_without:rating|numeric|min:1|max:5',
            'rating'     => 'sometimes|nullable|numeric|min:1|max:5',
        ], [
            'ord_id.required_without'     => 'Order ID or product ID is required.',
            'prod_id.required_without'    => 'Order ID or product ID is required.',
            'ord_rating.required_without' => 'Rating score is required.',
            'ord_rating.numeric'          => 'Rating must be a number between 1 and 5.',
            'ord_rating.min'              => 'Rating must be a number between 1 and 5.',
            'ord_rating.max'              => 'Rating must be a number between 1 and 5.',
            'rating.numeric'              => 'Rating must be a number between 1 and 5.',
            'rating.min'                  => 'Rating must be a number between 1 and 5.',
            'rating.max'                  => 'Rating must be a number between 1 and 5.',
        ]);
    }

    public function deleteReview(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required_without:rev_id',
            'rev_id' => 'sometimes|nullable',
        ], [
            'ord_id.required_without' => 'Order ID is required.',
        ]);
    }

    public function moderateReview(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required_without:rev_id',
            'rev_id' => 'sometimes|nullable',
        ], [
            'ord_id.required_without' => 'Order ID is required.',
        ]);
    }

    public function updateReview(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required_without:rev_id',
            'rev_id' => 'sometimes|nullable',
        ], [
            'ord_id.required_without' => 'Order ID is required.',
        ]);
    }

    public function updateSettings(Request $json)
    {
        return $this->validateFields($json, [
            'settings' => 'required|array',
        ], [
            'settings.required' => 'Settings dictionary is required.',
            'settings.array'    => 'Settings must be an array / dictionary.',
        ]);
    }

    public function issueOtp(Request $json)
    {
        return $this->validateFields($json, [
            'purpose' => 'required|in:' . implode(',', Controller::otpPurposes),
        ], [
            'purpose.required' => 'A verification purpose is required.',
            'purpose.in'       => 'Unknown verification purpose.',
        ]);
    }

    public function verifyOtp(Request $json)
    {
        return $this->validateFields($json, [
            'purpose' => 'required|in:' . implode(',', Controller::otpPurposes),
            'code'    => 'required|string|digits:6',
        ], [
            'purpose.required' => 'A verification purpose is required.',
            'purpose.in'       => 'Unknown verification purpose.',
            'code.required'    => 'The verification code is required.',
            'code.digits'      => 'The verification code must be 6 digits.',
        ]);
    }

    public function addWishlistItem(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id' => 'required',
            'prod_id' => 'required',
        ], [
            'cust_id.required' => 'Customer ID is required.',
            'prod_id.required' => 'Product ID is required.',
        ]);
    }

    public function addWishlistToOrder(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id' => 'required',
            'prod_id' => 'required',
        ], [
            'cust_id.required' => 'Customer ID is required.',
            'prod_id.required' => 'Product ID is required.',
        ]);
    }

    public function removeWishlistItem(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id' => 'required',
            'prod_id' => 'required',
        ], [
            'cust_id.required' => 'Customer ID is required.',
            'prod_id.required' => 'Product ID is required.',
        ]);
    }

    public function updateWishlistItem(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id' => 'required',
            'prod_id' => 'required',
        ], [
            'cust_id.required' => 'Customer ID is required.',
            'prod_id.required' => 'Product ID is required.',
        ]);
    }

    public function addOrder(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id' => 'sometimes|nullable|integer',
            'prod_id' => 'required_without:items',
            'items'   => 'required_without:prod_id|array',
        ], [
            'cust_id.integer'          => 'Customer ID must be an integer.',
            'prod_id.required_without' => 'prod_id or items array is required.',
            'items.required_without'   => 'prod_id or items array is required.',
            'items.array'              => 'items must be an array of order lines.',
        ]);
    }

    public function removeOrder(Request $json)
    {
        return $this->validateFields($json, [
            'bag_id'  => 'required_without_all:item_id,ord_id',
            'item_id' => 'sometimes|nullable',
            'ord_id'  => 'sometimes|nullable',
        ], [
            'bag_id.required_without_all' => 'bag_id is required.',
        ]);
    }

    public function determineDispatchDetails(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'nullable|integer',
            'bag_ids' => 'nullable|array',
            'bag_ids.*' => 'integer',
            'dispatch_type' => 'required|in:pickup,delivery',
            'speed' => 'nullable|in:priority,standard,saver',
            'deliver_address' => 'nullable|string|max:500',
            'deliver_expect' => 'nullable',
            'appoint_id' => 'nullable|integer',
            'appoint_start' => 'nullable',
        ], [
            'ord_id.integer' => 'Order ID must be an integer.',
            'bag_ids.array' => 'Bag IDs must be a list of bag row IDs.',
            'bag_ids.*.integer' => 'Every bag ID must be an integer.',
            'dispatch_type.required' => 'Dispatch type (pickup or delivery) is required.',
            'dispatch_type.in' => 'Dispatch type must be either pickup or delivery.',
            'speed.in' => 'Delivery speed must be priority, standard, or saver.',
            'deliver_address.string' => 'Delivery address must be text.',
            'deliver_address.max' => 'Delivery address is too long.',
            'appoint_id.integer' => 'Appointment ID must be an integer.',
        ]);
    }

    public function integratePayment(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'nullable|integer',
            'bag_ids' => 'nullable|array',
            'bag_ids.*' => 'integer',
            'pay_given' => 'required|numeric|min:0',
            'pay_ref' => 'nullable|string|max:100',
            'dispatch_type' => 'required|in:pickup,delivery',
            'speed' => 'nullable|in:priority,standard,saver',
            'deliver_address' => 'nullable|string|max:500',
            'deliver_expect' => 'nullable',
            'appoint_id' => 'nullable|integer',
            'appoint_start' => 'nullable',
        ], [
            'ord_id.integer' => 'Order ID must be an integer.',
            'bag_ids.array' => 'Bag IDs must be a list of bag row IDs.',
            'bag_ids.*.integer' => 'Every bag ID must be an integer.',
            'pay_given.required' => 'Payment given amount is required.',
            'pay_given.numeric' => 'Payment given must be a numeric amount.',
            'pay_given.min' => 'Payment given cannot be negative.',
            'pay_ref.max' => 'Payment reference is too long.',
            'dispatch_type.required' => 'Dispatch type (pickup or delivery) is required.',
            'dispatch_type.in' => 'Dispatch type must be either pickup or delivery.',
            'speed.in' => 'Delivery speed must be priority, standard, or saver.',
            'deliver_address.string' => 'Delivery address must be text.',
            'deliver_address.max' => 'Delivery address is too long.',
            'appoint_id.integer' => 'Appointment ID must be an integer.',
        ]);
    }

    public function createPaymentIntent(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'nullable|integer',
            'bag_ids' => 'nullable|array',
            'bag_ids.*' => 'integer',
            'gateway' => 'required|in:paymongo',
            'dispatch_type' => 'nullable|in:pickup,delivery',
            'speed' => 'nullable|in:priority,standard,saver',
            'deliver_address' => 'nullable|string|max:500',
            'deliver_expect' => 'nullable',
            'appoint_id' => 'nullable|integer',
            'appoint_start' => 'nullable',
        ], [
            'ord_id.integer' => 'Order ID must be an integer.',
            'bag_ids.array' => 'Bag IDs must be a list of bag row IDs.',
            'bag_ids.*.integer' => 'Every bag ID must be an integer.',
            'gateway.required' => 'Payment gateway is required.',
            'gateway.in' => 'Payment gateway must be paymongo.',
            'dispatch_type.in' => 'Dispatch type must be either pickup or delivery.',
            'speed.in' => 'Delivery speed must be priority, standard, or saver.',
            'deliver_address.string' => 'Delivery address must be text.',
            'deliver_address.max' => 'Delivery address is too long.',
            'appoint_id.integer' => 'Appointment ID must be an integer.',
        ]);
    }

    public function paymentStatus(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required|integer',
        ], [
            'ord_id.required' => 'Order ID is required.',
            'ord_id.integer'  => 'Order ID must be an integer.',
        ]);
    }

    public function bookLalamoveDelivery(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'     => 'required_without:deliver_id|nullable|integer',
            'deliver_id' => 'required_without:ord_id|nullable|integer',
        ], [
            'ord_id.required_without'     => 'Order ID is required.',
            'deliver_id.required_without' => 'Order ID is required.',
            'ord_id.integer'              => 'Order ID must be an integer.',
            'deliver_id.integer'          => 'Delivery ID must be an integer.',
        ]);
    }

    public function addProductToOrder(Request $json)
    {
        return $this->validateFields($json, [
            'prod_id' => 'required',
            'ord_id'  => 'sometimes|nullable|integer',
        ], [
            'prod_id.required' => 'Product ID is required.',
            'ord_id.integer'   => 'Order ID must be an integer.',
        ]);
    }

    public function updateOrderDetails(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required',
        ], [
            'ord_id.required' => 'Order ID is required.',
        ]);
    }

    public function removeProductFromOrder(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'  => 'required',
            'prod_id' => 'required',
        ], [
            'ord_id.required'  => 'Order ID is required.',
            'prod_id.required' => 'Product ID is required.',
        ]);
    }

    public function posAddProductToOrder(Request $json)
    {
        return $this->addProductToOrder($json);
    }

    public function posCheckoutOrder(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'      => 'required',
            'pay_given'   => 'required|numeric|min:0',
            'ord_discount' => 'nullable|numeric|min:0',
            'pay_method' => 'nullable|in:cash,digital',
        ], [
            'ord_id.required'      => 'Order ID is required.',
            'pay_given.required'   => 'Payment given amount is required.',
            'pay_given.numeric'    => 'Payment given must be a numeric amount.',
            'pay_given.min'        => 'Payment given cannot be negative.',
            'ord_discount.numeric' => 'Discount must be a numeric amount.',
            'ord_discount.min'     => 'Discount cannot be negative.',
            'pay_method.in'        => 'Payment method must be cash or digital.',
        ]);
    }

    public function posUpdateOrderDetails(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required',
        ], [
            'ord_id.required' => 'Order ID is required.',
        ]);
    }

    public function createNotification(Request $json)
    {
        return $this->validateFields($json, [
            'recipient_type' => 'required|in:customer,employee',
            'recipient_id'   => 'required',
            'notif_msg'      => 'required',
        ], [
            'recipient_type.required' => 'Recipient type is required.',
            'recipient_type.in'       => 'Recipient type must be either customer or employee.',
            'recipient_id.required'   => 'Recipient ID is required.',
            'notif_msg.required'      => 'Notification message is required.',
        ]);
    }

    public function distributeNotifications(Request $json)
    {
        return $this->validateFields($json, [
            'recipient_type' => 'required|in:customer,employee',
            'notif_msg'      => 'required',
        ], [
            'recipient_type.required' => 'Recipient type is required.',
            'recipient_type.in'       => 'Recipient type must be either customer or employee.',
            'notif_msg.required'      => 'Notification message is required.',
        ]);
    }

    public function updateNotificationStatus(Request $json)
    {
        return $this->validateFields($json, [
            'notif_id'       => 'required',
            'recipient_type' => 'required|in:customer,employee',
        ], [
            'notif_id.required'       => 'Notification ID is required.',
            'recipient_type.required' => 'Recipient type is required.',
            'recipient_type.in'       => 'Recipient type must be either customer or employee.',
        ]);
    }

    public function displaySlots(Request $json)
    {
        return $this->validateFields($json, [
            'date' => 'required|date_format:Y-m-d',
        ], [
            'date.required'           => 'A valid date (YYYY-MM-DD) is required.',
            'date.date_format'        => 'A valid date (YYYY-MM-DD) is required.',
        ]);
    }

    public function scanCode(Request $json)
    {
        return $this->validateFields($json, [
            'code'       => 'required',
            'scanned_by' => 'nullable|string|max:255',
        ], [
            'code.required' => 'QR code is required.',
        ]);
    }

    public function createFulfillmentTrack(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'     => 'required',
            'track_type' => 'required|in:pickup,delivery',
        ], [
            'ord_id.required'      => 'Order ID is required.',
            'track_type.required'  => 'Track type is required.',
            'track_type.in'        => 'Track type must be either pickup or delivery.',
        ]);
    }

    public function updateFulfillmentStatus(Request $json)
    {
        return $this->validateFields($json, [
            'track_id'   => 'required',
            'track_type' => 'required|in:pickup,delivery',
            'status'     => 'required',
        ], [
            'track_id.required'    => 'Track ID is required.',
            'track_type.required'  => 'Track type is required.',
            'track_type.in'        => 'Track type must be either pickup or delivery.',
            'status.required'      => 'Status is required.',
        ]);
    }

    public function closeFulfillmentTrack(Request $json)
    {
        return $this->validateFields($json, [
            'track_id'   => 'required',
            'track_type' => 'required|in:pickup,delivery',
        ], [
            'track_id.required'    => 'Track ID is required.',
            'track_type.required'  => 'Track type is required.',
            'track_type.in'        => 'Track type must be either pickup or delivery.',
        ]);
    }

    protected function validateFields(Request $json, array $rules, array $messages = [])
    {
        $validator = Validator::make($json->all(), $rules, $messages);

        if ($validator->fails()) {
            return $this->fail((string) $validator->errors()->first(), 400);
        }

        return null;
    }
}
