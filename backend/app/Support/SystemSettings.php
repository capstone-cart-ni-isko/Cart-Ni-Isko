<?php

namespace App\Support;

use Illuminate\Support\Facades\File;

/**
 * System-wide configuration (DOMAIN 1 / DOMAIN 15).
 *
 * system-new.docx SCHEMA lists no SETTINGS table, so nothing here may be
 * written to the database. Settings live in a JSON document under
 * storage/app, which every worker on the same host reads, so a super admin's
 * change is live for everyone on the next request.
 */
class SystemSettings
{
    /** FLOW-SETUP-01 / FLOW-EMP_SET-07 defaults. */
    private const DEFAULTS = [
        'store_name' => 'Tindahan ni Isko',
        'store_location' => 'Bicol University, Legazpi City, Albay',
        'store_contact' => 'tindahan.ni.isko@bicol-u.edu.ph',
        'operating_hours' => '08:00 - 18:00',
        'store_live' => false,
        // The storefront's "open for online orders" switch. `maintenance_mode`
        // is the stored spelling; the admin screens read `store_open` as its
        // inverse, so it is deliberately never stored alongside it.
        'maintenance_mode' => false,
        // Orders list / slot calendar caps shown on the settings screens.
        'max_claiming_slots' => 10,
        'max_visit_slots' => 1,
        // Dormant until a real term is configured (AcademicPeriodRoster).
        'academic_period_start' => '2027-08-02',
        'slot_minutes' => 10,
        'visit_slot_capacity' => 1,
        'pickup_slot_capacity' => 5,
        'booking_lead_minutes' => 30,
        'visit_slot_duration' => 10,
        'pickup_slot_duration' => 10,
        'min_weekly_minutes' => 180,
        'low_stock_threshold' => 5,
        'notif_followup_hours' => 2,
        'appointment_reminder_minutes' => 10,
        'email_notifications' => true,
        'maintenance_message' => '',
    ];

    private static ?array $cache = null;

    public static function path(): string
    {
        return storage_path('app/system-settings.json');
    }

    /** Every setting, defaults merged with whatever has been saved. */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $saved = [];
        try {
            if (File::exists(self::path())) {
                $decoded = json_decode((string) File::get(self::path()), true);
                if (is_array($decoded)) {
                    $saved = $decoded;
                }
            }
        } catch (\Throwable $e) {
            $saved = [];
        }

        return self::$cache = array_merge(self::DEFAULTS, $saved);
    }

    /** REQ-SETUP-01 / REQ-EMP_SET-05: read one setting with its default. */
    public static function get(string $key, $default = null): mixed
    {
        $all = self::all();

        return array_key_exists($key, $all)
            ? $all[$key]
            : ($default ?? ($self = self::DEFAULTS[$key] ?? null));
    }

    /**
     * REQ-SETUP-04 / FLOW-EMP_SET-08: persist one setting and keep every
     * reader in sync.
     *
     * Returns true only when the value actually reached the document on disk.
     * A read-only or full disk must never take the request down, but it must
     * also never be reported as a successful save - the caller answers the
     * super admin with a real error instead of a lie (REQ-SETUP-01).
     */
    public static function set(string $key, $value): bool
    {
        $all = self::all();
        $all[$key] = $value;

        $written = false;
        try {
            File::ensureDirectoryExists(dirname(self::path()));
            File::put(self::path(), json_encode($all, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            $written = true;
        } catch (\Throwable $e) {
            // Drop the in-process copy: keeping it would let this worker show
            // a value the others never saw.
            self::$cache = null;

            return false;
        }

        self::$cache = $all;

        return $written;
    }

    /** Bulk update used by the settings screen. True when every key landed. */
    public static function putMany(array $values): bool
    {
        $ok = true;
        foreach ($values as $key => $value) {
            if (! self::set((string) $key, $value)) {
                $ok = false;
            }
        }

        return $ok;
    }

    /** REQ-SETUP-02: critical fields must all be filled before going live. */
    public static function missingCritical(): array
    {
        $missing = [];
        foreach (['store_name', 'store_location', 'store_contact', 'operating_hours'] as $key) {
            if (trim((string) self::get($key, '')) === '') {
                $missing[] = $key;
            }
        }

        return $missing;
    }

    // ==========================================
    // REQ-SETUP-01 - validate BEFORE persisting
    // ==========================================

    /** Whole-number settings and the band each one is allowed to sit in. */
    private const INTEGER_LIMITS = [
        // FLOW-EMP_SET-07 - appointment duration and timeslot capacity.
        'slot_minutes'              => [1, 1440],
        'visit_slot_duration'       => [1, 1440],
        'pickup_slot_duration'      => [1, 1440],
        'booking_lead_minutes'      => [0, 1440],
        'visit_slot_capacity'       => [1, 100],
        'pickup_slot_capacity'      => [1, 100],
        // Business rule 46 - the minimum weekly schedule of an employee.
        'min_weekly_minutes'        => [0, 4800],
        'low_stock_threshold'       => [0, 100000],
        // FLOW-EMP_SET-07 - notification intervals.
        'notif_followup_hours'      => [1, 8760],
        'appointment_reminder_minutes' => [0, 1440],
    ];

    /** Settings that only ever hold a switch. */
    private const BOOLEAN_KEYS = [
        'store_live', 'email_notifications', 'store_open', 'maintenance_mode',
        'accept_online_orders', 'allow_in_store_pickup', 'allow_delivery',
    ];

    /** Settings that only ever hold a short line of text. */
    private const TEXT_KEYS = [
        'store_name', 'store_location', 'store_contact', 'operating_hours',
        'maintenance_message',
    ];

    /**
     * REQ-SETUP-01 / FLOW-EMP_SET-07: the message a system setting must not
     * pass, or null when it is acceptable. Nothing is written to the document
     * until every key in the request has answered null.
     */
    public static function invalid(string $key, $value): ?string
    {
        if (is_array($value) || is_object($value)) {
            return '"' . $key . '" must be a single value, not a list.';
        }

        if (in_array($key, self::BOOLEAN_KEYS, true)) {
            $parsed = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($parsed === null) {
                return '"' . $key . '" accepts true or false only.';
            }

            // REQ-SETUP-02: the store cannot be switched on while a critical
            // field of FLOW-SETUP-01 is still empty.
            if ($key === 'store_live' && $parsed && self::missingCritical() !== []) {
                return 'The store cannot go live until store name, location, contact and operating hours are all filled in.';
            }

            return null;
        }

        if (array_key_exists($key, self::INTEGER_LIMITS)) {
            if (filter_var($value, FILTER_VALIDATE_INT) === false) {
                return '"' . $key . '" must be a whole number.';
            }
            [$min, $max] = self::INTEGER_LIMITS[$key];
            $int = (int) $value;
            if ($int < $min || $int > $max) {
                return '"' . $key . '" must be between ' . $min . ' and ' . $max . '.';
            }

            return null;
        }

        if (in_array($key, self::TEXT_KEYS, true)) {
            return strlen((string) $value) > 2000
                ? '"' . $key . '" must be 2000 characters or fewer.'
                : null;
        }

        /*
            A key this document has never seen is still a store-wide value, so
            it must at least be a scalar (a list or an object would not
            survive a round trip through the JSON document as a setting). No
            length ceiling is imposed: the storefront keeps bounded blobs such
            as `store_slides` here too.
        */
        return null;
    }

    /** Called when settings change so a long-lived worker re-reads the file. */
    public static function flush(): void
    {
        self::$cache = null;
    }
}
