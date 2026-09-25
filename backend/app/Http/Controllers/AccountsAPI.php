<?php

    namespace App\Http\Controllers;

    use App\Models\CustLog;
    use App\Models\Customer;
    use App\Models\EmpLog;
    use App\Models\Employee;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;
    use Illuminate\Support\Facades\Log;
    use Illuminate\Support\Facades\Schema;
    use Illuminate\Support\Facades\Validator;

    class AccountsAPI extends Controller
    {
        // Profile columns api_accounts accepts (REQ-APC-02 profile form).
        private const CUSTOMER_FIELDS = [
            'cust_nickname', 'cust_pronoun', 'cust_birthday',
            'cust_brgy', 'cust_city', 'cust_province', 'cust_country',
            'cust_callcode', 'cust_phone', 'cust_email', 'cust_college',
            'cust_username', 'cust_campus', 'cust_course', 'cust_year',
            'cust_photo', 'cust_backupcallcode', 'cust_backupphone', 'cust_backupemail',
        ];

        private const EMPLOYEE_FIELDS = [
            'emp_surname', 'emp_givname', 'emp_midname', 'emp_suffix',
            'emp_studnum', 'emp_college', 'emp_program', 'emp_year', 'emp_bloc',
            'emp_pronoun', 'emp_birthday', 'emp_brgy', 'emp_city',
            'emp_province', 'emp_country', 'emp_callcode', 'emp_phone',
            'emp_email', 'emp_instore', 'emp_photo',
            'emp_backupcallcode', 'emp_backupphone', 'emp_backupemail',
        ];

        // Login identifiers covered by REQ-APC-01's thirty-day lock.
        private const SENSITIVE_FIELDS = [
            'customer' => ['cust_phone', 'cust_email', 'cust_username'],
            'employee' => ['emp_phone', 'emp_email'],
        ];

        /*
            Changing account type
            ----------
            JSON REQUEST

            user_id - integer (req)
            account_type - string (req: customer | employee)
            new_type - string (req)
        */
        public function changeAccountType(Request $json)
        {
            $validator = (new InputValidatorAPI())->changeAccountType($json);
            if ($validator) return $validator;

            // REQ-UM-01: only super admin employees may change account types
            $denied = $this->requireSuperAdmin($json);
            if ($denied) return $denied;

            try {
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));
                $newType = strtoupper($json->input('new_type'));

                if ($accountType === 'customer') {
                    return response()->json([
                        'success' => false,
                        'message' => 'Customer and employee accounts cannot be converted.',
                    ], 422);
                }
                if (! in_array($newType, ['STAFF', 'ADMIN', 'SUPER ADMIN'], true)) {
                    return response()->json(['success' => false, 'message' => 'Invalid employee role.'], 422);
                }

                $user = Employee::find($userId);
                if (! $user) {
                    return response()->json(['success' => false, 'message' => 'Employee account not found'], 404);
                }
                $previousType = $user->emp_type;
                $user->update(['emp_type' => $newType]);
                EmpLog::create([
                    'emp_id' => $userId,
                    'emplog_created' => now(),
                    'emplog_action' => 'ROLE_CHANGE',
                    'emplog_desc' => 'Role changed from ' . $previousType . ' to ' . $newType . ' by super admin #' . $json->user()->getKey() . '.',
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Account type updated successfully',
                    'data' => $user
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to change account type',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Deleting accounts
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

            // REQ-UM-01: only super admin employees may delete accounts
            $denied = $this->requireSuperAdmin($json);
            if ($denied) return $denied;

            try {
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));
                $hardDelete = (bool) $json->input('hard_delete', false);
                $adminId = $json->user()->getKey();
                if ($accountType === 'employee' && (int) $userId === (int) $adminId) {
                    return response()->json([
                        'success' => false,
                        'message' => 'You cannot delete your own account.',
                    ], 409);
                }

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                    if ($hardDelete) {
                        Log::warning('Customer account permanently deleted', [
                            'customer_id' => $userId,
                            'actor_id' => $adminId,
                        ]);
                        $user->tokens()->delete();
                        $user->delete();
                    } else {
                        $user->update(['cust_deleted' => now()]);
                        CustLog::create([
                            'cust_id' => $userId,
                            'custlog_created' => now(),
                            'custlog_action' => 'DELETE',
                            'custlog_desc' => 'Account soft-deleted by super admin #' . $adminId . '.',
                        ]);
                    }
                } else {
                    $user = Employee::where('emp_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                    if ($hardDelete) {
                        Log::warning('Employee account permanently deleted', [
                            'employee_id' => $userId,
                            'actor_id' => $adminId,
                        ]);
                        $user->tokens()->delete();
                        $user->delete();
                    } else {
                        $user->update(['emp_deleted' => now()]);
                        EmpLog::create([
                            'emp_id' => $userId,
                            'emplog_created' => now(),
                            'emplog_action' => 'DELETE',
                            'emplog_desc' => 'Account soft-deleted by super admin #' . $adminId . '.',
                        ]);
                    }
                }

                return response()->json([
                    'success' => true,
                    'message' => $hardDelete ? 'Account permanently deleted' : 'Account soft-deleted successfully'
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to delete account',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Disabling accounts
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

            // REQ-UM-01: only super admin employees may ban accounts
            $denied = $this->requireSuperAdmin($json);
            if ($denied) return $denied;

            try {
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));
                $reason = trim((string) $json->input('reason'));
                $adminId = $json->user()->getKey();

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                    $user->update(['cust_disabled' => now()]);

                    // REQ-UM-04: log the ban with super admin, timestamp and reason
                    CustLog::create([
                        'cust_id'         => $userId,
                        'custlog_created' => now(),
                        'custlog_action'  => 'DISABLE',
                        'custlog_desc'    => 'Account disabled by super admin #' . $adminId .
                            ' at ' . now() . '. Reason: ' . $reason,
                    ]);

                    // Notify the banned account of the action
                    $this->notifyCustomer($userId, 'Your account has been disabled. Reason: ' . $reason);
                } else {
                    $user = Employee::where('emp_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                    $user->update(['emp_disabled' => now()]);

                    // REQ-UM-04: log the ban with super admin, timestamp and reason
                    EmpLog::create([
                        'emp_id'         => $userId,
                        'emplog_created' => now(),
                        'emplog_action'  => 'DISABLE',
                        'emplog_desc'    => 'Account disabled by super admin #' . $adminId .
                            ' at ' . now() . '. Reason: ' . $reason,
                    ]);

                    // Notify the banned account of the action
                    $this->notifyEmployee($userId, 'Your account has been disabled. Reason: ' . $reason);
                }

                // REQ-UM-02: terminate every active session of the banned account
                DB::table('personal_access_tokens')
                    ->where('tokenable_type', $user->getMorphClass())
                    ->where('tokenable_id', $user->getKey())
                    ->delete();

                return response()->json([
                    'success' => true,
                    'message' => 'Account disabled successfully',
                    'data' => $user
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to disable account',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Displaying accounts
            ----------
            JSON REQUEST

            account_type - string (opt: customer | employee | all)
        */
        public function displayAccounts(Request $json)
        {
            // REQ-UM-01: the account list is employee-only (staff/admin may view)
            $denied = $this->requireEmployee($json);
            if ($denied) return $denied;

            try {
                $accountType = strtolower($json->input('account_type', 'all'));

                $customers = [];
                $employees = [];

                if (in_array($accountType, ['customer', 'all'])) {
                    $customers = Customer::whereNull('cust_deleted')->get();
                }
                if (in_array($accountType, ['employee', 'all'])) {
                    $employees = Employee::whereNull('emp_deleted')->get();
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Accounts retrieved successfully',
                    'data' => [
                        'customers' => $customers,
                        'employees' => $employees,
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display accounts',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Recovering accounts
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

            // REQ-UM-01: only super admin employees may recover accounts
            $denied = $this->requireSuperAdmin($json);
            if ($denied) return $denied;

            try {
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));
                $reason = trim((string) $json->input('reason', ''));
                $adminId = $json->user()->getKey();

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                    $user->update([
                        'cust_disabled' => null,
                        'cust_deleted'  => null,
                    ]);

                    // REQ-UM-04: log the recovery with the responsible super admin
                    CustLog::create([
                        'cust_id'         => $userId,
                        'custlog_created' => now(),
                        'custlog_action'  => 'RECOVER',
                        'custlog_desc'    => 'Account recovered by super admin #' . $adminId .
                            ' at ' . now() . ($reason !== '' ? '. Reason: ' . $reason : '.'),
                    ]);

                    // Notify the restored account
                    $this->notifyCustomer($userId, 'Your account has been recovered and is active again.');
                } else {
                    $user = Employee::where('emp_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                    $user->update([
                        'emp_disabled' => null,
                        'emp_deleted'  => null,
                    ]);

                    // REQ-UM-04: log the recovery with the responsible super admin
                    EmpLog::create([
                        'emp_id'         => $userId,
                        'emplog_created' => now(),
                        'emplog_action'  => 'RECOVER',
                        'emplog_desc'    => 'Account recovered by super admin #' . $adminId .
                            ' at ' . now() . ($reason !== '' ? '. Reason: ' . $reason : '.'),
                    ]);

                    // Notify the restored account
                    $this->notifyEmployee($userId, 'Your account has been recovered and is active again.');
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Account recovered successfully',
                    'data' => $user
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to recover account',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Searching accounts
            ----------
            JSON REQUEST

            q - string (req)
            account_type - string (opt: customer | employee | all)
        */
        public function searchAccounts(Request $json)
        {
            // REQ-UM-01: the account list is employee-only (staff/admin may view)
            $denied = $this->requireEmployee($json);
            if ($denied) return $denied;

            try {
                $query = $json->input('q', '');
                $accountType = strtolower($json->input('account_type', 'all'));

                $customers = [];
                $employees = [];

                if (in_array($accountType, ['customer', 'all'])) {
                    $customers = Customer::whereNull('cust_deleted')
                        ->where(function($builder) use ($query) {
                            $builder->where('cust_nickname', 'like', "%{$query}%")
                                    ->orWhere('cust_phone', 'like', "%{$query}%")
                                    ->orWhere('cust_email', 'like', "%{$query}%");
                        })->get();
                }

                if (in_array($accountType, ['employee', 'all'])) {
                    $employees = Employee::whereNull('emp_deleted')
                        ->where(function($builder) use ($query) {
                            $builder->where('emp_surname', 'like', "%{$query}%")
                                    ->orWhere('emp_givname', 'like', "%{$query}%")
                                    ->orWhere('emp_email', 'like', "%{$query}%")
                                    ->orWhere('emp_studnum', 'like', "%{$query}%");
                        })->get();
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Account search completed',
                    'data' => [
                        'customers' => $customers,
                        'employees' => $employees,
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to search accounts',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Sorting accounts
            ----------
            JSON REQUEST

            sort_by - string (opt: created | name | type)
            order - string (opt: asc | desc)
            account_type - string (opt: customer | employee | all)
        */
        public function sortAccounts(Request $json)
        {
            // REQ-UM-01: the account list is employee-only (staff/admin may view)
            $denied = $this->requireEmployee($json);
            if ($denied) return $denied;

            try {
                $sortBy = $json->input('sort_by', 'created');
                $order = strtolower($json->input('order', 'asc')) === 'desc' ? 'desc' : 'asc';
                $accountType = strtolower($json->input('account_type', 'all'));

                $customers = [];
                $employees = [];

                if (in_array($accountType, ['customer', 'all'])) {
                    $col = $sortBy === 'name' ? 'cust_nickname' : ($sortBy === 'type' ? 'cust_type' : 'cust_created');
                    $customers = Customer::whereNull('cust_deleted')->orderBy($col, $order)->get();
                }

                if (in_array($accountType, ['employee', 'all'])) {
                    $col = $sortBy === 'name' ? 'emp_surname' : ($sortBy === 'type' ? 'emp_type' : 'emp_created');
                    $employees = Employee::whereNull('emp_deleted')->orderBy($col, $order)->get();
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Accounts sorted successfully',
                    'data' => [
                        'customers' => $customers,
                        'employees' => $employees,
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to sort accounts',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating account details
            ----------
            JSON REQUEST

            user_id - integer (req)
            account_type - string (req: customer | employee)
            (attributes to update)
        */
        public function updateAccountDetails(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateAccountDetails($json);
            if ($validator) return $validator;

            try {
                $userId = (int) $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));
                $isCustomer = $accountType === 'customer';
                $actor = $json->user('sanctum');

                if ($isCustomer) {
                    $customerId = $this->customerId($json);
                    if ($customerId === null || $customerId !== $userId) {
                        return response()->json(['success' => false, 'message' => 'Customer account mismatch.'], 403);
                    }
                    $user = Customer::findOrFail($userId);
                } else {
                    if ((int) $actor->getKey() !== $userId && ! $this->isSuperAdmin($actor)) {
                        return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
                    }
                    $user = Employee::findOrFail($userId);
                }

                // Only keep columns that actually exist so a save never 500s
                // on a connection that has not run the migration yet.
                $fields = $isCustomer ? self::CUSTOMER_FIELDS : self::EMPLOYEE_FIELDS;
                $stampField = $isCustomer ? 'cust_cred_changed' : 'emp_cred_changed';
                $sensitive = $isCustomer ? self::SENSITIVE_FIELDS['customer'] : self::SENSITIVE_FIELDS['employee'];
                $columns = Schema::getColumnListing($isCustomer ? 'customer' : 'employee');
                $payload = array_intersect_key($json->only($fields), array_flip($columns));
                $prefix = $isCustomer ? 'cust' : 'emp';
                $rules = [
                    "{$prefix}_pronoun" => 'sometimes|string|max:50',
                    "{$prefix}_birthday" => 'sometimes|date|before:today',
                    "{$prefix}_brgy" => 'sometimes|string|max:100',
                    "{$prefix}_city" => 'sometimes|string|max:100',
                    "{$prefix}_province" => 'sometimes|string|max:100',
                    "{$prefix}_country" => 'sometimes|string|max:100',
                    "{$prefix}_phone" => 'sometimes|nullable|regex:/^[0-9]{10,11}$/',
                    "{$prefix}_email" => 'sometimes|nullable|email:rfc',
                    "{$prefix}_callcode" => 'sometimes|regex:/^\+?[0-9]{1,4}$/',
                    "{$prefix}_backupphone" => 'sometimes|nullable|regex:/^[0-9]{10,11}$/',
                    "{$prefix}_backupemail" => 'sometimes|nullable|email:rfc',
                    "{$prefix}_backupcallcode" => 'sometimes|nullable|regex:/^\+?[0-9]{1,4}$/',
                ];
                if ($isCustomer) {
                    $rules['cust_nickname'] = 'sometimes|string|min:2|max:100';
                    $rules['cust_username'] = 'sometimes|string|min:3|max:50';
                }
                $validator = Validator::make($payload, $rules);
                if ($validator->fails()) {
                    return response()->json([
                        'success' => false,
                        'message' => $validator->errors()->first(),
                        'errors' => $validator->errors(),
                    ], 422);
                }

                // REQ-APC-01: login identifiers stay locked for thirty days
                // after the most recent change; a real change re-stamps them.
                if (in_array($stampField, $columns, true)
                    && $this->sensitiveFieldsTouched($user, $payload, $sensitive)) {
                    $blocked = $this->credentialChangeBlocked($user->{$stampField});
                    if ($blocked) return $blocked;
                    $payload[$stampField] = now();
                }

                $user->update($payload);

                return response()->json([
                    'success' => true,
                    'message' => 'Account details updated successfully',
                    'data' => $user
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update account details',
                    'error' => $e->getMessage()
                ], 500);
            }
        }
    }
