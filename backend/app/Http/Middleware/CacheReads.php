<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

// Replays recent API reads so pages load in well under a second on the
// high-latency Supabase link. Entries live for 30 s (the same freshness
// bound REQ-SD-02 polling already accepts), are keyed per account, and
// every successful mutation bumps a shared version so writes are always
// visible immediately.
class CacheReads
{
    private const TTL = 30;

    // Public catalog reads: identical for every caller, so no account
    // scoping and no token lookup are needed for these paths.
    private const SHARED = [
        'api/products/filter',
        'api/products/search',
        'api/products/sort',
        'api/products/view',
        'api/reviews/display',
        'api/reviews/score',
    ];

    public function handle(Request $request, Closure $next)
    {
        if (!$request->is('api/*')) {
            return $next($request);
        }

        if ($request->isMethod('GET')) {
            $key = $this->key($request);
            $hit = Cache::get($key);

            if ($hit !== null) {
                return response($hit['body'], $hit['status'])
                    ->header('Content-Type', $hit['type'] ?: 'application/json');
            }

            $response = $next($request);

            if ($response->getStatusCode() === 200) {
                Cache::put($key, [
                    'body'   => $response->getContent(),
                    'status' => 200,
                    'type'   => $response->headers->get('Content-Type'),
                ], self::TTL);
            }

            return $response;
        }

        $response = $next($request);

        if ($response->isSuccessful()) {
            Cache::increment('api:version');
        }

        return $response;
    }

    // Account-scoped key: user id + shared write version + full URL
    private function key(Request $request): string
    {
        $scope = 'guest';

        if (!in_array($request->path(), self::SHARED, true)) {
            $user = $request->user('sanctum');
            if ($user !== null) {
                $scope = get_class($user) . '#' . $user->getAuthIdentifier();
            }
        }

        return 'api:read:' . $scope . ':' . Cache::get('api:version', 0) . ':' . md5($request->fullUrl() . '|' . $request->getContent());
    }
}
