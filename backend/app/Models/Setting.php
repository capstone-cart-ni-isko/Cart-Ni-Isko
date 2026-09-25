<?php
    namespace App\Models;
    use Illuminate\Database\Eloquent\Model;
    use Illuminate\Support\Facades\Schema;

    class Setting extends Model
    {
        // Define the table name and timestamps
        protected $table = 'settings';

        // Define the fillable attributes for mass assignment
        protected $fillable = [
            'key',
            'value',
        ];

        // Reads a setting as a decoded JSON value with a default fallback.
        // Tolerates a missing settings table so live connections that have
        // not run the migration still receive the built-in defaults.
        public static function getValue(string $key, $default = null)
        {
            try {
                $setting = static::where('key', $key)->first();
            } catch (\Throwable $e) {
                return $default;
            }

            if (!$setting || $setting->value === null) {
                return $default;
            }

            $decoded = json_decode($setting->value, true);

            return json_last_error() === JSON_ERROR_NONE ? $decoded : $setting->value;
        }

        // Persists a setting; values are stored JSON-encoded so booleans,
        // numbers and strings round-trip back to their original type.
        // A connection without the settings migration keeps running on the
        // built-in defaults instead of failing the request.
        public static function setValue(string $key, $value): void
        {
            try {
                static::updateOrCreate(
                    ['key' => $key],
                    ['value' => json_encode($value)]
                );
            } catch (\Throwable $e) {
                if (!Schema::hasTable('settings')) {
                    return;
                }

                throw $e;
            }
        }
    }
