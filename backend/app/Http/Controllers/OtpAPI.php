<?php

namespace App\Http\Controllers;

use App\Models\CustNotif;
use App\Models\Customer;
use App\Support\ApiToken;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

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
class OtpAPI extends Controller
{
    /*
        Requesting a code
        ----------
        JSON REQUEST

        purpose - string (req: password_change | backup_contacts)
    */
    public function issue(Request $json)
    {
        $validator = (new InputValidatorAPI())->issueOtp($json);
        if ($validator) return $validator;

        $user = $json->user('api');

        if (! $user instanceof Customer) {
            return response()->json([
                'success' => false,
                'message' => 'Phone OTP verification is only available to customer accounts.',
            ], 403);
        }

        if ($user->cust_deleted || $user->cust_suspended) {
            return response()->json([
                'success' => false,
                'message' => 'This account is not active.',
            ], 403);
        }

        [$code, $error] = $this->issueOtpCode($user, (string) $json->input('purpose'));

        if ($code === null) {
            return response()->json(['success' => false, 'message' => $error], 429);
        }

        $phone = $this->maskPhone($user->cust_phone);

        return response()->json([
            'success' => true,
            'message' => 'Verification code sent to your notification inbox.',
            'data'    => [
                'purpose'    => $json->input('purpose'),
                'phone'      => $phone,
                'delivery'   => 'in_app_notification',
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
        $validator = (new InputValidatorAPI())->verifyOtp($json);
        if ($validator) return $validator;

        $user = $json->user('api');

        if (! $user instanceof Customer) {
            return response()->json([
                'success' => false,
                'message' => 'Phone OTP verification is only available to customer accounts.',
            ], 403);
        }

        [$ok, $message] = $this->verifyOtpCode(
            $user,
            (string) $json->input('purpose'),
            (string) $json->input('code')
        );

        // DOMAIN 32 - an authentication attempt is always written down.
        $this->logCustomer((int) $user->cust_id, 'authentication',
            'POST /api/otp/verify - ' . $json->input('purpose') . ($ok ? ' verified' : ' failed'));

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
        $validator = (new InputValidatorAPI())->otpChallengeStart($json);
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
        $validator = (new InputValidatorAPI())->otpChallengeVerify($json);
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
        $validator = (new InputValidatorAPI())->otpChallengeStart($json);
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
    private function maskPhone(?string $phone): string
    {
        $phone = trim((string) $phone);
        $length = strlen($phone);

        if ($length < 7) {
            return $phone;
        }

        return substr($phone, 0, 4) . str_repeat('*', $length - 7) . substr($phone, -3);
    }
}
