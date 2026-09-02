<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Employee;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\Hash;

    class AuthAPI extends Controller
    {
        public function customerSignup(Request $json)
        {
            /*
                CUSTOMER SIGNUP
                ----------
                JSON REQUEST

                password - string (req)
                nickname - string (req)
                pronoun - string (req)
                birthday - string (req)
                brgy - string (req)
                city - string (req)
                province - string (req)
                callcode - string (req)
                phone - string (req)
                email - string (req)
                type - string (req)
            */

            // Validate signup input
            $validator = (new InputValidatorAPI())->customerSignup($json);      
            if ($validator) return $validator;

            // Get user phone and password
            $phone = $json->input('phone');
            $password = $json->input('password');

            // Check if phone already exists
            if (Customer::where('cust_phone', $phone)->exists()) {
                // JSON ERROR
                return response()->json([
                        'success' => false,
                        'message' => 'Phone already exists'
                    ], 409);
            }

            // Inserts to database using Models
            try {
                // Create new Customer
                $customer = Customer::create([
                    'cust_created' => now(),
                    'cust_password' => Hash::make($password),
                    'cust_nickname' => $json->input('nickname') ?? 'User',
                    'cust_pronoun' => $json->input('pronoun') ?? 'they/them',
                    'cust_birthday' => $json->input('birthday') ?? '2000-01-01',
                    'cust_brgy' => $json->input('brgy') ?? '',
                    'cust_city' => $json->input('city') ?? '',
                    'cust_province' => $json->input('province') ?? '',
                    'cust_callcode' => $json->input('callcode') ?? '+63',
                    'cust_phone' => $phone,
                    'cust_email' => $json->input('email') ?? '',
                    'cust_type' => $json->input('type') ?? 'Student',
                    'cust_wishlist' => 0,
                    'cust_cart' => 0,
                    'cust_orders' => 0,
                    'cust_appoints' => 0,
                ]);

                // JSON SUCCESS
                return response()->json([
                    'success' => true,
                    'message' => 'Signup successful',
                    'data' => $customer
                ], 201);

            } catch (\Exception $e) {
                // JSON ERROR
                return response()->json([
                    'success' => false,
                    'message' => 'Signup failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        public function customerLogin(Request $json)
        {
            /*
                CUSTOMER LOGIN
                ----------
                JSON REQUEST

                password - string (req)
                phone - string (req)
            */

            // Validate login input
            $validator = (new InputValidatorAPI())->customerLogin($json);
            if ($validator) return $validator;

            // Get user phone and password
            $phone = $json->input('phone');
            $password = $json->input('password');
            
            // Find customer and verify password
            try {
                $customer = Customer::where('cust_phone', $phone)->first();

                if (!$customer || !Hash::check($password, $customer->cust_password)) {
                    // JSON ERROR
                    return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
                }

                // JSON SUCCESS
                return response()->json([
                    'success' => true,
                    'message' => 'Login successful',
                    'data' => $customer
                ], 200);

            } catch (\Exception $e) {
                // JSON ERROR
                return response()->json([
                    'success' => false,
                    'message' => 'Login failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        public function employeeSignup(Request $json)
        {
            /*
                EMPLOYEE SIGNUP
                ----------
                JSON REQUEST

                password - string (req)
                email - string (req)
                surname - string (req)
                givname - string (req)
                midname - string (opt)
                suffix - string (opt)
                studnum - string (req)
                pronoun - string (opt)
                birthday - string (opt)
                brgy - string (opt)
                city - string (opt)
                province - string (opt)
                callcode - string (opt)
                phone - string (opt)
                type - string (opt)
                instore - boolean (opt)
            */
            
            // Validate signup input
            $validator = (new InputValidatorAPI())->employeeSignup($json);
            if ($validator) return $validator;

            // Get user email and password
            $email      = $json->input('email');
            $password   = $json->input('password');

            // Check if email already exists
            if (Employee::where('emp_email', $email)->exists()) {
                // JSON ERROR
                return response()->json([
                        'success' => false,
                        'message' => 'Email already exists'
                    ], 409);
            }

            // Insert to database using Models
            try {
                // Create new employee
                $employee = Employee::create([
                    'emp_created' => now(),
                    'emp_password' => Hash::make($password),
                    'emp_surname' => $json->input('surname') ?? '',
                    'emp_givname' => $json->input('givname') ?? '',
                    'emp_midname' => $json->input('midname') ?? '',
                    'emp_suffix' => $json->input('suffix') ?? '',
                    'emp_studnum' => $json->input('studnum') ?? '',
                    'emp_pronoun' => $json->input('pronoun') ?? 'they/them',
                    'emp_birthday' => $json->input('birthday') ?? '2000-01-01',
                    'emp_brgy' => $json->input('brgy') ?? '',
                    'emp_city' => $json->input('city') ?? '',
                    'emp_province' => $json->input('province') ?? '',
                    'emp_callcode' => $json->input('callcode') ?? '+63',
                    'emp_phone' => $json->input('phone') ?? '',
                    'emp_email' => $email,
                    'emp_type' => $json->input('type') ?? 'Student',
                    'emp_instore' => $json->input('instore') ?? 0,
                ]);

                // JSON SUCCESS
                return response()->json([
                    'success' => true,
                    'message' => 'Signup successful',
                    'data' => $employee
                ], 201);

            } catch (\Exception $e) {
                // JSON ERROR
                return response()->json([
                    'success' => false,
                    'message' => 'Signup failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        public function employeeLogin(Request $json)
        {
            /*
                EMPLOYEE LOGIN
                ----------
                JSON REQUEST

                password - string (req)
                email - string (req)
            */

            // Validate login input
            $validator = (new InputValidatorAPI())->employeeLogin($json);
            if ($validator) return $validator;
            
            // Get user email and password
            $email = $json->input('email');
            $password = $json->input('password');

            // Find employee and verify password
            try {
                $employee = Employee::where('emp_email', $email)->first();

                if (!$employee || !Hash::check($password, $employee->emp_password)) {
                    // JSON ERROR
                    return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
                }

                // JSON SUCCESS
                return response()->json([
                    'success' => true,
                    'message' => 'Login successful',
                    'data' => $employee
                ], 200);

            } catch (\Exception $e) {
                // JSON ERROR
                return response()->json([
                    'success' => false,
                    'message' => 'Login failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        public function backupCredentials(Request $json)
        {
            /*
                BACKUP CREDENTIALS
                ----------
                JSON REQUEST

                user_id - integer (req)
                account_type - string (req: customer | employee)
                backupcallcode - string (opt)
                backupphone - string (opt)
                backupemail - string (opt)
            */

            $validator = (new InputValidatorAPI())->backupCredentials($json);
            if ($validator) return $validator;

            try {
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                    $user->update([
                        'cust_backupcallcode' => $json->input('backupcallcode') ?? $user->cust_backupcallcode,
                        'cust_backupphone'    => $json->input('backupphone') ?? $user->cust_backupphone,
                        'cust_backupemail'    => $json->input('backupemail') ?? $user->cust_backupemail,
                    ]);
                } else {
                    $user = Employee::where('emp_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                    $user->update([
                        'emp_backupcallcode' => $json->input('backupcallcode') ?? $user->emp_backupcallcode,
                        'emp_backupphone'    => $json->input('backupphone') ?? $user->emp_backupphone,
                        'emp_backupemail'    => $json->input('backupemail') ?? $user->emp_backupemail,
                    ]);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Backup credentials updated successfully',
                    'data' => $user
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update backup credentials',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        public function recoverCredentials(Request $json)
        {
            /*
                RECOVERING CREDENTIALS
                ----------
                JSON REQUEST

                identifier - string (req: phone or email)
                account_type - string (req: customer | employee)
            */

            $validator = (new InputValidatorAPI())->recoverCredentials($json);
            if ($validator) return $validator;

            try {
                $identifier = $json->input('identifier');
                $accountType = strtolower($json->input('account_type'));

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_phone', $identifier)
                        ->orWhere('cust_email', $identifier)
                        ->orWhere('cust_backupemail', $identifier)
                        ->first();
                } else {
                    $user = Employee::where('emp_email', $identifier)
                        ->orWhere('emp_phone', $identifier)
                        ->orWhere('emp_backupemail', $identifier)
                        ->first();
                }

                if (!$user) {
                    return response()->json(['success' => false, 'message' => 'Account not found'], 404);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Credential recovery instructions issued successfully'
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to initiate credential recovery',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        public function updateCredentials(Request $json)
        {
            /*
                UPDATING CREDENTIALS
                ----------
                JSON REQUEST

                user_id - integer (req)
                account_type - string (req: customer | employee)
                new_password - string (req)
                phone - string (opt)
                email - string (opt)
            */

            $validator = (new InputValidatorAPI())->updateCredentials($json);
            if ($validator) return $validator;

            try {
                $userId = $json->input('user_id');
                $accountType = strtolower($json->input('account_type'));
                $newPassword = $json->input('new_password');

                if ($accountType === 'customer') {
                    $user = Customer::where('cust_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Customer not found'], 404);

                    $updateData = ['cust_password' => Hash::make($newPassword)];
                    if ($json->has('phone')) $updateData['cust_phone'] = $json->input('phone');
                    if ($json->has('email')) $updateData['cust_email'] = $json->input('email');
                    $user->update($updateData);

                } else {
                    $user = Employee::where('emp_id', $userId)->first();
                    if (!$user) return response()->json(['success' => false, 'message' => 'Employee not found'], 404);

                    $updateData = ['emp_password' => Hash::make($newPassword)];
                    if ($json->has('phone')) $updateData['emp_phone'] = $json->input('phone');
                    if ($json->has('email')) $updateData['emp_email'] = $json->input('email');
                    $user->update($updateData);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Credentials updated successfully'
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update credentials',
                    'error' => $e->getMessage()
                ], 500);
            }
        }
    }