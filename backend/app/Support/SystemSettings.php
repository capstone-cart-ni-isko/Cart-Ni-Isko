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
        'operating_hours' => '08:00-18:00',
        'store_live' => false,
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

    /** REQ-SETUP-04: persist one setting and keep every reader in sync. */
    public static function set(string $key, $value): void
    {
        $all = self::all();
        $all[$key] = $value;

        try {
            File::ensureDirectoryExists(dirname(self::path()));
            File::put(self::path(), json_encode($all, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } catch (\Throwable $e) {
            // A read-only disk must never take the request down; the value
            // still applies to this process.
        }

        self::$cache = $all;
    }

    /** Bulk update used by the settings screen. */
    public static function putMany(array $values): void
    {
        foreach ($values as $key => $value) {
            self::set((string) $key, $value);
        }
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

    /** Called when settings change so a long-lived worker re-reads the file. */
    public static function flush(): void
    {
        self::$cache = null;
    }
}
