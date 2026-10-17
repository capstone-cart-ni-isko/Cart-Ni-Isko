<?php

namespace App\Http\Controllers;

use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\EmpLog;
use App\Models\EmpNotif;
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

class SecurityAPI extends Controller
{

        private static ?bool $loginRpcReady = null;

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

            $validator = (new DatabaseAPI())->customerLogin($json);
            if ($validator) return $validator;

            $identifier = (string) ($json->input('email') ?: $json->input('phone'));
            $password   = (string) $json->input('password');

            try {
                $customer = $this->findCustomerByIdentifier($identifier, $password);

                if (! $customer) {
                    $this->stampFailedLogin($identifier);

                    return response()->json(['success' => false, 'message' => 'Invalid credentials'], 401);
                }

                if ($customer->cust_deleted || $customer->cust_suspended || $customer->cust_disabled) {
                    return response()->json(['success' => false, 'message' => 'Account disabled'], 403);
                }

                $pendingSignup = Cache::get($this->signupPendingKey((int) $customer->cust_id));

                $anchor = $customer->cust_last_logout ?: $customer->cust_created;
                $staleLogin = $anchor !== null && Carbon::parse($anchor)->addDays(15)->isPast();

                if ($pendingSignup || $staleLogin) {
                    $purpose = $pendingSignup ? 'signup' : 'login';
                    [$code] = $this->issueOtpCode($customer, $purpose);

                    $this->logCustomer((int) $customer->cust_id, 'authentication',
                        'POST /api/auth/cust_login - phone OTP required (' . $purpose . ')');

                    return response()->json([
                        'success' => true,
                        'message' => 'Verification code sent to your notification inbox.',
                        'data' => [
                            'requires_otp' => true,
                            'purpose'      => $purpose,
                            'challenge'    => ApiToken::challenge($customer, $purpose),
                            'phone'        => $this->maskPhone($customer->cust_phone),
                            'delivery'     => 'in_app_notification',
                            'expires_in'   => self::otpTtlMinutes * 60,
                            'cust_id'      => (int) $customer->cust_id,
                        ],
                    ], 200);
                }

                return $this->openCustomerSession($customer, 'POST /api/auth/cust_login', 'Login successful');

            } catch (\Exception $e) {
                $msg = str_contains($e->getMessage(), 'Bcrypt') ? 'Invalid credentials' : 'Login failed';
                return response()->json([
                    'success' => false,
                    'message' => $msg,
                    'error' => $e->getMessage()
                ], 400);
            }
        }

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
            }
        }

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

            $validator = (new DatabaseAPI())->employeeLogin($json);
            if ($validator) return $validator;

            $email = trim((string) $json->input('email'));
            $password = (string) $json->input('password');

            try {
                $employee = Employee::where('emp_email', $email)->first();

                if (! $employee) {
                    return response()->json([
                        'success' => false,
                        'message' => 'User not found',
                        'code' => 'EMP_NOT_FOUND',
                    ], 401);
                }

                $check = EmployeePassword::verify($password, (string) $employee->emp_password);

                if (! $check['valid']) {
                    $this->stampFailedEmployeeLogin($employee);
                    $this->logEmployee((int) $employee->emp_id, 'auth',
                        'POST /api/auth/emp_login - failed');

                    return response()->json([
                        'success' => false,
                        'message' => 'Wrong password',
                        'code' => 'WRONG_PASSWORD',
                    ], 401);
                }

                if ($check['temporary'] && $employee->emp_created
                    && $employee->emp_created->copy()->addHours(24)->isPast()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'The temporary password has expired. Contact a super admin.',
                        'code' => 'TEMP_PASSWORD_EXPIRED',
                    ], 403);
                }

                if ($employee->emp_suspended || $employee->emp_deleted || $employee->emp_disabled) {
                    return response()->json(['success' => false, 'message' => 'Account disabled'], 403);
                }

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

                try {
                    $token = \App\Support\ApiToken::issue($employee);
                } catch (\Throwable $e) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Login failed',
                        'error' => $e->getMessage(),
                    ], 500);
                }

                if ($employee->emp_login_failed !== null && \Schema::hasColumn('employee', 'emp_login_failed')) {
                    try {
                        $employee->emp_login_failed = null;
                        $employee->save();
                    } catch (\Throwable $e) {
                    }
                }

                $this->logEmployee((int) $employee->emp_id, 'auth', 'POST /api/auth/emp_login');

                return response()->json([
                    'success' => true,
                    'message' => 'Login successful',
                    'data' => array_merge($employee->toArray(), [
                        'token' => $token,
                        'must_change_password' => $check['temporary'],
                    ])
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Login failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

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

            $verified = $employee && $password !== ''
                ? EmployeePassword::verify($password, (string) $employee->emp_password)
                : null;

            return response()->json([
                'success' => true,
                'data' => [
                    'email_exists' => $employee !== null,
                    'password_correct' => (bool) ($verified['valid'] ?? false),
                    'must_change_password' => (bool) (($verified['valid'] ?? false) && ($verified['temporary'] ?? false)),
                    'account_disabled' => (bool) ($employee
                        && ($employee->emp_suspended || $employee->emp_deleted || $employee->emp_disabled)),
                ],
            ], 200);
        }

        private function stampFailedEmployeeLogin(Employee $employee): void
        {
            try {
                $employee->emp_login_failed = now();
                $employee->save();
            } catch (\Throwable $e) {
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

            $accountType = (string) $json->input('account_type');
            $rawIdentifier = trim((string) $json->input('identifier'));
            $user = null;

            if ($accountType === 'employee') {
                $user = Employee::where('emp_email', strtolower($rawIdentifier))->first();
                if ($user && ($user->emp_deleted !== null || $user->emp_suspended !== null || (isset($user->emp_disabled) && $user->emp_disabled !== null))) {
                    $user = null;
                }
            } else {
                if (str_contains($rawIdentifier, '@')) {
                    $user = Customer::where('cust_email', strtolower($rawIdentifier))->first();
                } else {
                    $phone = preg_replace('/[^0-9]/', '', $rawIdentifier) ?: $rawIdentifier;
                    if (strlen($phone) >= 12 && str_starts_with($phone, '63')) {
                        $phone = '0' . substr($phone, 2);
                    }
                    $user = Customer::where('cust_phone', $phone)->first();
                }

                if ($user && ($user->cust_deleted !== null || $user->cust_suspended !== null || (isset($user->cust_disabled) && $user->cust_disabled !== null))) {
                    $user = null;
                }
            }

            if (! $user) {
                return response()->json([
                    'success' => false,
                    'message' => 'No active account found with the provided details.',
                ], 404);
            }

            [$code, $error] = $this->issueOtpCode($user, 'recovery');
            if ($code === null) {
                return response()->json([
                    'success' => false,
                    'message' => $error ?: 'Please wait before requesting another code.',
                ], 429);
            }

            $isEmployee = $user instanceof Employee;
            $challenge = ApiToken::challenge($user, 'recovery');
            $maskedContact = $isEmployee
                ? $this->maskEmail((string) $user->emp_email)
                : $this->maskPhone((string) $user->cust_phone);

            if ($isEmployee) {
                $this->logEmployee((int) $user->emp_id, 'authentication',
                    'POST /api/auth/recover_credentials - employee recovery challenge issued');
            } else {
                $this->logCustomer((int) $user->cust_id, 'authentication',
                    'POST /api/auth/recover_credentials - customer recovery challenge issued');
            }

            return response()->json([
                'success' => true,
                'message' => 'Verification code sent to ' . $maskedContact . '.',
                'data' => [
                    'challenge'    => $challenge,
                    'purpose'      => 'recovery',
                    'account_type' => $accountType,
                    // The code itself is never echoed here - exactly like the
                    // signup and stale-login challenges, it is delivered only
                    // through the account's own inbox (or university email for
                    // employees) and read back with the signed challenge.
                    'channel'      => $isEmployee ? 'email' : 'phone',
                    'contact'      => $maskedContact,
                    'delivery'     => $isEmployee ? 'email' : 'in_app_notification',
                    'expires_in'   => self::otpTtlMinutes * 60,
                ],
            ], 200);
        }

        public function resetCredentials(Request $json)
        {
            try {
                return $this->performResetCredentials($json);
            } catch (\Throwable $e) {
                report($e);

                return $this->fail('Password reset failed. Please try again.', 500);
            }
        }

        private function performResetCredentials(Request $json)
        {
            $validator = (new DatabaseAPI())->resetCredentials($json);
            if ($validator) {
                return $validator;
            }

            $challenge = $this->challengeAccount($json, 'recovery');
            if ($challenge instanceof \Illuminate\Http\JsonResponse) {
                return $challenge;
            }

            $user = $challenge['user'];
            $isEmployee = $user instanceof Employee;

            $scope = $this->otpScope($user);
            $userId = $this->otpSubjectId($user);
            if (! Cache::get($this->otpVerifiedKey($userId, 'recovery', $scope))) {
                return response()->json([
                    'success' => false,
                    'message' => 'Verification code must be verified before resetting password.',
                    'code'    => 'OTP_REQUIRED',
                ], 428);
            }

            $newPassword = (string) $json->input('new_password');

            $employeeCategory = $isEmployee
                ? (string) ($user->emp_categ ?: $user->emp_type)
                : '';
            $isSuperAdmin = in_array(
                strtoupper(str_replace([' ', '-'], '_', trim($employeeCategory))),
                ['SUPER_ADMIN', 'SUPERADMIN'],
                true
            );

            if ($isSuperAdmin && ! EmployeePassword::meetsStandard($newPassword)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Super admin passwords must be at least 16 characters and include an uppercase letter, a lowercase letter, a number and a symbol.',
                    'code' => 'WEAK_PASSWORD',
                ], 422);
            }

            if ($isEmployee) {
                $user->emp_password = EmployeePassword::make($newPassword);
                $user->emp_login_active = null;
                if (\Schema::hasColumn('employee', 'emp_cred_changed')) {
                    $user->emp_cred_changed = now();
                }
                $user->save();
                $this->logEmployee((int) $user->emp_id, 'edit',
                    'POST /api/auth/reset_credentials - password recovered and reset');
            } else {
                $user->cust_password = Hash::make($newPassword);
                // Revoke every Sanctum-style token of the account when the
                // table is present; the stateless ApiToken sessions are
                // revoked through the nonce below either way.
                if (\Schema::hasTable('personal_access_tokens')) {
                    $user->tokens()->delete();
                }
                $user->cust_login_active = null;
                if (\Schema::hasColumn('customer', 'cust_cred_changed')) {
                    $user->cust_cred_changed = now();
                }
                $user->save();
                $this->logCustomer((int) $user->cust_id, 'edit',
                    'POST /api/auth/reset_credentials - password recovered and reset');
            }

            Cache::forget($this->otpVerifiedKey($userId, 'recovery', $scope));

            return response()->json([
                'success' => true,
                'message' => 'Password reset successfully. Please sign in with your new password.',
            ], 200);
        }

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
                'expires_in' => self::otpTtlMinutes * 60,
            ],
        ], 200);
    }

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
                'expires_in' => self::otpVerifiedTtlMinutes * 60,
            ],
        ], 200);
    }

    // AUTO-FILL: loads the code that was just sent, so the user need not type it.
    public function autoFillOtp(Request $json)
    {
        try {
            return $this->performAutoFillOtp($json);
        } catch (\Throwable $e) {
            report($e);

            return $this->fail('Could not load the verification code. Please try again.', 500);
        }
    }

    private function performAutoFillOtp(Request $json)
    {
        $user = $json->user('api');

        if (! $user instanceof Customer && ! $user instanceof Employee) {
            return response()->json([
                'success' => false,
                'message' => 'Phone OTP verification is only available to customer and employee accounts.',
            ], 403);
        }

        $code = $this->currentOtpCode($user);

        if ($user instanceof Employee) {
            $this->logEmployee((int) $user->emp_id, 'view', 'POST /api/otp/auto_fill');
        } else {
            $this->logCustomer((int) $user->cust_id, 'view', 'POST /api/otp/auto_fill');
        }

        return response()->json([
            'success' => true,
            'message' => $code === null
                ? 'No verification code is waiting to be filled.'
                : 'The verification code has been loaded.',
            'data'    => [
                'code'        => $code,
                'expires_in'  => self::otpTtlMinutes * 60,
            ],
        ], 200);
    }

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
        $user = $challenge['user'];
        [$code, $error] = $this->issueOtpCode($user, $purpose);

        if ($code === null) {
            return response()->json(['success' => false, 'message' => $error], 429);
        }

        $isEmployee = $user instanceof Employee;
        if ($isEmployee) {
            $this->logEmployee((int) $user->emp_id, 'authentication',
                'POST /api/otp/challenge/start - ' . $purpose . ' code issued');
        } else {
            $this->logCustomer((int) $user->cust_id, 'authentication',
                'POST /api/otp/challenge/start - ' . $purpose . ' code issued');
        }

        $contact = $isEmployee
            ? $this->maskEmail((string) $user->emp_email)
            : $this->maskPhone((string) $user->cust_phone);

        return response()->json([
            'success' => true,
            'message' => $isEmployee
                ? 'Verification code sent to your Bicol University email.'
                : 'Verification code sent to your notification inbox.',
            'data'    => [
                'purpose'    => $purpose,
                'channel'    => $isEmployee ? 'email' : 'phone',
                'contact'    => $contact,
                'phone'      => $contact,
                'delivery'   => $isEmployee ? 'email' : 'in_app_notification',
                'expires_in' => self::otpTtlMinutes * 60,
            ],
        ], 200);
    }

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
        $isEmployee = $user instanceof Employee;

        [$ok, $message] = $this->verifyOtpCode($user, $purpose, (string) $json->input('code'));

        if ($isEmployee) {
            $this->logEmployee((int) $user->emp_id, 'authentication',
                'POST /api/otp/challenge/verify - ' . $purpose . ($ok ? ' verified' : ' failed'));
        } else {
            $this->logCustomer((int) $user->cust_id, 'authentication',
                'POST /api/otp/challenge/verify - ' . $purpose . ($ok ? ' verified' : ' failed'));
        }

        if (! $ok) {
            return response()->json(['success' => false, 'message' => $message], 422);
        }

        if ($purpose === 'signup' && ! $isEmployee) {
            Cache::forget($this->signupPendingKey((int) $user->cust_id));
        }

        // DOMAIN 17 / DOMAIN 18: only a signup and a stale login redeem the
        // challenge for a session. A recovery challenge proves control of the
        // registered contact for the password reset - it must not sign the
        // account in, rotate its session nonce or expose its record before
        // the new password has been set (least privilege).
        if ($purpose === 'recovery') {
            return response()->json([
                'success' => true,
                'message' => 'Code verified. Set your new password.',
                'data'    => [
                    'purpose'  => $purpose,
                    'verified' => true,
                ],
            ], 200);
        }

        $token = ApiToken::issue($user);

        if ($isEmployee) {
            $this->logEmployee((int) $user->emp_id, 'authentication',
                'POST /api/otp/challenge/verify - ' . $purpose . ' cleared, session opened');
        } else {
            $this->logCustomer((int) $user->cust_id, 'authentication',
                'POST /api/otp/challenge/verify - ' . $purpose . ' cleared, session opened');
        }

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
        $isEmployee = $user instanceof Employee;

        if ($isEmployee) {
            $notifications = EmpNotif::where('emp_id', (int) $user->emp_id)
                ->where('empnotif_created', '>=', now()->subMinutes(15))
                ->orderByDesc('empnotif_created')
                ->get();

            foreach ($notifications as $notification) {
                if (! $notification->empnotif_read) {
                    $notification->update(['empnotif_read' => now()]);
                }
            }

            $this->logEmployee((int) $user->emp_id, 'view', 'POST /api/otp/challenge/inbox');

            $code = $notifications
                ->map(static fn ($row) => preg_match('/\b(\d{6})\b/', (string) $row->empnotif_msg, $m) ? $m[1] : null)
                ->filter()
                ->first();

            return response()->json([
                'success' => true,
                'message' => 'Notification inbox retrieved successfully.',
                'data'    => [
                    'purpose'       => (string) $json->input('purpose'),
                    'channel'       => 'email',
                    'contact'       => $this->maskEmail((string) $user->emp_email),
                    'phone'         => $this->maskEmail((string) $user->emp_email),
                    'code'          => $code,
                    'notifications' => $notifications->values(),
                    'expires_in'    => self::otpTtlMinutes * 60,
                ],
            ], 200);
        }

        $notifications = CustNotif::where('cust_id', (int) $user->cust_id)
            ->where('custnotif_created', '>=', now()->subMinutes(15))
            ->orderByDesc('custnotif_created')
            ->get();

        foreach ($notifications as $notification) {
            if (! $notification->custnotif_read) {
                $notification->update(['custnotif_read' => now()]);
            }
        }

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
                'channel'       => 'phone',
                'contact'       => $this->maskPhone((string) $user->cust_phone),
                'phone'         => $this->maskPhone((string) $user->cust_phone),
                'code'          => $code,
                'notifications' => $notifications->values(),
                'expires_in'    => self::otpTtlMinutes * 60,
            ],
        ], 200);
    }

    private function challengeAccount(Request $json, ?string $explicitPurpose = null)
    {
        $purpose = $explicitPurpose ?: (string) $json->input('purpose');
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

    private function otpMaskPhone(?string $phone): string
    {
        $phone = trim((string) $phone);
        $length = strlen($phone);

        if ($length < 7) {
            return $phone;
        }

        return substr($phone, 0, 4) . str_repeat('*', $length - 7) . substr($phone, -3);
    }

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
