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
                    $token = $employee->createToken('auth_token')->plainTextToken;
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

            return response()->json([
                'success' => true,
                'message' => 'If the account exists, recovery instructions will be sent to its registered contact.',
            ]);
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

        [$ok, $message] = $this->verifyOtpCode($user, $purpose, (string) $json->input('code'));

        $this->logCustomer((int) $user->cust_id, 'authentication',
            'POST /api/otp/challenge/verify - ' . $purpose . ($ok ? ' verified' : ' failed'));

        if (! $ok) {
            return response()->json(['success' => false, 'message' => $message], 422);
        }

        if ($purpose === 'signup') {
            Cache::forget($this->signupPendingKey((int) $user->cust_id));
        }

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
                'phone'         => $this->maskPhone($user->cust_phone),
                'code'          => $code,
                'notifications' => $notifications->values(),
                'expires_in'    => self::otpTtlMinutes * 60,
            ],
        ], 200);
    }

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
