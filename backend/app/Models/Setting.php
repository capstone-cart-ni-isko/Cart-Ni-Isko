<?php

namespace App\Models;

use App\Support\SystemSettings;

/**
 * Compatibility facade over SystemSettings.
 *
 * system-new.docx SCHEMA has no SETTINGS table, so nothing is ever read from
 * or written to the database here - the settings document lives on disk.
 * Every legacy `Setting::getValue()` / `Setting::setValue()` call site keeps
 * working unchanged.
 */
class Setting
{
    public static function getValue(string $key, $default = null)
    {
        return SystemSettings::get($key, $default);
    }

    public static function setValue(string $key, $value): void
    {
        SystemSettings::set($key, $value);
    }

    /** Bulk read for the settings screen. */
    public static function all(): array
    {
        return SystemSettings::all();
    }

    /** Bulk write for the settings screen. */
    public static function fill(array $values): void
    {
        SystemSettings::putMany($values);
    }
}
