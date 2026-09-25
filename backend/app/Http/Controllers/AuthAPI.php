<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Employee;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\Hash;
    use Illuminate\Support\Str;
    use Illuminate\Support\Facades\Schema;

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
                country - string (opt)
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
                $type = $json->input('type') ?? 'Student';
                $attributes = [
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
                    'cust_email' => $json->input('email') ?: null,
                    'cust_type' => $type,
                    'cust_college' => ($type === 'Student') ? ($json->input('college') ?? '') : '',
                    'cust_wishlist' => 0,
                    'cust_cart' => 0,
                    'cust_orders' => 0,
                    'cust_appoints' => 0,
                ];

                // Stamp the first credential set (REQ-APC-01 baseline);
                // guarded so connections without the migration still work
                if (Schema::hasColumn('customer', 'cust_cred_changed')) {
                    $attributes['cust_cred_changed'] = now();
                }

                // Optional default country (guarded until the column exists)
                if (Schema::hasColumn('customer', 'cust_country')) {
                    $attributes['cust_country'] = $json->input('country') ?? '';
                }

                // Signup details the edit-profile form round-trips; guarded so
                // connections without the migration still sign up cleanly.
                if (Schema::hasColumn('customer', 'cust_username')) {
                    $attributes['cust_username'] = $json->input('username') ?? '';
                }
                if ($type === 'Student') {
                    if (Schema::hasColumn('customer', 'cust_campus')) {
                        $attributes['cust_campus'] = $json->input('campus') ?? '';
                    }
                    if (Schema::hasColumn('customer', 'cust_course')) {
                        $attributes['cust_course'] = $json->input('course') ?? '';
                    }
                    if (Schema::hasColumn('customer', 'cust_year')) {
                        $attributes['cust_year'] = $json->input('year_level') ?? '';
                    }
                }

                $customer = Customer::create($attributes);

                // Issue an API token for the new account
                $token = $customer->createToken('auth_token')->plainTextToken;

                // JSON SUCCESS
                return response()->json([
                    'success' => true,
                    'message' => 'Signup successful',
                    'data' => array_merge($customer->toArray(), ['token' => $token])
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

                // Banned or deleted accounts lose access immediately (REQ-UM-02)
                if ($customer->cust_disabled || $customer->cust_deleted) {
                    // JSON ERROR
                    return response()->json(['success' => false, 'message' => 'Account disabled'], 403);
                }

                // Issue an API token for the session
                $token = $customer->createToken('auth_token')->plainTextToken;

                // JSON SUCCESS
                return response()->json([
                    'success' => true,
                    'message' => 'Login successful',
                    'data' => array_merge($customer->toArray(), ['token' => $token])
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

            $email = $json->input('email');
            $temporaryPassword = Str::password(16);
            $type = strtoupper($json->input('type', 'STAFF'));

            if (Employee::where('emp_email', $email)->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Email already exists',
                ], 409);
            }

            try {
                $attributes = [
                    'emp_created' => now(),
                    'emp_password' => Hash::make($temporaryPassword),
                    'emp_surname' => $json->input('surname'),
                    'emp_givname' => $json->input('givname'),
                    'emp_midname' => $json->input('midname', ''),
                    'emp_suffix' => $json->input('suffix', ''),
                    'emp_studnum' => $json->input('studnum'),
                    'emp_college' => $json->input('college'),
                    'emp_program' => $json->input('program'),
                    'emp_year' => $json->input('year'),
                    'emp_bloc' => $json->input('bloc'),
                    'emp_pronoun' => $json->input('pronoun', 'they/them'),
                    'emp_birthday' => $json->input('birthday', '2000-01-01'),
                    'emp_brgy' => $json->input('brgy', ''),
                    'emp_city' => $json->input('city', ''),
                    'emp_province' => $json->input('province', ''),
                    'emp_country' => $json->input('country', 'PH'),
                    'emp_callcode' => $json->input('callcode', '+63'),
                    'emp_phone' => $json->input('phone'),
                    'emp_email' => $email,
                    'emp_type' => $type,
                    'emp_instore' => (bool) $json->input('instore', false),
                    'emp_cred_changed' => null,
                ];

                $employee = Employee::create($attributes);

                return response()->json([
                    'success' => true,
                    'message' => 'Employee registered. Share the temporary password securely.',
                    'data' => array_merge($employee->toArray(), [
                        'temporary_password' => $temporaryPassword,
                    ]),
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

                if (! $employee->emp_cred_changed && $employee->emp_created?->addHours(24)->isPast()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'The temporary password has expired. Contact a super admin.',
                    ], 403);
                }

                // Banned or deleted accounts lose access immediately (REQ-UM-02)
                if ($employee->emp_disabled || $employee->emp_deleted) {
                    // JSON ERROR
                    return response()->json(['success' => false, 'message' => 'Account disabled'], 403);
                }

                // Issue an API token for the session
                $token = $employee->createToken('auth_token')->plainTextToken;

                // JSON SUCCESS
                return response()->json([
                    'success' => true,
                    'message' => 'Login successful',
                    'data' => array_merge($employee->toArray(), [
                        'token' => $token,
                        'must_change_password' => ! $employee->emp_cred_changed,
                    ])
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

        public function logout(Request $json)
        {
            $json->user()->currentAccessToken()?->delete();

            return response()->json([
                'success' => true,
                'message' => 'Logout successful',
            ]);
        }

        public function backupCredentials(Request $json)
        {
            $validator = (new InputValidatorAPI())->backupCredentials($json);
            if ($validator) {
                return $validator;
            }

            $user = $json->user();
            $fields = array_filter([
                'backupcallcode' => $json->input('backupcallcode'),
                'backupphone' => $json->input('backupphone'),
                'backupemail' => $json->input('backupemail'),
            ], static fn ($value) => $value !== null && $value !== '');

            if ($user instanceof Customer) {
                $user->update([
                    'cust_backupcallcode' => $fields['backupcallcode'] ?? $user->cust_backupcallcode,
                    'cust_backupphone' => $fields['backupphone'] ?? $user->cust_backupphone,
                    'cust_backupemail' => $fields['backupemail'] ?? $user->cust_backupemail,
                ]);
            } elseif ($user instanceof Employee) {
                $user->update([
                    'emp_backupcallcode' => $fields['backupcallcode'] ?? $user->emp_backupcallcode,
                    'emp_backupphone' => $fields['backupphone'] ?? $user->emp_backupphone,
                    'emp_backupemail' => $fields['backupemail'] ?? $user->emp_backupemail,
                ]);
            } else {
                return response()->json(['success' => false, 'message' => 'Account is not supported.'], 403);
            }

            return response()->json([
                'success' => true,
                'message' => 'Backup credentials updated successfully',
                'data' => $user,
            ]);
        }

        public function recoverCredentials(Request $json)
        {
            $validator = (new InputValidatorAPI())->recoverCredentials($json);
            if ($validator) {
                return $validator;
            }

            return response()->json([
                'success' => true,
                'message' => 'If the account exists, recovery instructions will be sent to its registered contact.',
            ]);
        }

        public function updateCredentials(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateCredentials($json);
            if ($validator) {
                return $validator;
            }

            $user = $json->user();
            $passwordField = $user instanceof Customer ? 'cust_password' : 'emp_password';
            $changedField = $user instanceof Customer ? 'cust_cred_changed' : 'emp_cred_changed';

            if (! Hash::check($json->input('current_password'), $user->{$passwordField})) {
                return response()->json([
                    'success' => false,
                    'message' => 'Current password is incorrect.',
                ], 422);
            }

            $initialEmployeeGrace = $user instanceof Employee
                && ! $user->emp_cred_changed
                && $user->emp_created?->addHours(24)->isFuture();

            $blocked = $this->credentialChangeBlocked($user->{$changedField});
            if ($blocked && ! $initialEmployeeGrace) {
                return $blocked;
            }

            $update = [$passwordField => Hash::make($json->input('new_password'))];
            if ($user instanceof Customer) {
                if ($json->has('phone')) {
                    $update['cust_phone'] = $json->input('phone');
                }
                if ($json->has('email')) {
                    $update['cust_email'] = $json->input('email');
                }
            } else {
                if ($json->has('phone')) {
                    $update['emp_phone'] = $json->input('phone');
                }
                if ($json->has('email')) {
                    $update['emp_email'] = $json->input('email');
                }
            }
            $update[$changedField] = now();
            $user->update($update);
            $user->tokens()->delete();

            return response()->json([
                'success' => true,
                'message' => 'Credentials updated successfully. Please sign in again.',
            ]);
        }
    }