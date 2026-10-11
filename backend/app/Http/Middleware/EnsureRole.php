<?php

namespace App\Http\Middleware;

use App\Models\Employee;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string $minimumRole = 'staff'): Response
    {
        $employee = $request->user('api');

        if (! $employee instanceof Employee) {
            return response()->json([
                'success' => false,
                'message' => 'Employee authentication is required.',
            ], 403);
        }

        // The system-new SCHEMA names the category `emp_categ`; the legacy
        // fixture (and older rows) still carry it as `emp_type`. Reading
        // either keeps the rank identical on the live table, where
        // `emp_categ` is always present, and correct on a connection that
        // only has the pre-migration column.
        $rank = $this->rank($employee->emp_categ ?: $employee->emp_type);
        $required = $this->rank($minimumRole);

        if ($rank < $required) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to perform this action.',
            ], 403);
        }

        return $next($request);
    }

    private function rank(?string $role): int
    {
        return match (strtoupper(str_replace([' ', '-'], '_', trim($role)))) {
            'SUPER_ADMIN', 'SUPERADMIN' => 3,
            'ADMIN', 'ADMINISTRATOR' => 2,
            default => 1,
        };
    }
}
