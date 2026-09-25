<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustNotif;
use App\Models\EmpNotif;
use App\Models\Employee;
use App\Models\Setting;
use Illuminate\Http\Request;

abstract class Controller
{
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
