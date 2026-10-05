<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

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
class AccountsAPI extends Controller
{
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
                'message' => 'Only employee accounts may access this endpoint',
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
        $validator = (new InputValidatorAPI())->changeAccountType($json);
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
        live in AuthAPI::employeeSignup() so there is exactly one
        implementation. Wire `POST /accounts/enroll` to this method if the
        accounts-namespaced route is wanted.
    */
    public function enrollEmployee(Request $json)
    {
        return (new AuthAPI())->employeeSignup($json);
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
        $validator = (new InputValidatorAPI())->deleteAccount($json);
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
        $validator = (new InputValidatorAPI())->disableAccount($json);
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
        $validator = (new InputValidatorAPI())->recoverAccount($json);
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

    /*
        Reading the caller's own account row
        ----------
        GET /api/accounts/me - no body needed
    */
    public function displayMyAccount(Request $json)
    {
        $user = $json->user('api');

        if (! $user instanceof Customer && ! $user instanceof Employee) {
            return response()->json([
                'success' => false,
                'message' => 'Only signed-in accounts may read this endpoint',
            ], 403);
        }

        try {
            if ($user instanceof Customer) {
                $fresh = Customer::findOrFail($user->cust_id);
                $this->logCustomer((int) $fresh->cust_id, 'view', 'GET /api/accounts/me - own profile');
                $data = array_merge($fresh->toArray(), $this->customerAliases($fresh));
            } else {
                $fresh = Employee::findOrFail($user->emp_id);
                $this->logEmployee((int) $fresh->emp_id, 'view', 'GET /api/accounts/me - own profile');
                $data = array_merge($fresh->toArray(), $this->employeeAliases($fresh));
            }

            return response()->json([
                'success' => true,
                'message' => 'Account retrieved successfully',
                'data' => $data,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve account',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Updating account details (REQ-APC-02 profile form)
        ----------
        JSON REQUEST

        user_id - integer (req)
        account_type - string (req: customer | employee)
        (attributes to update - new column names first, legacy aliases accepted)
    */
    public function updateAccountDetails(Request $json)
    {
        $validator = (new InputValidatorAPI())->updateAccountDetails($json);
        if ($validator) return $validator;

        try {
            $userId = (int) $json->input('user_id');
            $accountType = strtolower($json->input('account_type'));
            $isCustomer = $accountType === 'customer';
            $actor = $json->user('api');

            if ($isCustomer) {
                $customerId = $this->customerId($json);
                if ($customerId === null || $customerId !== $userId) {
                    return response()->json(['success' => false, 'message' => 'Customer account mismatch.'], 403);
                }
                $user = Customer::findOrFail($userId);
            } else {
                if (! $actor instanceof Employee || ((int) $actor->getKey() !== $userId && ! $this->isSuperAdmin($actor))) {
                    return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
                }
                $user = Employee::findOrFail($userId);
            }

            [$payload, $error] = $isCustomer
                ? $this->mapCustomerProfile($user, $json)
                : $this->mapEmployeeProfile($user, $json);

            if ($error !== null) {
                return $error;
            }
            if ($payload === []) {
                return response()->json([
                    'success' => false,
                    'message' => 'No updatable fields were supplied.',
                ], 422);
            }

            $rules = $isCustomer ? self::CUSTOMER_PROFILE_RULES : self::EMPLOYEE_PROFILE_RULES;
            $validator = Validator::make($payload, $rules);
            if ($validator->fails()) {
                return response()->json([
                    'success' => false,
                    'message' => $validator->errors()->first(),
                    'errors' => $validator->errors(),
                ], 422);
            }

            // Unique login identifiers may only be taken by ANOTHER row
            // (EDGE-UNIQ-01): a profile save that re-sends the current value
            // is never a conflict.
            if (array_key_exists('cust_email', $payload) && $payload['cust_email']) {
                $taken = Customer::where('cust_email', $payload['cust_email'])
                    ->where('cust_id', '!=', $user->cust_id)->exists()
                    || Employee::where('emp_email', $payload['cust_email'])->exists();
                if ($taken) {
                    return response()->json(['success' => false, 'message' => 'Email already exists'], 409);
                }
            }
            if (array_key_exists('cust_phone', $payload) && $payload['cust_phone']) {
                if (Customer::where('cust_phone', $payload['cust_phone'])
                    ->where('cust_id', '!=', $user->cust_id)->exists()) {
                    return response()->json(['success' => false, 'message' => 'Phone already exists'], 409);
                }
            }
            if (array_key_exists('emp_email', $payload) && $payload['emp_email']) {
                if (Employee::where('emp_email', $payload['emp_email'])
                    ->where('emp_id', '!=', $user->emp_id)->exists()
                    || Customer::where('cust_email', $payload['emp_email'])->exists()) {
                    return response()->json(['success' => false, 'message' => 'Email already exists'], 409);
                }
            }

            // REQ-SS-02: availability locks at the exact start of the
            // employee's duty block, so the change is checked before it is
            // written. Super admins may override at any time.
            if (! $isCustomer && array_key_exists('emp_present', $payload)) {
                $blocked = $this->availabilityDeadlineBlocked($json, (int) $user->emp_id);
                if ($blocked) return $blocked;
            }

            $user->update($payload);

            // REQ-SS-03 / REQ-AB-03: an availability change is cross-checked
            // against open bookings, and customers still holding one are told
            // to reschedule when the in-store minimum is no longer met.
            if (! $isCustomer && array_key_exists('emp_present', $payload)) {
                $this->notifyStaffShortage();
            }

            $endpoint = $isCustomer
                ? 'PUT /api/accounts/update - customer #' . $userId . ' profile'
                : 'PUT /api/accounts/update - employee #' . $userId . ' profile';
            if ($isCustomer) {
                $this->logCustomer($userId, 'edit', $endpoint);
            } else {
                $this->logEmployee($userId, 'edit', $endpoint . ' (by employee #' . $actor->emp_id . ')');
            }

            $fresh = $user->fresh();

            return response()->json([
                'success' => true,
                'message' => 'Account details updated successfully',
                'data' => $isCustomer
                    ? array_merge($fresh->toArray(), $this->customerAliases($fresh))
                    : array_merge($fresh->toArray(), $this->employeeAliases($fresh)),
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update account details',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // ==========================================
    // PROFILE PAYLOAD MAPPING (legacy input -> live columns)
    // ==========================================

    /** Validation for the mapped customer payload (new column names). */
    private const CUSTOMER_PROFILE_RULES = [
        'cust_givname' => 'sometimes|string|max:100',
        'cust_surname' => 'sometimes|string|max:100',
        'cust_pronoun' => 'sometimes|string|max:50',
        'cust_bday' => 'sometimes|nullable|date',
        // REQ-CUST_PROF-03: several addresses share this single column, so it
        // is allowed to grow far past the legacy 255-character form limit.
        'cust_address' => 'sometimes|nullable|string|max:4000',
        'cust_callcode' => 'sometimes|regex:/^\+?[0-9]{1,4}$/',
        'cust_phone' => 'sometimes|nullable|regex:/^[0-9]{10,11}$/',
        'cust_email' => 'sometimes|nullable|email:rfc',
        'cust_college' => 'sometimes|nullable|string|max:120',
        'cust_dept' => 'sometimes|nullable|string|max:120',
        'cust_categ' => 'sometimes|nullable|in:student,alumni,faculty',
        'cust_avatar' => 'sometimes|nullable|string',
        'cust_backup_phone' => 'sometimes|nullable|string|max:40',
        'cust_backup_email' => 'sometimes|nullable|email:rfc',
        'cust_darkmode' => 'sometimes|boolean',
        'cust_notif_appointremind' => 'sometimes|nullable|integer|min:0|max:1440',
        'cust_notif_email' => 'sometimes|boolean',
        'cust_notif_prod' => 'sometimes|boolean',
    ];

    /** Validation for the mapped employee payload (new column names). */
    private const EMPLOYEE_PROFILE_RULES = [
        'emp_givname' => 'sometimes|string|max:100',
        'emp_surname' => 'sometimes|string|max:100',
        'emp_pronoun' => 'sometimes|string|max:50',
        'emp_callcode' => 'sometimes|regex:/^\+?[0-9]{1,4}$/',
        'emp_phone' => 'sometimes|nullable|regex:/^[0-9]{10,11}$/',
        'emp_email' => 'sometimes|nullable|email:rfc',
        'emp_avatar' => 'sometimes|nullable|string',
        'emp_backup_phone' => 'sometimes|nullable|string|max:40',
        'emp_backup_email' => 'sometimes|nullable|email:rfc',
        'emp_present' => 'sometimes|boolean',
        'emp_darkmode' => 'sometimes|boolean',
        'emp_notif_appointremind' => 'sometimes|nullable|integer|min:0|max:1440',
        'emp_notif_email' => 'sometimes|boolean',
    ];

    /**
     * Maps the legacy / new customer profile payload onto live columns.
     * Dropped (no column in the schema): cust_username, cust_campus,
     * cust_course (mapped to cust_dept), cust_year, cust_cred_changed.
     *
     * @return array{0: array<string, mixed>, 1: \Illuminate\Http\JsonResponse|null}
     */
    private function mapCustomerProfile(Customer $user, Request $json): array
    {
        $payload = [];

        // Display name: legacy cust_nickname splits into givname + surname
        $givname = $json->input('cust_givname');
        $surname = $json->input('cust_surname');
        if ($givname !== null || $surname !== null) {
            if ($givname !== null) $payload['cust_givname'] = trim((string) $givname);
            if ($surname !== null) $payload['cust_surname'] = trim((string) $surname);
        } elseif ($json->has('cust_nickname')) {
            $full = trim((string) $json->input('cust_nickname'));
            if (str_contains($full, ' ')) {
                [$givname, $surname] = explode(' ', $full, 2);
                $payload['cust_givname'] = trim($givname);
                $payload['cust_surname'] = trim($surname);
            } else {
                $payload['cust_surname'] = $full;
                $payload['cust_givname'] = '';
            }
        }

        if ($json->has('cust_pronoun')) {
            $payload['cust_pronoun'] = (string) $json->input('cust_pronoun');
        }

        // Birthday: cust_bday (new) or cust_birthday (legacy alias)
        if ($json->has('cust_bday')) {
            $payload['cust_bday'] = $json->input('cust_bday');
        } elseif ($json->has('cust_birthday')) {
            $payload['cust_bday'] = $json->input('cust_birthday');
        }

        // Address: REQ-CUST_PROF-03 allows several delivery addresses per
        // customer. The schema keeps them in the single cust_address column,
        // so the list round-trips as one ' | '-separated string; the legacy
        // four-part payload still rebuilds a single address.
        if ($json->has('cust_addresses')) {
            $list = $json->input('cust_addresses');
            if (! is_array($list)) {
                return [$payload, $this->addressError('Addresses must be sent as a list.')];
            }

            $entries = [];
            foreach ($list as $entry) {
                $entry = trim((string) $entry);
                if ($entry === '') {
                    continue;
                }
                if (mb_strlen($entry) > 300) {
                    return [$payload, $this->addressError('Each address must be 300 characters or fewer.')];
                }
                $entries[] = $entry;
            }

            if (count($entries) > 10) {
                return [$payload, $this->addressError('A customer may save up to 10 addresses.')];
            }

            $payload['cust_address'] = $entries !== [] ? implode(' | ', $entries) : null;
        } else {
            $addressKeys = ['cust_address', 'cust_brgy', 'cust_city', 'cust_province', 'cust_country'];
            if (array_intersect($addressKeys, array_keys($json->all()))) {
                $payload['cust_address'] = $this->rebuildAddress($user, $json);
            }
        }

        foreach (['cust_callcode', 'cust_college', 'cust_categ', 'cust_darkmode',
            'cust_notif_appointremind', 'cust_notif_email', 'cust_notif_prod'] as $key) {
            if ($json->has($key)) {
                $payload[$key] = $json->input($key);
            }
        }

        // Department: cust_dept (new) with cust_course / dept as aliases
        if ($json->has('cust_dept')) {
            $payload['cust_dept'] = $json->input('cust_dept');
        } elseif ($json->has('cust_course') || $json->has('dept')) {
            $payload['cust_dept'] = $json->input('cust_course') ?: $json->input('dept');
        }

        if ($json->has('cust_email')) {
            $email = mb_strtolower(trim((string) $json->input('cust_email')));
            // REQ-CUST_PROF-01: a customer can never edit their own email
            // address. The stored value is simply kept, so a profile form
            // that round-trips a read-only field still saves cleanly.
            if ($email === '' || $email === mb_strtolower(trim((string) $user->cust_email))) {
                $payload['cust_email'] = $user->cust_email;
            }
        }
        // REQ-CUST_PROF-01: cust_type is system-assigned (rules 17-18) and is
        // never written from a profile save.
        if ($json->has('cust_phone')) {
            // cust_phone is NOT NULL: an empty value means "leave as-is"
            $phone = $this->normalizePhone((string) $json->input('cust_phone'));
            if ($phone !== '') {
                $payload['cust_phone'] = $phone;
            }
        }

        // Photo: cust_avatar (new) or cust_photo (legacy alias).
        // REQ-CUST_PROF-04: the format is checked here as well as at upload.
        if ($json->has('cust_avatar') || $json->has('cust_photo')) {
            $avatar = trim((string) ($json->input('cust_avatar') ?? $json->input('cust_photo')));
            if ($avatar !== '' && ! $this->avatarAllowed($avatar)) {
                return [$payload, response()->json([
                    'success' => false,
                    'message' => 'Profile photos must be a PNG, JPEG, GIF or WebP image.',
                ], 422)];
            }
            $payload['cust_avatar'] = $avatar !== '' ? $avatar : null;
        }

        // Backup contact: two legacy keys fold into one column
        if ($json->has('cust_backup_phone')) {
            $payload['cust_backup_phone'] = $json->input('cust_backup_phone');
        } elseif ($json->has('cust_backupphone')) {
            $combined = $this->combineBackupPhone(
                $json->input('cust_backupcallcode'),
                $json->input('cust_backupphone')
            );
            if ($combined !== null) $payload['cust_backup_phone'] = $combined;
        }
        if ($json->has('cust_backup_email')) {
            $payload['cust_backup_email'] = mb_strtolower(trim((string) $json->input('cust_backup_email'))) ?: null;
        } elseif ($json->has('cust_backupemail')) {
            $payload['cust_backup_email'] = mb_strtolower(trim((string) $json->input('cust_backupemail'))) ?: null;
        }

        return [$payload, null];
    }

    /**
     * Maps the legacy / new employee profile payload onto live columns.
     * Dropped (no column in the schema): emp_midname, emp_suffix,
     * emp_studnum, emp_college, emp_program, emp_year, emp_bloc,
     * emp_birthday, emp_brgy/city/province/country, emp_backupcallcode,
     * emp_photo (-> emp_avatar), emp_type (-> emp_categ, managed only by
     * PUT /accounts/type), emp_cred_changed.
     *
     * @return array{0: array<string, mixed>, 1: \Illuminate\Http\JsonResponse|null}
     */
    private function mapEmployeeProfile(Employee $user, Request $json): array
    {
        $payload = [];

        foreach (['emp_givname', 'emp_surname', 'emp_pronoun', 'emp_callcode', 'emp_darkmode',
            'emp_notif_appointremind', 'emp_notif_email'] as $key) {
            if ($json->has($key)) {
                $payload[$key] = $json->input($key);
            }
        }

        if ($json->has('emp_email')) {
            // emp_email is NOT NULL + UNIQUE: an empty value means "keep"
            $email = mb_strtolower(trim((string) $json->input('emp_email')));
            if ($email !== '') {
                $payload['emp_email'] = $email;
            }
        }
        if ($json->has('emp_phone')) {
            $phone = $this->normalizePhone((string) $json->input('emp_phone'));
            if ($phone !== '') {
                $payload['emp_phone'] = $phone;
            }
        }

        // emp_photo (legacy) -> emp_avatar (live)
        if ($json->has('emp_avatar')) {
            $payload['emp_avatar'] = $json->input('emp_avatar');
        } elseif ($json->has('emp_photo')) {
            $payload['emp_avatar'] = $json->input('emp_photo');
        }

        // emp_instore (legacy) -> emp_present (live)
        if ($json->has('emp_present')) {
            $payload['emp_present'] = (bool) $json->input('emp_present');
        } elseif ($json->has('emp_instore')) {
            $payload['emp_present'] = (bool) $json->input('emp_instore');
        }

        // Backup contact: legacy emp_backupphone / emp_backupemail keys
        if ($json->has('emp_backup_phone')) {
            $payload['emp_backup_phone'] = $json->input('emp_backup_phone');
        } elseif ($json->has('emp_backupphone')) {
            $combined = $this->combineBackupPhone(
                $json->input('emp_backupcallcode'),
                $json->input('emp_backupphone')
            );
            if ($combined !== null) $payload['emp_backup_phone'] = $combined;
        }
        if ($json->has('emp_backup_email')) {
            $payload['emp_backup_email'] = mb_strtolower(trim((string) $json->input('emp_backup_email'))) ?: null;
        } elseif ($json->has('emp_backupemail')) {
            $payload['emp_backup_email'] = mb_strtolower(trim((string) $json->input('emp_backupemail'))) ?: null;
        }

        return [$payload, null];
    }

    /** Rebuilds cust_address from whichever parts the payload carries. */
    private function rebuildAddress(Customer $user, Request $json): ?string
    {
        if ($json->has('cust_address')) {
            $parts = explode(',', (string) $json->input('cust_address'));
        } else {
            $current = explode(',', (string) $user->cust_address);
            $parts = [
                $json->input('cust_brgy', $current[0] ?? ''),
                $json->input('cust_city', $current[1] ?? ''),
                $json->input('cust_province', $current[2] ?? ''),
                $json->input('cust_country', $current[3] ?? ''),
            ];
        }

        $parts = array_values(array_filter(array_map('trim', $parts), fn ($part) => $part !== ''));

        return $parts !== [] ? implode(', ', $parts) : null;
    }

    private function normalizePhone(string $phone): string
    {
        $cleaned = preg_replace('/[^0-9]/', '', $phone);
        if (strlen((string) $cleaned) >= 12 && strpos((string) $cleaned, '63') === 0) {
            $cleaned = '0' . substr((string) $cleaned, 2);
        }

        return (string) $cleaned;
    }

    private function combineBackupPhone($callcode, $phone): ?string
    {
        $phone = trim((string) $phone);
        if ($phone === '') {
            return null;
        }
        $callcode = trim((string) $callcode);

        return $callcode !== '' ? $callcode . ' ' . $phone : $phone;
    }

    /** 422 response for a rejected address list (REQ-CUST_PROF-03). */
    private function addressError(string $message): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => false, 'message' => $message], 422);
    }

    /**
     * REQ-CUST_PROF-04: profile photos must be PNG/JPEG/GIF/WebP. A value may
     * be a data URI carrying one of those types, a URL ending in an allowed
     * extension, or a bare extension token.
     */
    private function avatarAllowed(string $avatar): bool
    {
        if (preg_match('#^data:image/(png|jpe?g|gif|webp);base64,#i', $avatar)) {
            return true;
        }

        $path = strtolower((string) parse_url($avatar, PHP_URL_PATH));
        $ext = pathinfo($path, PATHINFO_EXTENSION);

        return in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)
            || in_array(ltrim($avatar, '.'), ['png', 'jpg', 'jpeg', 'gif', 'webp'], true);
    }

    // ==========================================
    // LEGACY RESPONSE ALIASES (never read from the database)
    // ==========================================

    /** @see AuthAPI::customerAliases() - same contract, kept in sync. */
    private function customerAliases(Customer $customer): array
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

    /** @see AuthAPI::employeeAliases() - same contract, kept in sync. */
    private function employeeAliases(Employee $employee): array
    {
        [$backupCallcode, $backupPhone] = $this->splitBackupPhone($employee->emp_backup_phone);

        return [
            'emp_type' => strtoupper((string) $employee->emp_categ),
            'emp_instore' => (bool) $employee->emp_present,
            'emp_disabled' => $employee->emp_suspended,
            'emp_photo' => $employee->emp_avatar,
            'emp_college' => null,
            'emp_backupcallcode' => $backupCallcode !== '' ? $backupCallcode : $employee->emp_callcode,
            'emp_backupphone' => $backupPhone,
            'emp_backupemail' => $employee->emp_backup_email,
        ];
    }

    private function splitBackupPhone(?string $value): array
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
