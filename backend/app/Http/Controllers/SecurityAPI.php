<?php

namespace App\Http\Controllers;

use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\EmpLog;
use App\Models\Employee;
use App\Models\Schedule;
use App\Support\ApiToken;
use App\Support\EmployeePassword;
use App\Support\SystemSettings;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * SecurityAPI
 *
 * DOMAIN 2 / 17 / 18 - customer and employee login/logout plus OTP processing (system rules 36-40 enforced through role checks).
 *
 * Repackaged from: Auth API, Otp API.
 */
class SecurityAPI extends Controller
{

    // ===== from the Auth API file =====

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
            $validator = (new DatabaseAPI())->customerLogin($json);
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
            $validator = (new DatabaseAPI())->employeeLogin($json);
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
            try {
                return $this->performEmployeeLoginCheck($json);
            } catch (\Throwable $e) {
                report($e);

                return $this->fail('Could not check the login details. Please try again.', 500);
            }
        }

        private function performEmployeeLoginCheck(Request $json)
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
            try {
                return $this->performLogout($json);
            } catch (\Throwable $e) {
                report($e);

                return $this->fail('Logout failed. Please try again.', 500);
            }
        }

        private function performLogout(Request $json)
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

        public function recoverCredentials(Request $json)
        {
            try {
                return $this->performRecoverCredentials($json);
            } catch (\Throwable $e) {
                report($e);

                return $this->fail('Recovery request failed. Please try again.', 500);
            }
        }

        private function performRecoverCredentials(Request $json)
        {
            $validator = (new DatabaseAPI())->recoverCredentials($json);
            if ($validator) {
                return $validator;
            }

            return response()->json([
                'success' => true,
                'message' => 'If the account exists, recovery instructions will be sent to its registered contact.',
            ]);
        }

    // ===== from the Otp API file =====
/**
 * DOMAIN 29 - CUSTOMER SETTINGS / REQ-CUST_SET-02.
 *
 * Every sensitive customer change (the password in FLOW-CUST_SET-03 and the
 * backup contacts in FLOW-CUST_SET-06) must clear a phone OTP first.
 *
 * DOMAIN 17 / DOMAIN 18 - the same six-digit code gates a signup
 * (FLOW-CUST_SIGNUP-05) and a login taken more than fifteen days after the
 * last logout (FLOW-CUST_LOGIN-02). Those two run *before* a session exists,
 * so they travel on the signed, purpose-scoped challenge minted by
 * `ApiToken::challenge()` instead of a bearer token.
 *
 * The code itself never leaves the server: it is hashed into the file cache
 * and delivered through the account's own notification inbox, so no table or
 * column had to be added to the schema.
 */

    // ===== from the Otp API file =====

    /*
        Requesting a code
        ----------
        JSON REQUEST

        purpose - string (req: password_change | backup_contacts)
    */
    public function issue(Request $json)
    {
        try {
            return $this->performIssue($json);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not send a verification code. Please try again.', 500);
        }
    }

    private function performIssue(Request $json)
    {
        $validator = (new DatabaseAPI())->issueOtp($json);
        if ($validator) return $validator;

        $user = $json->user('api');

        // Customers verify on the phone channel; employees - the admin side -
        // verify on their Bicol University mailbox.
        if (! $user instanceof Customer && ! $user instanceof Employee) {
            return response()->json([
                'success' => false,
                'message' => 'Phone OTP verification is only available to customer and employee accounts.',
            ], 403);
        }

        if ($user instanceof Employee) {
            if ($user->emp_deleted || $user->emp_suspended || $user->emp_disabled) {
                return response()->json([
                    'success' => false,
                    'message' => 'This account is not active.',
                ], 403);
            }
        } elseif ($user->cust_deleted || $user->cust_suspended) {
            return response()->json([
                'success' => false,
                'message' => 'This account is not active.',
            ], 403);
        }

        [$code, $error] = $this->issueOtpCode($user, (string) $json->input('purpose'));

        if ($code === null) {
            return response()->json(['success' => false, 'message' => $error], 429);
        }

        $isEmployee = $user instanceof Employee;
        $address = $isEmployee
            ? $this->maskEmail((string) $user->emp_email)
            : $this->maskPhone($user->cust_phone);

        return response()->json([
            'success' => true,
            'message' => $isEmployee
                ? 'Verification code sent to your Bicol University email.'
                : 'Verification code sent to your notification inbox.',
            'data'    => [
                'purpose'    => $json->input('purpose'),
                'channel'    => $isEmployee ? 'email' : 'phone',
                'phone'      => $address,
                'email'      => $isEmployee ? $address : null,
                'delivery'   => $isEmployee ? 'email' : 'in_app_notification',
                'expires_in' => self::OTP_TTL_MINUTES * 60,
            ],
        ], 200);
    }

    /*
        Verifying a code
        ----------
        JSON REQUEST

        purpose - string (req: password_change | backup_contacts)
        code    - string (req: 6 digits)
    */
    public function verify(Request $json)
    {
        try {
            return $this->performVerify($json);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not verify the code. Please try again.', 500);
        }
    }

    private function performVerify(Request $json)
    {
        $validator = (new DatabaseAPI())->verifyOtp($json);
        if ($validator) return $validator;

        $user = $json->user('api');

        if (! $user instanceof Customer && ! $user instanceof Employee) {
            return response()->json([
                'success' => false,
                'message' => 'Phone OTP verification is only available to customer and employee accounts.',
            ], 403);
        }

        [$ok, $message] = $this->verifyOtpCode(
            $user,
            (string) $json->input('purpose'),
            (string) $json->input('code')
        );

        // DOMAIN 32 - an authentication attempt is always written down.
        $attempt = 'POST /api/otp/verify - ' . $json->input('purpose') . ($ok ? ' verified' : ' failed');
        if ($user instanceof Employee) {
            $this->logEmployee((int) $user->emp_id, 'authentication', $attempt);
        } else {
            $this->logCustomer((int) $user->cust_id, 'authentication', $attempt);
        }

        if (! $ok) {
            return response()->json(['success' => false, 'message' => $message], 422);
        }

        return response()->json([
            'success' => true,
            'message' => $message,
            'data'    => [
                'purpose'    => $json->input('purpose'),
                'expires_in' => self::OTP_VERIFIED_TTL_MINUTES * 60,
            ],
        ], 200);
    }

    /*
        DOMAIN 17 / DOMAIN 18 - the pre-session phone OTP challenge
        ----------
        A signup (FLOW-CUST_SIGNUP-05) and a stale login (FLOW-CUST_LOGIN-02)
        are both answered with a signed `challenge` instead of a token: the
        caller owns no session yet, so that blob is what proves which account
        the six-digit code belongs to.

        JSON REQUEST

        purpose   - string (req: signup | login)
        challenge - string (req)
    */
    public function startChallenge(Request $json)
    {
        try {
            return $this->performStartChallenge($json);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not start verification. Please try again.', 500);
        }
    }

    private function performStartChallenge(Request $json)
    {
        $validator = (new DatabaseAPI())->otpChallengeStart($json);
        if ($validator) return $validator;

        $challenge = $this->challengeAccount($json);
        if ($challenge instanceof \Illuminate\Http\JsonResponse) return $challenge;

        $purpose = (string) $json->input('purpose');
        [$code, $error] = $this->issueOtpCode($challenge['user'], $purpose);

        if ($code === null) {
            return response()->json(['success' => false, 'message' => $error], 429);
        }

        $this->logCustomer((int) $challenge['user']->cust_id, 'authentication',
            'POST /api/otp/challenge/start - ' . $purpose . ' code issued');

        return response()->json([
            'success' => true,
            'message' => 'Verification code sent to your notification inbox.',
            'data'    => [
                'purpose'    => $purpose,
                'phone'      => $this->maskPhone($challenge['user']->cust_phone),
                'delivery'   => 'in_app_notification',
                'expires_in' => self::OTP_TTL_MINUTES * 60,
            ],
        ], 200);
    }

    /*
        Redeeming the challenge
        ----------
        JSON REQUEST

        purpose   - string (req: signup | login)
        challenge - string (req)
        code      - string (req: 6 digits)
    */
    public function verifyChallenge(Request $json)
    {
        try {
            return $this->performVerifyChallenge($json);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not verify the code. Please try again.', 500);
        }
    }

    private function performVerifyChallenge(Request $json)
    {
        $validator = (new DatabaseAPI())->otpChallengeVerify($json);
        if ($validator) return $validator;

        $challenge = $this->challengeAccount($json);
        if ($challenge instanceof \Illuminate\Http\JsonResponse) return $challenge;

        $purpose = (string) $json->input('purpose');
        $user = $challenge['user'];

        [$ok, $message] = $this->verifyOtpCode($user, $purpose, (string) $json->input('code'));

        // DOMAIN 32 - a verification attempt is always written down.
        $this->logCustomer((int) $user->cust_id, 'authentication',
            'POST /api/otp/challenge/verify - ' . $purpose . ($ok ? ' verified' : ' failed'));

        if (! $ok) {
            return response()->json(['success' => false, 'message' => $message], 422);
        }

        if ($purpose === 'signup') {
            // FLOW-CUST_SIGNUP-05: the account is final now - the flag that
            // kept the next login inside this challenge is dropped.
            Cache::forget($this->signupPendingKey((int) $user->cust_id));
        }

        // Issuing the token rotates the session nonce: this is the moment the
        // account is opened (and, for a signup, finalized).
        $token = ApiToken::issue($user);

        $this->logCustomer((int) $user->cust_id, 'authentication',
            'POST /api/otp/challenge/verify - ' . $purpose . ' cleared, session opened');

        return response()->json([
            'success' => true,
            'message' => $purpose === 'signup'
                ? 'Phone number verified. Your account is ready.'
                : 'Code verified.',
            'data'    => array_merge($user->toArray(), [
                'token'   => $token,
                'purpose' => $purpose,
            ]),
        ], 200);
    }

    /*
        Reading the code that was just delivered in-app
        ----------
        REQ-CUST_SIGNUP-04 allows in-app delivery, and the verify screen is
        shown before any session exists - so the account inbox is read through
        the challenge here, exactly like the logged-in notifications screen
        reads it through /notif/display.

        JSON REQUEST (or the same three keys as a query string)

        purpose   - string (req: signup | login)
        challenge - string (req)
    */
    public function challengeInbox(Request $json)
    {
        try {
            return $this->performChallengeInbox($json);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not read the notification inbox. Please try again.', 500);
        }
    }

    private function performChallengeInbox(Request $json)
    {
        $validator = (new DatabaseAPI())->otpChallengeStart($json);
        if ($validator) return $validator;

        $challenge = $this->challengeAccount($json);
        if ($challenge instanceof \Illuminate\Http\JsonResponse) return $challenge;

        $user = $challenge['user'];

        // Codes live five minutes; only the inbox tail of the last quarter of
        // an hour is handed back, so nothing historical leaks through here.
        $notifications = CustNotif::where('cust_id', (int) $user->cust_id)
            ->where('custnotif_created', '>=', now()->subMinutes(15))
            ->orderByDesc('custnotif_created')
            ->get();

        foreach ($notifications as $notification) {
            // FLOW-NOTIF-05: reading a notification stamps custnotif_read.
            if (! $notification->custnotif_read) {
                $notification->update(['custnotif_read' => now()]);
            }
        }

        // DOMAIN 32 - FLOW-ACCESS_LOG-02: reading is a "view" action.
        $this->logCustomer((int) $user->cust_id, 'view', 'POST /api/otp/challenge/inbox');

        $code = $notifications
            ->map(static fn ($row) => preg_match('/\b(\d{6})\b/', (string) $row->custnotif_msg, $m) ? $m[1] : null)
            ->filter()
            ->first();

        return response()->json([
            'success' => true,
            'message' => 'Notification inbox retrieved successfully.',
            'data'    => [
                'purpose'       => (string) $json->input('purpose'),
                'phone'         => $this->maskPhone($user->cust_phone),
                'code'          => $code,
                'notifications' => $notifications->values(),
                'expires_in'    => self::OTP_TTL_MINUTES * 60,
            ],
        ], 200);
    }

    /**
     * Resolves the account a pre-session challenge belongs to, or the 410
     * answer every expired / tampered / mismatched challenge gets.
     *
     * @return array{user: Customer, purpose: string}|\Illuminate\Http\JsonResponse
     */
    private function challengeAccount(Request $json)
    {
        $purpose = (string) $json->input('purpose');
        $parsed = ApiToken::parseChallenge((string) $json->input('challenge'));

        if (! $parsed || $parsed['purpose'] !== $purpose) {
            return response()->json([
                'success' => false,
                'code'    => 'CHALLENGE_EXPIRED',
                'message' => 'The verification session expired. Please start again.',
            ], 410);
        }

        return $parsed;
    }

    /** 09171234567 -> 0917****567 (never echo a full number back). */
    private function otpMaskPhone(?string $phone): string
    {
        $phone = trim((string) $phone);
        $length = strlen($phone);

        if ($length < 7) {
            return $phone;
        }

        return substr($phone, 0, 4) . str_repeat('*', $length - 7) . substr($phone, -3);
    }

    /** juandelacruz@bicol-u.edu.ph -> j***z@bicol-u.edu.ph. */
    private function maskEmail(string $email): string
    {
        $email = trim($email);
        $at = strrpos($email, '@');

        if ($at === false || $at < 1) {
            return $email;
        }

        $local = substr($email, 0, $at);
        $domain = substr($email, $at);

        if (strlen($local) <= 2) {
            return substr($local, 0, 1) . '***' . $domain;
        }

        return substr($local, 0, 1) . str_repeat('*', strlen($local) - 2)
            . substr($local, -1) . $domain;
    }
}
