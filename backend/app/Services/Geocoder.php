<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Address -> coordinates through OpenStreetMap Nominatim (free, no key).
 *
 * LalaMove geocodes a bare address string badly, so every courier stop is
 * sent with coordinates. When the full address is not found the search walks
 * up the address - street, then barangay, then city - and settles on the
 * closest place that is found. A miss returns null and the caller falls back
 * to the address text alone.
 *
 * Nominatim's usage policy: an identifying User-Agent and at most one request
 * per second; every answer is cached so a customer's address is looked up
 * once, not on every quote.
 */
class Geocoder
{
    private const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
    private const CACHE_DAYS = 30;

    /** @return array{lat: float, lng: float, matched: string}|null */
    public function locate(?string $address): ?array
    {
        $clean = self::clean((string) $address);
        if ($clean === '') {
            return null;
        }

        $key = 'geocode:' . md5(strtolower($clean));
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return $cached['found'] ? $cached['result'] : null;
        }

        $result = null;
        foreach (self::attempts($clean) as $i => $query) {
            if ($i > 0) {
                usleep((int) config('services.geocoder.spacing_ms', 1100) * 1000); // one request per second
            }

            $result = $this->search($query);
            if ($result !== null) {
                break;
            }
        }

        Cache::put($key, ['found' => $result !== null, 'result' => $result], now()->addDays(self::CACHE_DAYS));

        return $result;
    }

    /**
     * The first of several saved addresses, without segments the address
     * form repeated: "148 Em's Barrio South, Legazpi City, Em's Barrio South,
     * Legazpi City, Albay 4500" -> "148 Em's Barrio South, Legazpi City,
     * Albay 4500".
     */
    public static function clean(string $address): string
    {
        $first = trim(explode(' | ', $address)[0]);

        $parts = [];
        foreach (explode(',', $first) as $part) {
            $part = trim(preg_replace('/\s+/', ' ', $part));
            if ($part === '') {
                continue;
            }
            // Repeated, or already part of an earlier segment
            // ("Em's Barrio South" after "148 Em's Barrio South").
            foreach ($parts as $earlier) {
                if (stripos($earlier, $part) !== false) {
                    continue 2;
                }
            }
            $parts[] = $part;
        }

        return implode(', ', $parts);
    }

    /**
     * Most specific first: the whole address, then with the leading segment
     * (house number / street) dropped, down to the last two segments
     * (city, province). A trailing postal code is removed from the walk-up
     * queries because it narrows nothing on its own.
     *
     * @return list<string>
     */
    public static function attempts(string $clean): array
    {
        $parts = array_map(
            fn (string $p) => trim(preg_replace('/\s*\b\d{4}\b\s*$/', '', $p)),
            explode(', ', $clean)
        );
        $parts = array_values(array_filter($parts, fn (string $p) => $p !== '' && ! ctype_digit($p)));

        $queries = [$clean];
        for ($start = 1; $start <= count($parts) - 2; $start++) {
            $queries[] = implode(', ', array_slice($parts, $start));
        }
        // A house number glued to the first segment ("148 Em's Barrio South")
        // hides the barangay from the second try, so also try it bare.
        if ($parts !== [] && preg_match('/^\d+[A-Za-z]?\s+(.+)$/', $parts[0], $m)) {
            array_splice($queries, 1, 0, [implode(', ', array_merge([$m[1]], array_slice($parts, 1)))]);
        }

        return array_values(array_unique($queries));
    }

    /** @return array{lat: float, lng: float, matched: string}|null */
    private function search(string $query): ?array
    {
        try {
            $response = Http::withHeaders([
                'User-Agent' => (string) config('services.geocoder.user_agent'),
                'Accept-Language' => 'en',
            ])->timeout(8)->get(self::ENDPOINT, [
                'q'            => $query,
                'format'       => 'jsonv2',
                'countrycodes' => 'ph',
                'limit'        => 1,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Geocoder request failed', ['query' => $query, 'error' => $e->getMessage()]);
            return null;
        }

        $hit = $response->successful() ? ($response->json()[0] ?? null) : null;
        if (! is_array($hit) || ! is_numeric($hit['lat'] ?? null) || ! is_numeric($hit['lon'] ?? null)) {
            return null;
        }

        return [
            'lat'     => (float) $hit['lat'],
            'lng'     => (float) $hit['lon'],
            'matched' => $query,
        ];
    }
}
