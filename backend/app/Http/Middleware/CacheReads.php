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
    //
    // `api/reviews/display` is deliberately NOT here: the same URL answers
    // the customer wall (approved only) and the employee moderation queue
    // (pending rows included), so a shared key cached the first answer and
    // served it to the other side for 30 s - the admin queue looked empty
    // and a customer could be handed unmoderated text. It is cached
    // per-account like every other token-dependent read.
    private const SHARED = [
        'api/products/filter',
        'api/products/search',
        'api/products/sort',
        'api/products/view',
        'api/products/categories',
        'api/reviews/score',
    ];

    /**
     * Endpoints that answer with POST but do not change anything.
     *
     * They must not bump the write version and must not announce a ping:
     * a ping tells every open screen that its resource moved, and the screen
     * that issued the read would then read again - forever. `tracking/create`
     * is the important one: the customer order detail screen calls it on
     * every load, so announcing it made that screen reload in a loop
     * ("loading, showing the order for a second, loading again").
     *
     * A read-only POST also must not invalidate the read cache: it moved
     * nothing, so the cached answer is still current.
     */
    private const READ_ONLY_POSTS = [
        'api/tracking/create',
        'api/checkout/dispatch',
        'api/checkout/payment/status',
        'api/otp/auto_fill',
        'api/otp/challenge/inbox',
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
            // A read-only POST moves nothing: no version bump (so the read
            // cache stays valid) and no ping (so no screen re-reads itself).
            if ($this->isReadOnlyPost($request)) {
                return $response;
            }

            // Not Cache::increment(): on the database store it is a silent
            // no-op for a missing key, so the version never moved and reads
            // stayed stale for the full TTL after every write.
            $version = (int) Cache::get('api:version', 0) + 1;
            Cache::forever('api:version', $version);
            $this->announce($request, $version);
        }

        return $response;
    }

    /** Is this a POST that only reads? (see READ_ONLY_POSTS) */
    private function isReadOnlyPost(Request $request): bool
    {
        return $request->isMethod('POST')
            && in_array($request->path(), self::READ_ONLY_POSTS, true);
    }

    /**
     * Push the "this resource moved" ping to every signed-in client.
     *
     * Runs from a deferred callback, which the framework invokes through
     * `InvokeDeferredCallbacks::terminate()` only AFTER the response has been
     * sent. The mutation therefore never waits on the WebSocket server, and a
     * Reverb outage can never fail or slow the write: the broadcast is wrapped
     * in try/catch and simply skipped, while the 30-second read cache has
     * already been invalidated by the version bump above and polling (REQ-SD-02)
     * keeps the screens fresh until Reverb is back.
     */
    private function announce(Request $request, int $version): void
    {
        $resource = (string) $request->segment(2);

        if ($resource === '') {
            return;
        }

        defer(function () use ($resource, $version): void {
            try {
                event(new \App\Events\ApiDataChanged($resource, $version));
            } catch (\Throwable $e) {
                // Best-effort: realtime is an optimization over polling.
                // Nothing here may surface to the caller of the write.
            }
        });
    }

    // Account-scoped key: user id + shared write version + full URL
    private function key(Request $request): string
    {
        $scope = 'guest';

        if (!in_array($request->path(), self::SHARED, true)) {
            $user = $request->user('api');
            if ($user !== null) {
                $scope = get_class($user) . '#' . $user->getAuthIdentifier();
            }
        }

        return 'api:read:' . $scope . ':' . Cache::get('api:version', 0) . ':' . md5($this->canonicalUrl($request));
    }

    /**
     * The URL with its query parameters sorted, so the same filters in a
     * different order (or with a param the client built from a Set/Map) hit the
     * same cache entry instead of missing every time.
     */
    private function canonicalUrl(Request $request): string
    {
        $query = $request->query();
        ksort($query);

        return $request->url() . '?' . http_build_query($query) . '|' . $request->getContent();
    }
}
