<?php

namespace App\Support;

use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Password handling for the `employee` table (DOMAIN 2 / DOMAIN 6).
 *
 * WHY THE SUFFIX EXISTS
 * ---------------------
 * The system-new.docx EMPLOYEE schema has no "credential changed" /
 * "temporary password" column, and adding one is out of bounds (no column,
 * table or sequence may be added). REQ-EMP_ENROLL-03 still requires the
 * temporary password issued at enrollment to be *marked* for a required
 * change on first login. The marker therefore lives inside the bcrypt digest
 * itself: a temporary password is stored as bcrypt(plain . SUFFIX), which is
 * still an ordinary bcrypt hash - it can never be mistaken for plaintext - but
 * it tells login (and only login) that the credential is still the one the
 * system generated.
 *
 * Everything in this class is employee-only; customer credentials are handled
 * by SecurityAPI and are untouched here.
 */
final class EmployeePassword
{
    /** Appended to a temporary password before it is digested. */
    public const TEMPORARY_SUFFIX = '|tni-temporary';

    private function __construct()
    {
    }

    /**
     * Bcrypt digest for a password the employee chose (REQ-EMP_ENROLL-03).
     *
     * The Employee model runs the same check on every save, so a plaintext
     * value can never reach the `employee` table - even from a seeder, a test
     * fixture or a raw console command.
     */
    public static function make(string $plain): string
    {
        return Hash::make($plain);
    }

    /** Bcrypt digest for a system-generated temporary password. */
    public static function makeTemporary(string $plain): string
    {
        return Hash::make($plain . self::TEMPORARY_SUFFIX);
    }

    /**
     * True when the stored value is already a bcrypt/argon digest, i.e. it must
     * never be digested a second time.
     */
    public static function isHashed(string $stored): bool
    {
        return (bool) preg_match('/^\$(2[abxy]?|argon2[idi]?)\$/', $stored);
    }

    /**
     * Verifies a submitted password against the stored employee digest.
     *
     * @return array{valid: bool, temporary: bool}
     *         `temporary` is true only for a digest that was created for a
     *         system-generated password (REQ-EMP_ENROLL-03).
     */
    public static function verify(string $plain, string $stored): array
    {
        if (! self::isHashed($stored)) {
            // Legacy row written before hashing was enforced. The model hook
            // rewrites it on the next save; until then it still has to work.
            $valid = $stored !== '' && hash_equals($stored, $plain);

            return ['valid' => $valid, 'temporary' => false];
        }

        try {
            if (Hash::check($plain, $stored)) {
                return ['valid' => true, 'temporary' => false];
            }

            if (Hash::check($plain . self::TEMPORARY_SUFFIX, $stored)) {
                return ['valid' => true, 'temporary' => true];
            }
        } catch (\Throwable $e) {
            return ['valid' => false, 'temporary' => false];
        }

        return ['valid' => false, 'temporary' => false];
    }

    /**
     * The one place that decides a password meets the store's complexity bar
     * (REQ-EMP_ENROLL-03): long enough, and carrying upper, lower, numeric and
     * symbol characters.
     */
    public static function generateTemporary(int $length = 20): string
    {
        do {
            $candidate = Str::password($length);
        } while (! self::meetsStandard($candidate));

        return $candidate;
    }

    public static function meetsStandard(string $plain): bool
    {
        return strlen($plain) >= 16
            && preg_match('/[a-z]/', $plain)
            && preg_match('/[A-Z]/', $plain)
            && preg_match('/[0-9]/', $plain)
            && preg_match('/[^A-Za-z0-9]/', $plain);
    }
}
