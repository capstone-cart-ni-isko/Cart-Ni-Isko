<?php

namespace App\Support;

use App\Models\Customer;
use App\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Stateless bearer tokens.
 *
 * The live database has no `personal_access_tokens` table (system-new.docx
 * SCHEMA does not list one), so Sanctum's stored tokens are unusable. Tokens
 * are therefore self-describing: the payload is signed with HMAC-SHA256 over
 * APP_KEY and carries the account id, the session nonce held in
 * `*_login_active` and the issued-at stamp. Nothing has to be written anywhere
 * to authenticate, and the two columns above are enough to revoke every
 * session of an account at once (logout / a newer login).
 */
class ApiToken
{
    /** Wire format version prefix. */
    public const PREFIX = 'cni1';

    /** REQ-CUST_LOGOUT-02: a customer session ends 7 days after it was issued. */
    public const CUSTOMER_TTL = 7 * 24 * 60 * 60;

    /** REQ-EMP_LOGOUT-03: an employee session ends after 30 minutes idle. */
    public const EMPLOYEE_TTL = 30 * 60;

    /** After this age the token is transparently re-issued (sliding activity). */
    public const RENEW_AFTER = 60;

    /** Response header carrying the slid token. */
    public const RENEW_HEADER = 'X-Renewed-Token';

    private static function key(): string
    {
        return (string) config('app.key');
    }

    private static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private static function unb64(string $raw): string
    {
        return (string) base64_decode(strtr($raw, '-_', '+/'), true);
    }

    /** The column that stores the per-login nonce for an account. */
    private static function nonceColumn(object $user): string
    {
        return $user instanceof Employee ? 'emp_login_active' : 'cust_login_active';
    }

    /** The column holding the most recent logout stamp for an account. */
    private static function logoutColumn(object $user): string
    {
        return $user instanceof Employee ? 'emp_last_logout' : 'cust_last_logout';
    }

    /**
     * Rotates the account nonce (killing every previously issued token) and
     * returns a fresh bearer token. Login and signup both end here.
     */
    public static function issue(object $user): string
    {
        $nonce = Str::random(32);
        $column = self::nonceColumn($user);
        $user->{$column} = $nonce;
        $user->save();

        return self::token($user, $nonce, time());
    }

    /**
     * Re-signs the current session without rotating the nonce, so an active
     * user is never cut off while an idle one still expires on schedule.
     */
    public static function renew(object $user, string $nonce): string
    {
        return self::token($user, $nonce, time());
    }

    private static function token(object $user, string $nonce, int $iat): string
    {
        $payload = json_encode([
            't' => $user instanceof Employee ? 'emp' : 'cust',
            'i' => (int) $user->getKey(),
            'n' => $nonce,
            'a' => $iat,
        ], JSON_UNESCAPED_SLASHES);

        $body = self::b64($payload);
        $sig = self::b64(hash_hmac('sha256', self::PREFIX . '.' . $body, self::key(), true));

        return self::PREFIX . '.' . $body . '.' . $sig;
    }

    /**
     * Parses and fully validates a bearer token.
     *
     * @return array{user: Customer|Employee, payload: array, raw: string}|null
     */
    public static function parse(?string $token): ?array
    {
        if (! $token || ! str_starts_with($token, self::PREFIX . '.')) {
            return null;
        }

        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [, $body, $sig] = $parts;
        $expected = self::b64(hash_hmac('sha256', self::PREFIX . '.' . $body, self::key(), true));
        if (! hash_equals($expected, $sig)) {
            return null;
        }

        $payload = json_decode(self::unb64($body), true);
        if (! is_array($payload) || ! isset($payload['t'], $payload['i'], $payload['n'], $payload['a'])) {
            return null;
        }

        $iat = (int) $payload['a'];
        $ttl = $payload['t'] === 'emp' ? self::EMPLOYEE_TTL : self::CUSTOMER_TTL;
        if ($iat + $ttl < time()) {
            return null;
        }

        $user = $payload['t'] === 'emp'
            ? Employee::find($payload['i'])
            : Customer::find($payload['i']);

        if (! $user) {
            return null;
        }

        // REQ-EMP_LOGOUT-06 / REQ-CUST_LOGOUT: an ended session stays ended.
        $deleted = $payload['t'] === 'emp' ? $user->emp_deleted : $user->cust_deleted;
        $suspended = $payload['t'] === 'emp' ? $user->emp_suspended : $user->cust_suspended;
        if ($deleted !== null || $suspended !== null) {
            return null;
        }

        if (! hash_equals((string) $user->{self::nonceColumn($user)}, (string) $payload['n'])) {
            return null;
        }

        $lastLogout = $user->{self::logoutColumn($user)};
        if ($lastLogout !== null && strtotime((string) $lastLogout) > $iat) {
            return null;
        }

        return ['user' => $user, 'payload' => $payload, 'raw' => $token];
    }

    /**
     * Purpose-scoped pre-sign-in challenge (DOMAIN 17 / DOMAIN 18).
     *
     * A signup proves nothing but the form it filled, and a login that still
     * owes a phone OTP has proved the password only. Neither may hold a
     * session, so the account id + purpose travel in a signed, short-lived
     * blob that the public OTP challenge endpoints redeem for a real token.
     * It carries no nonce, so `parse()` - and with it every `auth:api`
     * route - rejects it outright.
     */
    public const CHALLENGE_TTL = 30 * 60;

    /** Signs a signup / login OTP challenge for an account. */
    public static function challenge(object $user, string $purpose): string
    {
        $payload = json_encode([
            't' => 'otp',
            'p' => $purpose,
            'i' => (int) $user->getKey(),
            'a' => time(),
        ], JSON_UNESCAPED_SLASHES);

        $body = self::b64($payload);
        $sig = self::b64(hash_hmac('sha256', self::PREFIX . '.' . $body, self::key(), true));

        return self::PREFIX . '.' . $body . '.' . $sig;
    }

    /**
     * Verifies a challenge issued by self::challenge().
     *
     * @return array{user: Customer, purpose: string}|null
     */
    public static function parseChallenge(?string $token): ?array
    {
        if (! $token || ! str_starts_with($token, self::PREFIX . '.')) {
            return null;
        }

        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [, $body, $sig] = $parts;
        $expected = self::b64(hash_hmac('sha256', self::PREFIX . '.' . $body, self::key(), true));
        if (! hash_equals($expected, $sig)) {
            return null;
        }

        $payload = json_decode(self::unb64($body), true);
        if (! is_array($payload) || ($payload['t'] ?? '') !== 'otp') {
            return null;
        }

        if (time() - (int) ($payload['a'] ?? 0) > self::CHALLENGE_TTL) {
            return null;
        }

        $purpose = (string) ($payload['p'] ?? '');
        if (! in_array($purpose, ['signup', 'login'], true)) {
            return null;
        }

        $user = Customer::find((int) ($payload['i'] ?? 0));
        if (! $user || $user->cust_deleted !== null || $user->cust_suspended !== null) {
            return null;
        }

        return ['user' => $user, 'purpose' => $purpose];
    }

    /** Reads the bearer token straight off the request. */
    public static function fromRequest(Request $request): ?string
    {
        $header = (string) $request->headers->get('Authorization', '');
        if ($header !== '' && stripos($header, 'bearer ') === 0) {
            return trim(substr($header, 7));
        }

        return null;
    }

    /**
     * Guard callback: resolves the authenticated account for a request, or
     * null when the request carries no valid token.
     */
    public static function userFromRequest(Request $request): ?object
    {
        $parsed = self::parse(self::fromRequest($request));
        if (! $parsed) {
            return null;
        }

        // The renewing middleware needs the nonce of the live session.
        $request->attributes->set('cni_token', $parsed);

        return $parsed['user'];
    }
}
