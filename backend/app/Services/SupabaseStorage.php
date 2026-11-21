<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Uploaded pictures (profile photos, product images) live in a public
 * Supabase Storage bucket instead of the Render disk, which is wiped on every
 * deploy. The server uploads with the project's secret key; browsers read the
 * file through the bucket's public URL.
 *
 * Configured with SUPABASE_URL, SUPABASE_SERVICE_KEY and
 * SUPABASE_STORAGE_BUCKET. When any is missing, callers fall back to the
 * local disk exactly as before.
 */
class SupabaseStorage
{
    public static function configured(): bool
    {
        return filled(config('services.supabase.url'))
            && filled(config('services.supabase.key'))
            && filled(config('services.supabase.bucket'));
    }

    /**
     * Stores the bytes at $path inside the bucket and returns the public URL,
     * or null when the upload did not succeed (the caller falls back).
     */
    public static function put(string $path, string $bytes, string $mime): ?string
    {
        if (! self::configured()) {
            return null;
        }

        $base = rtrim((string) config('services.supabase.url'), '/');
        $bucket = (string) config('services.supabase.bucket');
        $key = (string) config('services.supabase.key');
        $path = ltrim($path, '/');

        try {
            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . $key,
                'apikey'        => $key,
                'x-upsert'      => 'true',
                'Cache-Control' => 'max-age=31536000',
            ])
                ->connectTimeout(5)
                ->timeout(20)
                ->withBody($bytes, $mime)
                ->post($base . '/storage/v1/object/' . rawurlencode($bucket) . '/' . $path);

            if (! $response->successful()) {
                Log::warning('Supabase Storage upload failed', ['status' => $response->status(), 'path' => $path]);
                return null;
            }
        } catch (\Throwable $e) {
            Log::warning('Supabase Storage upload failed', ['error' => $e->getMessage(), 'path' => $path]);
            return null;
        }

        return $base . '/storage/v1/object/public/' . rawurlencode($bucket) . '/' . $path;
    }
}
