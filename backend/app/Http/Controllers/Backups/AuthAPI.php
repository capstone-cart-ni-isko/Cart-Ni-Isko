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
            $validator = (new InputValidatorAPI()->customerSignup($json));
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
            $validator = (new InputValidatorAPI()->customerLogin($json));
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
            $validator = (new InputValidatorAPI()->employeeSignup($json));
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
            $validator = (new InputValidatorAPI()->employeeLogin($json));
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
    }