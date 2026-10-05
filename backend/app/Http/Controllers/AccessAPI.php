<?php

namespace App\Http\Controllers;

use App\Models\CustLog;
use App\Models\Customer;
use App\Models\EmpLog;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
class AccessAPI extends Controller
{
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
        $validator = (new InputValidatorAPI())->flagIrregularity($json);
        if ($validator) return $validator;

        try {
            $employee = $json->user('api');
            if (! $employee instanceof Employee) {
                return response()->json(['success' => false, 'message' => 'Employee authentication required'], 403);
            }

            EmpLog::create([
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
        $validator = (new InputValidatorAPI())->logAction($json);
        if ($validator) return $validator;

        try {
            $employee = $json->user('api');
            if (! $employee instanceof Employee) {
                return response()->json(['success' => false, 'message' => 'Employee authentication required'], 403);
            }

            EmpLog::create([
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
        if ($access !== '' && ! in_array($access, ['auth', 'view', 'edit'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Access must be auth, view or edit.',
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

    /** auth | view | edit, falling back to $default for anything else. */
    private function accessValue($value, string $default): string
    {
        $value = strtolower(trim((string) $value));

        return in_array($value, ['auth', 'view', 'edit'], true) ? $value : $default;
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
