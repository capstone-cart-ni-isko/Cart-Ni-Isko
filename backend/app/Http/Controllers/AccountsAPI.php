<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Employee;
    use Illuminate\Http\Request;

    class AccountsAPI extends Controller
    {
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

            try {
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));
                $newType = strtoupper($json->input('new_type'));

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Customer account not found'], 404);

                    $user->update(['cust_type' => $newType]);
                } else {
                    $user = Employee::where('emp_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Employee account not found'], 404);

                    $user->update(['emp_type' => $newType]);
                }

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

            try {
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));
                $hardDelete = $json->input('hard_delete', false);

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                    if ($hardDelete) {
                        $user->delete();
                    } else {
                        $user->update(['cust_deleted' => now()]);
                    }
                } else {
                    $user = Employee::where('emp_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                    if ($hardDelete) {
                        $user->delete();
                    } else {
                        $user->update(['emp_deleted' => now()]);
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
        */
        public function disableAccount(Request $json)
        {
            $validator = (new InputValidatorAPI())->disableAccount($json);
            if ($validator) return $validator;

            try {
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                    $user->update(['cust_disabled' => now()]);
                } else {
                    $user = Employee::where('emp_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                    $user->update(['emp_disabled' => now()]);
                }

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
        */
        public function recoverAccount(Request $json)
        {
            $validator = (new InputValidatorAPI())->recoverAccount($json);
            if ($validator) return $validator;

            try {
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                    $user->update([
                        'cust_disabled' => null,
                        'cust_deleted'  => null,
                    ]);
                } else {
                    $user = Employee::where('emp_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                    $user->update([
                        'emp_disabled' => null,
                        'emp_deleted'  => null,
                    ]);
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
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                    $user->update($json->only([
                        'cust_nickname', 'cust_pronoun', 'cust_birthday',
                        'cust_brgy', 'cust_city', 'cust_province', 'cust_country',
                        'cust_callcode', 'cust_phone', 'cust_email', 'cust_college'
                    ]));
                } else {
                    $user = Employee::where('emp_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                    $user->update($json->only([
                        'emp_surname', 'emp_givname', 'emp_midname', 'emp_suffix',
                        'emp_studnum', 'emp_pronoun', 'emp_birthday',
                        'emp_brgy', 'emp_city', 'emp_province', 'emp_country',
                        'emp_callcode', 'emp_phone', 'emp_email', 'emp_instore'
                    ]));
                }

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
