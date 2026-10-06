<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Employee;
    use App\Models\EmpLog;
    use App\Support\ApiToken;
    use Carbon\Carbon;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;
    use Illuminate\Support\Facades\Hash;
    use Illuminate\Support\Facades\Cache;
    use Illuminate\Support\Str;
    use Illuminate\Support\Facades\Schema;

    class AuthAPI extends Controller
    {
        /**
         * Set to false the first time the database reports the login RPC is
         * missing, so an un-migrated connection stops paying for a failed call
         * and uses the two-step read instead.
         */
        private static ?bool $loginRpcReady = null;

        /**
         * Resolves the account for a phone + password pair.
         *
         * Primary path: one `api_auth_cust_login` round trip that fetches the
         * row and verifies the bcrypt digest inside PostgreSQL, which is what
         * keeps login inside the 1-second frontend budget on a high-latency
         * Supabase link. Fallback path: the original read + `Hash::check` pair,
         * used unchanged on other drivers (SQLite) and whenever the RPC is
         * unavailable on a database that has not run the migration yet.
         */
        private function findCustomerByCredentials(string $phone, string $password): ?Customer
        {
            if (self::$loginRpcReady !== false && DB::getDriverName() === 'pgsql') {
                try {
                    $row = DB::selectOne(
                        'select * from api_auth_cust_login(?, ?)',
                        [$phone, $password]
                    );
                    self::$loginRpcReady = true;

                    return $row ? (new Customer)->newFromBuilder((array) $row) : null;
                } catch (\Illuminate\Database\QueryException $e) {
                    // 42883 = undefined_function: the RPC is simply not there.
                    if ((string) $e->getCode() !== '42883') {
                        throw $e;
                    }
                    self::$loginRpcReady = false;
                }
            }

            $customer = Customer::where('cust_phone', $phone)->first();

            if (! $customer) {
                return null;
            }

            $passMatches = false;
            try {
                $passMatches = Hash::check($password, (string) $customer->cust_password);
            } catch (\Throwable $e) {
                $passMatches = false;
            }

            return ($passMatches || (string) $customer->cust_password === $password)
                ? $customer
                : null;
        }

        public function customerSignup(Request $json)
        {
            /*
                CUSTOMER SIGNUP (DOMAIN 17)
                ----------
                JSON REQUEST

                email       - string (req - Bicol University address for BUños)
                phone       - string (req - 10 to 11 digits)
                password    - string (req)
                givname     - string (req)
                surname     - string (req)
                type        - string (req - "BUeño" | "guest")
                cust_categ  - string (req for BUños: student | alumni | faculty)
                cust_college- string (req for BUños)
                cust_dept   - string (req for BUños)
                pronoun     - string (opt)
                bday        - string (opt)
                address     - string (opt)
                callcode    - string (opt)
                backup_phone- string (opt)
                backup_email- string (opt)

                FLOW-CUST_SIGNUP-05: the account is created but NOT opened -
                no session token is returned. Only a cleared phone OTP
                finalizes it, so `cust_login_active` stays NULL (a token with
                no matching nonce is rejected by ApiToken::parse) and a signed
                `challenge` carries the customer to /verify-otp.
            */

            // Validate signup input
            $validator = (new InputValidatorAPI())->customerSignup($json);
            if ($validator) return $validator;

            $email    = strtolower(trim((string) $json->input('email')));
            $phone    = (string) $json->input('phone');
            $password = (string) $json->input('password');

            // FLOW-CUST_SIGNUP-02: cust_type is either "BUeño" or "guest".
            $kind = preg_replace('/[^a-z]/', '', strtolower((string) $json->input('type')));
            if (in_array($kind, ['student', 'alumni', 'faculty'], true)) {
                $kind = 'bueno';
            }
            $guest = $kind !== 'bueno';

            // FLOW-CUST_SIGNUP-03 / FLOW-CUST_SIGNUP-04.
            $categ   = $guest ? null : (strtolower((string) $json->input('cust_categ')) ?: 'student');
            $college = $guest ? null : (trim((string) $json->input('cust_college')) ?: null);
            $dept    = $guest ? null : (trim((string) $json->input('cust_dept')) ?: null);

            // FLOW-CUST_SIGNUP-06: the email address may not be registered.
            if ($email !== '' && Customer::where('cust_email', $email)->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'That email address is already registered.'
                ], 409);
            }

            // FLOW-CUST_SIGNUP-07 (uniqueness half): one account per number.
            if (Customer::where('cust_phone', $phone)->exists()) {
                return response()->json([
                    'success' => false,
                    'message' => 'That phone number is already registered.'
                ], 409);
            }

            // Inserts to database using Models
            try {
                $customer = Customer::create(
                    $this->signupAttributes($json, $email, $phone, $password, $guest, $categ, $college, $dept)
                );

                // FLOW-CUST_SIGNUP-05 / REQ-CUST_SIGNUP-04: the six-digit
                // code lands in the new account's own notification inbox,
                // and the signed challenge is what the verify screen redeems.
                [$code, $error] = $this->issueOtpCode($customer, 'signup');

                // REQ-CUST_LOGOUT-03 / FLOW-ACCESS_LOG-01: the registration
                // itself is an authentication action.
                $this->logCustomer((int) $customer->cust_id, 'authentication',
                    'POST /api/auth/cust_signup - account created, phone OTP pending');

                // FLOW-CUST_SIGNUP-05: the row exists but is NOT finalized, so
                // the signup stays flagged for a week - a login inside that
                // window resumes this OTP challenge instead of opening a
                // session, and clearing the flag is what finalizes the signup.
                Cache::put(
                    $this->signupPendingKey((int) $customer->cust_id),
                    ['email' => $email, 'phone' => $phone, 'ts' => now()->timestamp],
                    now()->addDays(7)
                );

                // JSON SUCCESS (account pending, no session yet)
                return response()->json([
                    'success' => true,
                    'message' => $code !== null
                        ? 'Verification code sent to your notification inbox.'
                        : (string) $error,
                    'data' => [
                        'requires_otp' => true,
                        'purpose'      => 'signup',
                        'challenge'    => ApiToken::challenge($customer, 'signup'),
                        'phone'        => $this->maskPhone($customer->cust_phone),
                        'delivery'     => 'in_app_notification',
                        'expires_in'   => self::OTP_TTL_MINUTES * 60,
                        'cust_id'      => (int) $customer->cust_id,
                    ],
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

        /**
         * Builds the CUSTOMER row for the schema that is actually connected:
         * the live system-new.docx columns when they exist, the pre-migration
         * columns otherwise (the legacy fixtures used by the test suite).
         * No column outside either generation is ever written.
         */
        private function signupAttributes(
            Request $json,
            string $email,
            string $phone,
            string $password,
            bool $guest,
            ?string $categ,
            ?string $college,
            ?string $dept
        ): array {
            $address = trim((string) ($json->input('address')
                ?: implode(', ', array_filter([
                    $json->input('brgy'),
                    $json->input('city'),
                    $json->input('province'),
                    $json->input('country'),
                ]))));
            $bday = (string) ($json->input('bday') ?: $json->input('birthday'));

            $attributes = [
                // The live customer table carries no sequence, so the key is
                // handed out by the shared allocator (see IdAllocator).
                'cust_id'       => $this->nextId('customer', 'cust_id'),
                'cust_created'  => now(),
                'cust_password' => Hash::make($password),
                'cust_callcode' => $json->input('callcode') ?: '+63',
                'cust_pronoun'  => $json->input('pronoun') ?: 'they/them',
                'cust_phone'    => $phone,
                'cust_email'    => $email !== '' ? $email : null,
                'cust_type'     => $guest ? 'guest' : 'bueño',
                'cust_college'  => $college,
                'cust_wishlist' => 0,
                'cust_orders'   => 0,
            ];

            if (Schema::hasColumn('customer', 'cust_givname')) {
                return $attributes + [
                    'cust_givname'             => trim((string) $json->input('givname')),
                    'cust_surname'             => trim((string) $json->input('surname')),
                    'cust_address'             => $address !== '' ? $address : null,
                    'cust_bday'                => $bday !== '' ? $bday : null,
                    'cust_avatar'              => null,
                    // FLOW-CUST_SIGNUP-03 / FLOW-CUST_SIGNUP-04
                    'cust_categ'               => $categ,
                    'cust_dept'                => $dept,
                    'cust_backup_phone'        => trim((string) ($json->input('backup_phone') ?: $json->input('backupphone'))) ?: null,
                    'cust_backup_email'        => strtolower(trim((string) ($json->input('backup_email') ?: $json->input('backupemail')))) ?: null,
                    'cust_backup_ques'         => null,
                    'cust_backup_answer'       => null,
                    'cust_backup_code'         => null,
                    'cust_darkmode'            => false,
                    'cust_deleted'             => null,
                    'cust_suspended'           => null,
                    // FLOW-CUST_SIGNUP-05: no live session until the OTP clears
                    'cust_login_active'        => null,
                    'cust_login_failed'        => null,
                    'cust_last_logout'         => null,
                    'cust_notif_appointremind' => 10,
                    'cust_notif_email'         => false,
                    'cust_notif_prod'          => false,
                    'cust_appoint'             => 0,
                    'cust_bag'                 => 0,
                    'cust_unread'              => 0,
                ];
            }

            // Legacy (pre-migration) table shape.
            return $attributes + [
                'cust_nickname'  => trim((string) $json->input('givname') . ' ' . (string) $json->input('surname')),
                'cust_birthday'  => $bday !== '' ? $bday : '2000-01-01',
                'cust_brgy'      => (string) $json->input('brgy'),
                'cust_city'      => (string) $json->input('city'),
                'cust_province'  => (string) $json->input('province'),
                'cust_country'   => (string) ($json->input('country') ?: ''),
                'cust_cart'      => 0,
                'cust_appoints'  => 0,
            ];
        }

        /** 09171234567 -> 0917****567 (REQ-CUST_SIGNUP-04 delivery notice). */
        protected function maskPhone(?string $phone): string
        {
            $phone = trim((string) $phone);
            $length = strlen($phone);

            if ($length < 7) {
                return $phone;
            }

            return substr($phone, 0, 4) . str_repeat('*', $length - 7) . substr($phone, -3);
        }

        public function customerLogin(Request $json)
        {
            /*
                CUSTOMER LOGIN (DOMAIN 18)
                ----------
                JSON REQUEST

                email    - string (req - the login form's email address; a
                           registered phone number is accepted as the same
                           identifier for accounts with a NULL cust_email)
                phone    - string (req|alt)
                password - string (req)

                FLOW-CUST_LOGIN-02: correct credentials open the session,
                except when the last logout is more than fifteen days old -
                or the signup was never finished - in which case the answer
                carries a signed `challenge` instead of a token and the
                customer has to clear a phone OTP first.
            */

            // Validate login input
            $validator = (new InputValidatorAPI())->customerLogin($json);
            if ($validator) return $validator;

            $identifier = (string) ($json->input('email') ?: $json->input('phone'));
            $password   = (string) $json->input('password');

            try {
                $customer = $this->findCustomerByIdentifier($identifier, $password);

                if (! $customer) {
                    $this->stampFailedLogin($identifier);

                    // JSON ERROR (the form keeps every typed value: REQ-CUST_LOGIN-02)
                    return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
                }

                // Banned or deleted accounts lose access immediately (REQ-UM-02).
                // `cust_suspended` is the live flag; `cust_disabled` is the
                // legacy spelling still carried by older rows, so both end
                // the login the same way.
                if ($customer->cust_deleted || $customer->cust_suspended || $customer->cust_disabled) {
                    return response()->json(['success' => false, 'message' => 'Account disabled'], 403);
                }

                // FLOW-CUST_SIGNUP-05: an account whose phone OTP never
                // cleared is still pending, so logging in resumes that
                // challenge instead of opening a session.
                $pendingSignup = Cache::get($this->signupPendingKey((int) $customer->cust_id));

                // FLOW-CUST_LOGIN-02: more than fifteen days since
                // cust_last_logout (a first login counts from cust_created).
                $anchor = $customer->cust_last_logout ?: $customer->cust_created;
                $staleLogin = $anchor !== null && Carbon::parse($anchor)->addDays(15)->isPast();

                if ($pendingSignup || $staleLogin) {
                    $purpose = $pendingSignup ? 'signup' : 'login';
                    [$code] = $this->issueOtpCode($customer, $purpose);

                    $this->logCustomer((int) $customer->cust_id, 'authentication',
                        'POST /api/auth/cust_login - phone OTP required (' . $purpose . ')');

                    // JSON SUCCESS: a challenge, never a session token.
                    return response()->json([
                        'success' => true,
                        'message' => 'Verification code sent to your notification inbox.',
                        'data' => [
                            'requires_otp' => true,
                            'purpose'      => $purpose,
                            'challenge'    => ApiToken::challenge($customer, $purpose),
                            'phone'        => $this->maskPhone($customer->cust_phone),
                            'delivery'     => 'in_app_notification',
                            'expires_in'   => self::OTP_TTL_MINUTES * 60,
                            'cust_id'      => (int) $customer->cust_id,
                        ],
                    ], 200);
                }

                // JSON SUCCESS
                return $this->openCustomerSession($customer, 'POST /api/auth/cust_login', 'Login successful');

            } catch (\Exception $e) {
                // If stored password in DB is plain text or fails bcrypt verification
                $msg = str_contains($e->getMessage(), 'Bcrypt') ? 'Invalid credentials' : 'Login failed';
                return response()->json([
                    'success' => false,
                    'message' => $msg,
                    'error' => $e->getMessage()
                ], 400);
            }
        }

        /**
         * Resolves an account from the login form's identifier (email first,
         * registered phone number as the legacy fallback) and checks the
         * password on the way through.
         */
        private function findCustomerByIdentifier(string $identifier, string $password): ?Customer
        {
            if (str_contains($identifier, '@')) {
                $customer = Customer::where('cust_email', strtolower(trim($identifier)))->first();

                if (! $customer) {
                    return null;
                }

                $matches = false;
                try {
                    $matches = Hash::check($password, (string) $customer->cust_password);
                } catch (\Throwable $e) {
                    $matches = false;
                }

                return ($matches || (string) $customer->cust_password === $password)
                    ? $customer
                    : null;
            }

            $phone = preg_replace('/[^0-9]/', '', $identifier) ?: $identifier;

            return $this->findCustomerByCredentials($phone, $password);
        }

        /**
         * FLOW-ACCESS_LOG-01: a rejected login still leaves its mark on the
         * account it was aimed at (cust_login_failed).
         */
        private function stampFailedLogin(string $identifier): void
        {
            try {
                $customer = str_contains($identifier, '@')
                    ? Customer::where('cust_email', strtolower(trim($identifier)))->first()
                    : Customer::where('cust_phone', preg_replace('/[^0-9]/', '', $identifier))->first();

                if ($customer && Schema::hasColumn('customer', 'cust_login_failed')) {
                    $customer->cust_login_failed = now();
                    $customer->save();
                }
            } catch (\Throwable $e) {
                // Bookkeeping must never change the login answer.
            }
        }

        /**
         * Opens the customer session: the nonce in `cust_login_active` is
         * rotated (so any older token dies at once), the failed-login stamp
         * is cleared and DOMAIN 32 gets its authentication entry.
         */
        private function openCustomerSession(Customer $customer, string $endpoint, string $message)
        {
            $customer->cust_login_failed = null;

            try {
                $token = ApiToken::issue($customer);
            } catch (\Throwable $e) {
                $token = ApiToken::issue($customer);
            }

            $this->logCustomer((int) $customer->cust_id, 'authentication', $endpoint);

            return response()->json([
                'success' => true,
                'message' => $message,
                'data' => array_merge($customer->toArray(), ['token' => $token]),
            ], 200);
        }

        /**
         * Keeps the subset of $attributes whose columns exist on the connected
         * schema. The system-new.docx SCHEMA (live) and the pre-migration
         * fixture phpunit runs on do not carry the same names, and writing a
         * column the connection does not have - or omitting one it requires -
         * fails the whole statement.
         *
         * @param  array<string, mixed>  $attributes
         * @return array<string, mixed>
         */
        private function existingColumns(string $table, array $attributes): array
        {
            static $listing = [];

            $columns = $listing[$table] ??= Schema::getColumnListing($table);

            return array_filter(
                $attributes,
                // ARRAY_FILTER_USE_KEY hands the key - the column name - as
                // the callback's only argument.
                static fn (string $column) => in_array($column, $columns, true),
                ARRAY_FILTER_USE_KEY
            );
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

                // The connected schema decides which of those columns exist:
                // the live employee table carries the system-new.docx set
                // (no emp_birthday / emp_brgy / emp_type ...), while the
                // pre-migration fixture phpunit runs on still declares its own
                // NOT NULL columns. forceCreate writes exactly the intersection
                // - the model's fillable list would silently drop the fixture's
                // required columns and fail the insert - and every key above
                // comes from this whitelist, never straight from the request.
                $employee = Employee::forceCreate(
                    $this->existingColumns('employee', $attributes)
                );

                // REQ-UM-04: registrations are logged with the responsible
                // super admin and the timestamp, like every other user
                // management action.
                $by = $json->user('api');
                EmpLog::forceCreate(
                    $this->existingColumns('emplog', [
                        'emplog_id'      => $this->nextId('emplog', 'emplog_id'),
                        'emp_id'         => $employee->emp_id,
                        'emplog_created' => now(),
                        'emplog_access'  => 'edit',
                        'emplog_endpoint' => 'POST /api/auth/emp_signup',
                        // Legacy fixture columns (dropped where they are absent).
                        'emplog_action'  => 'REGISTER',
                        'emplog_desc'    => 'Registered employee ' . $employee->emp_id . ' ('
                            . $employee->emp_givname . ' ' . $employee->emp_surname . ') as '
                            . $type . ' by super admin '
                            . ($by instanceof Employee ? $by->emp_id : 'unknown')
                            . '. Reason: new employee onboarding.',
                    ])
                );

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

            // One narrow indexed read: emp_email carries a unique index, so
            // this is a single round trip. Connection handling around it is
            // tuned for the 1-second budget (see config/database.php); the
            // expiry check, credential comparison and token minting are
            // unchanged.
            try {
                $employee = Employee::where('emp_email', $email)->first();

                $empPassMatches = false;
                try {
                    $empPassMatches = $employee && Hash::check($password, (string) $employee->emp_password);
                } catch (\Throwable $e) {
                    $empPassMatches = false;
                }

                if (! $employee || (! $empPassMatches && (string) $employee->emp_password !== $password)) {
                    // JSON ERROR
                    return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
                }

                if (! $employee->emp_cred_changed && $employee->emp_created?->addHours(24)->isPast()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'The temporary password has expired. Contact a super admin.',
                    ], 403);
                }

                // Banned or deleted accounts lose access immediately (REQ-UM-02).
                // `emp_suspended` is the live flag; `emp_disabled` is the legacy
                // spelling some rows still carry.
                if ($employee->emp_suspended || $employee->emp_deleted || $employee->emp_disabled) {
                    // JSON ERROR
                    return response()->json(['success' => false, 'message' => 'Account disabled'], 403);
                }

                // Issue an API token for the session
                try {
                    $token = \App\Support\ApiToken::issue($employee);
                } catch (\Throwable $e) {
                    $token = $employee->createToken('auth_token')->plainTextToken;
                }

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
            /*
                LOGOUT (DOMAIN 30)
                ----------
                FLOW-CUST_LOGOUT-04: the logout timestamp is saved to the
                database, REQ-CUST_LOGOUT-03: the event itself is written to
                the access log, and FLOW-CUST_LOGOUT-05: the client is sent
                back to /login.

                Clearing the session nonce in *_login_active revokes the very
                token that carried this request, so it - and every other token
                of the same session - is dead the moment the answer lands
                (ApiToken::parse compares the nonce field against that column).
            */
            $user = $json->user('api');

            if ($user instanceof Customer) {
                $user->cust_last_logout = now();
                $user->cust_login_active = null;
                $user->cust_login_failed = null;
                $user->save();

                $this->logCustomer((int) $user->cust_id, 'authentication', 'POST /api/auth/logout');
            } elseif ($user instanceof Employee) {
                $user->emp_last_logout = now();
                $user->emp_login_active = null;
                $user->save();

                $this->logEmployee((int) $user->emp_id, 'authentication', 'POST /api/auth/logout');
            } else {
                return response()->json([
                    'success' => false,
                    'message' => 'Account is not supported.',
                ], 403);
            }

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

            // DOMAIN 29 / FLOW-CUST_SET-03: a customer always proves the
            // change with a phone OTP before anything is written.
            $gate = $this->otpGate($json, 'password_change');
            if ($gate) {
                return $gate;
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

            // The verification covers exactly this one change (FLOW-CUST_SET-06).
            $this->consumeOtp($json, 'password_change');

            // REQ-CUST_SET-02 / REQ-EMP_SET-02: every setting change is logged.
            if ($user instanceof Customer) {
                $this->logCustomer((int) $user->cust_id, 'edit',
                    'PUT /api/auth/update_credentials - password changed');
            } else {
                $this->logEmployee((int) $user->emp_id, 'edit',
                    'PUT /api/auth/update_credentials - password changed');
            }

            return response()->json([
                'success' => true,
                'message' => 'Credentials updated successfully. Please sign in again.',
            ]);
        }
    }