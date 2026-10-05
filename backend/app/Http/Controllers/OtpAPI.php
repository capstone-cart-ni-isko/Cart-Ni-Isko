<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use Illuminate\Http\Request;

/**
 * DOMAIN 29 - CUSTOMER SETTINGS / REQ-CUST_SET-02.
 *
 * Every sensitive customer change (the password in FLOW-CUST_SET-03 and the
 * backup contacts in FLOW-CUST_SET-06) must clear a phone OTP first.
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
