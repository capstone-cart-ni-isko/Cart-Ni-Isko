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

            $validator = (new InputValidatorAPI()->customerSignup($json));
            if ($validator) return $validator;

            // Get user-provided phone and password from JSON
            $phone = $json->input('phone');
            $password = $json->input('password');

            // Check if user provided phone and password
            if (!$phone || !$password) {
                return response()->json([
                    // JSON RESPONSE
                        'success' => false,
                        'message' => 'Phone and password required'
                    ], 400);
            }

            // Check if phone already exists
            if (Customer::where('cust_phone', $phone)->exists()) {
                return response()->json([
                    // JSON RESPONSE
                        'success' => false,
                        'message' => 'Phone already exists'
                    ], 409);
            }

            // Inserts user-provided details into database using Models
            // Some fields have default values if not provided by user
            try {
                // Create new customer
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

                // Successful signup response
                return response()->json([
                    'success' => true,
                    'message' => 'Signup successful',
                    'data' => $customer
                ], 201);

            } catch (\Exception $e) {
                // Error response if signup fails
                return response()->json([
                    'success' => false,
                    'message' => 'Signup failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        public function customerLogin(Request $json)
        {

            // Get user-provided phone and password from JSON
            $phone = $json->input('phone');
            $password = $json->input('password');

            
            // Check if user provided phone and password
            if (!$phone || !$password) {
                return response()->json(['success' => false, 'message' => 'Phone and password required'], 400);
            }

            // Find customer and verify password
            try {
                $customer = Customer::where('cust_phone', $phone)->first();

                if (!$customer || !Hash::check($password, $customer->cust_password)) {
                    return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
                }

                // Successful login response
                return response()->json([
                    'success' => true,
                    'message' => 'Login successful',
                    'data' => $customer
                ], 200);

            } catch (\Exception $e) {
                // Error response if login fails
                return response()->json([
                    'success' => false,
                    'message' => 'Login failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        public function employeeSignup(Request $json)
        {
            // Get user-provided email and password from JSON
            $email      = $json->input('email');
            $password   = $json->input('password');

            // Check if user provided email and password
            if (!$email || !$password) {
                return response()->json([
                        'success' => false,
                        'message' => 'Email and password required'
                    ], 400);
            }

            // Check if email already exists
            if (Employee::where('emp_email', $email)->exists()) {
                return response()->json([
                        'success' => false,
                        'message' => 'Email already exists'
                    ], 409);
            }

            // Inserts user-provided details into database using Models
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

                // Successful signup response
                return response()->json([
                    'success' => true,
                    'message' => 'Signup successful',
                    'data' => $employee
                ], 201);

            } catch (\Exception $e) {
                // Error response if signup fails
                return response()->json([
                    'success' => false,
                    'message' => 'Signup failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        public function employeeLogin(Request $json)
        {
            // Get user-provided phone and password from JSON
            $phone = $json->input('phone');
            $password = $json->input('password');

            // Check if user provided phone and password
            if (!$phone || !$password) {
                return response()->json(['success' => false, 'message' => 'Phone and password required'], 400);
            }

            // Find employee and verify password
            try {
                $employee = Employee::where('emp_phone', $phone)->first();

                if (!$employee || !Hash::check($password, $employee->emp_password)) {
                    return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
                }

                // Successful login response
                return response()->json([
                    'success' => true,
                    'message' => 'Login successful',
                    'data' => $employee
                ], 200);

            } catch (\Exception $e) {
                // Error response if login fails
                return response()->json([
                    'success' => false,
                    'message' => 'Login failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }
    }