<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Employee;
    use App\Models\EmpLog;
    use App\Models\Schedule;
    use App\Support\ApiToken;
    use App\Support\EmployeePassword;
    use App\Support\SystemSettings;
    use Carbon\Carbon;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;
    use Illuminate\Support\Facades\Hash;
    use Illuminate\Support\Facades\Cache;
    use Illuminate\Support\Facades\Mail;
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
            $guest = $this->normalizeSignupType($json->input('type')) !== 'bueno';

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
                'cust_type'     => $guest ? 'guest' : 'BUeño',
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
                    // NOT NULL on the live system-new.docx schema with the
                    // default "/", so the marker is written explicitly - an
                    // explicit NULL here would abort the insert (23502).
                    'cust_backup_code'         => '/',
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
                EMPLOYEE ENROLLMENT (DOMAIN 6)
                ----------
                JSON REQUEST

                email - string (req - must be a Bicol University address)
                phone - string (req)
                surname - string (req)
                givname - string (req)
                categ / type - string (opt: staff | admin | super admin)
                midname, suffix, studnum, pronoun, birthday, brgy, city,
                province, country, callcode, instore - optional details

                FLOW-EMP_ENROLL-02 collects exactly the five required values,
                FLOW-EMP_ENROLL-03 validates the university domain,
                FLOW-EMP_ENROLL-04 generates and emails the temporary
                password, FLOW-EMP_ENROLL-05 opens the account as "active" and
                preschedules it as "available", FLOW-EMP_ENROLL-06 confirms
                back to the super admin and FLOW-EMP_ENROLL-07 writes the
                enrollment - failures included (REQ-EMP_ENROLL-05) - to the
                access log.
            */

            // Validate signup input
            $validator = (new InputValidatorAPI())->employeeSignup($json);
            if ($validator) {
                // REQ-EMP_ENROLL-05: a rejected attempt is an attempt too.
                $this->logEnrollment($json, 'FAILED', $validator->getData()['message'] ?? 'rejected');

                return $validator;
            }

            $email = strtolower(trim((string) $json->input('email')));
            $temporaryPassword = EmployeePassword::generateTemporary(20);
            $type = $this->employeeCategory($json);

            if (Employee::where('emp_email', $email)->exists()) {
                // REQ-EMP_ENROLL-04: duplicates are rejected with a clear error
                // (and the attempt still lands in the log).
                $this->logEnrollment($json, 'FAILED', 'duplicate email ' . $email);

                return response()->json([
                    'success' => false,
                    'message' => 'Email already exists',
                ], 409);
            }

            try {
                $attributes = [
                    'emp_created' => now(),
                    'emp_password' => EmployeePassword::makeTemporary($temporaryPassword),
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
                    // FLOW-EMP_ENROLL-02: the initial category. The live table
                    // spells it `emp_categ` (lowercase, rule 32); the fixture
                    // still carries the legacy `emp_type` alias.
                    'emp_categ' => $type,
                    'emp_type' => strtoupper($type),
                    'emp_instore' => (bool) $json->input('instore', false),
                    // FLOW-EMP_ENROLL-05: the account opens active, so both
                    // blocking stamps stay empty until somebody suspends it.
                    'emp_suspended' => null,
                    'emp_deleted' => null,
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

                // FLOW-EMP_ENROLL-05 / REQ-EMP_ENROLL-06: the new account is
                // prescheduled as available straight away (full availability
                // for the next seven days clears the 180-minute weekly floor).
                $this->prescheduleNewEmployee((int) $employee->emp_id);

                // FLOW-EMP_ENROLL-04: the generated password goes to the
                // employee's Bicol University mailbox as well as back to the
                // super admin. MAIL_MAILER=log keeps this best-effort - a mail
                // transport that is not configured must not fail the signup.
                $this->mailTemporaryPassword($employee, $temporaryPassword);

                // REQ-UM-04 / FLOW-EMP_ENROLL-07: registrations are logged
                // with the responsible super admin and the timestamp, like
                // every other user management action.
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

                // FLOW-EMP_ENROLL-07: the same event, filed under the id of
                // the super admin who performed it.
                $this->logEnrollment($json, 'ENROLLED', $email . ' as ' . $type);

                return response()->json([
                    'success' => true,
                    'message' => 'Employee enrolled. Share the temporary password securely.',
                    'data' => array_merge($employee->toArray(), [
                        'temporary_password' => $temporaryPassword,
                        'must_change_password' => true,
                        'emp_categ' => $type,
                    ]),
                ], 201);
            } catch (\Exception $e) {
                // REQ-EMP_ENROLL-05: failures are logged too.
                $this->logEnrollment($json, 'FAILED', $email . ' - ' . $e->getMessage());

                // JSON ERROR
                return response()->json([
                    'success' => false,
                    'message' => 'Signup failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        // The super-admin test itself lives on the base Controller
        // (`protected isSuperAdmin($user)`) and delegates to
        // Employee::isSuperAdmin(). Redeclaring it here - with a narrower
        // visibility *and* a narrower parameter type - is a PHP fatal error
        // that php -l cannot see, and it 500'd /auth/emp_login, which the
        // portal then surfaced as "Cannot reach the server".

        /**
         * FLOW-EMP_ENROLL-02 - the initial category posted by the enrolment
         * form, folded onto rule 32's vocabulary ("staff", "admin", "super
         * admin"). `categ` is the system-new spelling, `type` the legacy alias.
         */
        private function employeeCategory(Request $json): string
        {
            $raw = (string) ($json->input('categ') ?: $json->input('type') ?: 'STAFF');
            $raw = strtolower(trim($raw));

            return match (true) {
                str_contains($raw, 'super') => 'super admin',
                str_contains($raw, 'admin') => 'admin',
                default => 'staff',
            };
        }

        /**
         * FLOW-EMP_ENROLL-05 / REQ-EMP_ENROLL-06 - a new employee is
         * prescheduled as "available" the moment the account is opened, so
         * their first week carries full availability (one unbroken block from
         * now, well past the 180-minute weekly floor of rule 46).
         *
         * The live connection owns a `schedules` table; the pre-migration
         * fixture does not, so the write is skipped there rather than failing
         * the enrollment.
         */
        private function prescheduleNewEmployee(int $empId): void
        {
            try {
                if (! Schema::hasTable('schedules')) {
                    return;
                }

                $start = now();
                Schedule::forceCreate([
                    'sched_id'         => $this->nextId('schedules', 'sched_id'),
                    'emp_id'           => $empId,
                    'sched_time_start' => $start,
                    'sched_time_end'   => $start->copy()->addDays(7),
                    'sched_created'    => now(),
                    // null = prescheduled / available (see the Schedule model).
                    'sched_disabled'   => null,
                ]);
            } catch (\Throwable $e) {
                // Availability bookkeeping must never undo an enrollment.
            }
        }

        /**
         * FLOW-EMP_ENROLL-04 - hands the generated password to the employee's
         * Bicol University mailbox. Best-effort by design: with MAIL_MAILER=log
         * (or an unreachable transport) the message is written to the mail log
         * and the super admin still receives the password in the response.
         */
        private function mailTemporaryPassword(Employee $employee, string $temporaryPassword): void
        {
            try {
                $body = "Hello {$employee->emp_givname},\n\n"
                    . "Your staff account for Tindahan ni Isko has been enrolled "
                    . "as {$employee->emp_email}.\n\n"
                    . "Temporary password: {$temporaryPassword}\n\n"
                    . "You must change this password the first time you sign in. "
                    . "Contact a super admin if you did not expect this account.\n";

                Mail::raw($body, function ($message) use ($employee) {
                    $message->to($employee->emp_email)
                        ->subject('Your Tindahan ni Isko staff account');
                });
            } catch (\Throwable $e) {
                // Never fail enrollment because of a mail transport.
            }
        }

        /**
         * FLOW-EMP_ENROLL-07 / REQ-EMP_ENROLL-05 - one immutable emplog row for
         * the enrollment itself, filed under the id of the super admin who
         * performed it (successes and failures alike).
         */
        private function logEnrollment(Request $json, string $outcome, string $detail): void
        {
            $by = $json->user('api');

            if (! $by instanceof Employee) {
                return;
            }

            $this->logEmployee(
                (int) $by->emp_id,
                'edit',
                'POST /api/auth/emp_signup - ' . $outcome . ': ' . $detail
            );
        }

        public function employeeLogin(Request $json)
        {
            /*
                EMPLOYEE LOGIN (DOMAIN 2)
                ----------
                JSON REQUEST

                password - string (req)
                email - string (req)

                FLOW-EMP_LOGIN-02/04/05/07 give the form its three realtime
                messages ("User not found", "Provide a valid email", "Wrong
                password"); they are produced by POST /auth/emp_login/check as
                the employee types, and this endpoint answers the same
                vocabulary on submit so the screen never has to invent an
                error. Nothing typed into the form is ever cleared
                (REQ-EMP_LOGIN-04/05).
            */

            // Validate login input
            $validator = (new InputValidatorAPI())->employeeLogin($json);
            if ($validator) return $validator;
            
            // Get user email and password
            $email = trim((string) $json->input('email'));
            $password = (string) $json->input('password');

            // One narrow indexed read: emp_email carries a unique index, so
            // this is a single round trip. Connection handling around it is
            // tuned for the 1-second budget (see config/database.php); the
            // expiry check, credential comparison and token minting are
            // unchanged.
            try {
                $employee = Employee::where('emp_email', $email)->first();

                if (! $employee) {
                    // FLOW-EMP_LOGIN-02: the account does not exist.
                    return response()->json([
                        'success' => false,
                        'message' => 'User not found',
                        'code' => 'EMP_NOT_FOUND',
                    ], 401);
                }

                // Every value in `employee.emp_password` is a bcrypt digest
                // (Employee::saving + EmployeePassword), so this is a real
                // digest comparison - never a plaintext fallback.
                $check = EmployeePassword::verify($password, (string) $employee->emp_password);

                if (! $check['valid']) {
                    // FLOW-EMP_LOGIN-07 + DOMAIN 32: a wrong password is
                    // stamped on the account and filed in the access log.
                    $this->stampFailedEmployeeLogin($employee);
                    $this->logEmployee((int) $employee->emp_id, 'auth',
                        'POST /api/auth/emp_login - failed');

                    return response()->json([
                        'success' => false,
                        'message' => 'Wrong password',
                        'code' => 'WRONG_PASSWORD',
                    ], 401);
                }

                // REQ-EMP_ENROLL-03: a system-generated password only lives for
                // twenty-four hours after the account was enrolled, and it has
                // to be replaced on first sign-in.
                if ($check['temporary'] && $employee->emp_created
                    && $employee->emp_created->copy()->addHours(24)->isPast()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'The temporary password has expired. Contact a super admin.',
                        'code' => 'TEMP_PASSWORD_EXPIRED',
                    ], 403);
                }

                // Banned or deleted accounts lose access immediately (REQ-UM-02).
                // `emp_suspended` is the live flag; `emp_disabled` is the legacy
                // spelling some rows still carry.
                if ($employee->emp_suspended || $employee->emp_deleted || $employee->emp_disabled) {
                    // JSON ERROR
                    return response()->json(['success' => false, 'message' => 'Account disabled'], 403);
                }

                // FLOW-SETUP-03 - configuration must be complete before the
                // portal opens its doors. Super admins are exempt: the
                // first-time administrator (FLOW-SETUP-05) has to be able to
                // sign in and finish the wizard, and REQ-SETUP-04 keeps the
                // blocked attempt in the access log.
                $missingSetup = SystemSettings::missingCritical();
                if ($missingSetup && ! $this->isSuperAdmin($employee)) {
                    $this->logEmployee((int) $employee->emp_id, 'auth',
                        'POST /api/auth/emp_login - blocked, setup incomplete');

                    return response()->json([
                        'success' => false,
                        'message' => 'Store setup is incomplete. A super admin must finish the setup wizard first.',
                        'code'    => 'SETUP_INCOMPLETE',
                        'data'    => ['missing_critical' => $missingSetup],
                    ], 503);
                }

                // Issue an API token for the session
                try {
                    $token = \App\Support\ApiToken::issue($employee);
                } catch (\Throwable $e) {
                    $token = $employee->createToken('auth_token')->plainTextToken;
                }

                /*
                    The failed-attempt stamp is only meaningful while the
                    account is still locked out of a successful sign-in: the
                    customer side clears `cust_login_failed` the same way, and
                    leaving a stale mark on `emp_login_failed` would misreport
                    every later audit of this account.
                */
                if ($employee->emp_login_failed !== null && \Schema::hasColumn('employee', 'emp_login_failed')) {
                    try {
                        $employee->emp_login_failed = null;
                        $employee->save();
                    } catch (\Throwable $e) {
                        // Bookkeeping must never change the login answer.
                    }
                }

                // FLOW-ACCESS_LOG-04: a successful employee login is logged.
                $this->logEmployee((int) $employee->emp_id, 'auth', 'POST /api/auth/emp_login');

                // JSON SUCCESS
                return response()->json([
                    'success' => true,
                    'message' => 'Login successful',
                    'data' => array_merge($employee->toArray(), [
                        'token' => $token,
                        // REQ-EMP_ENROLL-03: the temporary password is marked
                        // for a required change on first login.
                        'must_change_password' => $check['temporary'],
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

        /**
         * DOMAIN 2 - the realtime check behind the inline messages of the
         * staff login form.
         *
         * POST /api/auth/emp_login/check   { email, password? }
         *
         * FLOW-EMP_LOGIN-02/03 answer `email_exists` (the "User not found"
         * line under the email field), FLOW-EMP_LOGIN-04..08 answer
         * `password_correct` (the "Provide a valid email" / "Wrong password"
         * lines under the password field). The form decides which message to
         * show; this endpoint only reports what the database says.
         *
         * It is throttled and never mutates anything: no session is opened,
         * no log row is written, so typing cannot fill the access log.
         */
        public function employeeLoginCheck(Request $json)
        {
            $email = trim((string) $json->input('email', ''));
            $password = (string) $json->input('password', '');

            $employee = $email !== ''
                ? Employee::where('emp_email', $email)->first()
                : null;

            /*
                One bcrypt comparison per keystroke batch, not two: the answer
                `password_correct` (FLOW-EMP_LOGIN-07/08) and the flag
                `must_change_password` (REQ-EMP_ENROLL-03) both come out of the
                same verification, so a login form being typed into costs a
                single ~100 ms comparison inside the one-second budget.
            */
            $verified = $employee && $password !== ''
                ? EmployeePassword::verify($password, (string) $employee->emp_password)
                : null;

            // JSON SUCCESS
            return response()->json([
                'success' => true,
                'data' => [
                    // FLOW-EMP_LOGIN-02/03
                    'email_exists' => $employee !== null,
                    // FLOW-EMP_LOGIN-07/08
                    'password_correct' => (bool) ($verified['valid'] ?? false),
                    // REQ-EMP_ENROLL-03: first sign-in must change the
                    // password. `$verified` is null whenever there is no
                    // account to compare against (FLOW-EMP_LOGIN-02) or no
                    // password supplied yet, so both offsets are guarded the
                    // same way as `password_correct` above - otherwise an
                    // address that simply does not exist answers 500 instead
                    // of `email_exists: false`, and the form could never
                    // print its "User not found" line from this endpoint.
                    'must_change_password' => (bool) (($verified['valid'] ?? false) && ($verified['temporary'] ?? false)),
                    'account_disabled' => (bool) ($employee
                        && ($employee->emp_suspended || $employee->emp_deleted || $employee->emp_disabled)),
                ],
            ], 200);
        }

        /**
         * FLOW-ACCESS_LOG-04: a rejected login still leaves its mark on the
         * account it was aimed at (`emp_login_failed`), exactly as the
         * customer side stamps `cust_login_failed`.
         */
        private function stampFailedEmployeeLogin(Employee $employee): void
        {
            try {
                $employee->emp_login_failed = now();
                $employee->save();
            } catch (\Throwable $e) {
                // Bookkeeping must never change the login answer.
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

            if (! $user instanceof Customer && ! $user instanceof Employee) {
                return response()->json(['success' => false, 'message' => 'Account is not supported.'], 403);
            }

            /*
                DOMAIN 15 / FLOW-EMP_SET-03 (and its DOMAIN 29 twin).

                system-new.docx SCHEMA keeps backup contacts in the single
                `*_backup_phone` / `*_backup_email` column pair - there is no
                `*_backupcallcode` column any more - so the country code the
                form still sends is folded into the stored number instead of
                being written to a column that does not exist. An empty value
                simply leaves the stored contact untouched, exactly as before.
            */
            $prefix = $user instanceof Employee ? 'emp' : 'cust';

            $updates = [];

            if (isset($fields['backupphone'])) {
                $updates[$prefix . '_backup_phone'] = $this->normalizeBackupPhone(
                    (string) $fields['backupphone'],
                    (string) ($fields['backupcallcode'] ?? '')
                );
            }

            if (isset($fields['backupemail'])) {
                $updates[$prefix . '_backup_email'] = trim((string) $fields['backupemail']);
            }

            if ($updates !== []) {
                $user->update($updates);
            }

            // REQ-EMP_SET-02 / REQ-CUST_SET-02: a settings change is logged
            // with the account id and the timestamp it happened at.
            if ($user instanceof Employee) {
                $this->logEmployee((int) $user->emp_id, 'edit',
                    'POST /api/auth/backup_credentials - backup contacts updated');
            } else {
                $this->logCustomer((int) $user->cust_id, 'edit',
                    'POST /api/auth/backup_credentials - backup contacts updated');
            }

            return response()->json([
                'success' => true,
                'message' => 'Backup credentials updated successfully',
                'data' => $user,
            ]);
        }

        /**
         * Folds a country code onto a backup phone number so the value that
         * lands in `*_backup_phone` is one international number:
         *   ("9123456789", "+63") -> "+639123456789"
         *   ("09123456789", "+63") -> "+639123456789"
         * An already international number (or one without a code) is kept as
         * the caller wrote it.
         */
        private function normalizeBackupPhone(string $phone, string $callcode): string
        {
            $phone = trim($phone);

            if ($phone === '' || $callcode === '' || str_starts_with($phone, '+')) {
                return $phone;
            }

            $digits = preg_replace('/\D+/', '', $phone) ?? '';
            $code = preg_replace('/\D+/', '', $callcode) ?? '';

            if ($digits === '' || $code === '') {
                return $phone;
            }

            if (str_starts_with($digits, '0')) {
                $digits = substr($digits, 1);
            }

            return '+' . $code . $digits;
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
            //
            // REQ-EMP_SET-01 - FLOW-EMP_SET-02 orders the form as "current
            // password, then new password twice", so the current password is
            // answered FIRST: raising the OTP challenge before the password
            // has even been compared would hide "Current password is
            // incorrect." behind a verification the caller never asked for.
            $user = $json->user();
            $passwordField = $user instanceof Customer ? 'cust_password' : 'emp_password';
            $changedField = $user instanceof Customer ? 'cust_cred_changed' : 'emp_cred_changed';

            if (! Hash::check($json->input('current_password'), $user->{$passwordField})) {
                return response()->json([
                    'success' => false,
                    'message' => 'Current password is incorrect.',
                ], 422);
            }

            $gate = $this->otpGate($json, 'password_change');
            if ($gate) {
                return $gate;
            }

            // FLOW-EMP_SET-02 - the new password is entered twice. The form
            // sends the second entry as `new_password_confirmation`; when it
            // is present it must match exactly, so a mismatched pair can
            // never reach the database.
            if ($json->has('new_password_confirmation')
                && (string) $json->input('new_password_confirmation') !== (string) $json->input('new_password')) {
                return response()->json([
                    'success' => false,
                    'message' => 'New password confirmation does not match.',
                ], 422);
            }

            // REQ-SETUP-03 - a super admin credential has to meet the store's
            // security standard: minimum length and complexity. The same bar
            // EmployeePassword::generateTemporary() already clears for the
            // temporary password issued at enrollment (REQ-EMP_ENROLL-03), so
            // every super admin password in the system is produced by one
            // shared rule. Only super admins are held to it; customers and
            // other employees keep the validator's own 8-character floor.
            $employeeCategory = $user instanceof Employee
                ? (string) ($user->emp_categ ?: $user->emp_type)
                : '';
            $isSuperAdmin = in_array(
                strtoupper(str_replace([' ', '-'], '_', trim($employeeCategory))),
                ['SUPER_ADMIN', 'SUPERADMIN'],
                true
            );

            if ($isSuperAdmin && ! EmployeePassword::meetsStandard((string) $json->input('new_password'))) {
                return response()->json([
                    'success' => false,
                    'message' => 'Super admin passwords must be at least 16 characters and include an uppercase letter, a lowercase letter, a number and a symbol.',
                    'code' => 'WEAK_PASSWORD',
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
                /*
                    REQ-EMP_PROF-01 - "Employee email addresses must not be
                    editable by regular staff members."

                    This endpoint only ever rewrites the account that owns the
                    bearer token, so the category of that account is the whole
                    test: a staff member may change phone, pronoun and password
                    here, but never the login identity itself. An admin or
                    super admin keeps the right (rules 36-37 reserve the
                    category itself for super admins).
                */
                if ($json->has('email')) {
                    $requested = mb_strtolower(trim((string) $json->input('email')));
                    $current = mb_strtolower(trim((string) $user->emp_email));

                    if ($requested !== '' && $requested !== $current) {
                        if (! $user instanceof Employee || ! $user->isAdmin()) {
                            return response()->json([
                                'success' => false,
                                'message' => 'Regular staff members may not change an email address.',
                                'code' => 'EMAIL_LOCKED',
                            ], 403);
                        }

                        // Rule 27: a Bicol University email belongs to only
                        // one employee (and never to a customer either).
                        $taken = Employee::where('emp_email', $requested)
                            ->where('emp_id', '!=', $user->emp_id)
                            ->exists()
                            || Customer::where('cust_email', $requested)->exists();
                        if ($taken) {
                            return response()->json([
                                'success' => false,
                                'message' => 'Email already exists',
                            ], 409);
                        }

                        $update['emp_email'] = $requested;
                    }
                }
            }
            // The credential-changed stamp only exists where the schema has
            // the column; writing it blindly would be dropped by mass
            // assignment (or fail outright on a schema without it).
            if (\Schema::hasColumn($user->getTable(), $changedField)) {
                $update[$changedField] = now();
            }
            $user->update($update);

            if ($user instanceof Employee) {
                /*
                    FLOW-EMP_LOGOUT-06 / REQ-EMP_LOGOUT-03 - a password change
                    ends every session of the account at once: employee tokens
                    carry the `emp_login_active` nonce, so clearing it revokes
                    the token that carried this request and every other device
                    too (ApiToken::parse refuses a token whose nonce no longer
                    matches the column).
                */
                $user->emp_login_active = null;
                $user->save();
            } else {
                $user->tokens()->delete();
            }

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