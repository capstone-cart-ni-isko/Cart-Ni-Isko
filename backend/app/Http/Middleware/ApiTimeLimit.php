<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Lets an API request survive a stalled database round trip instead of being
 * killed by the clock.
 *
 * Measured on this deployment (2026-10-08): a request occasionally stalls inside
 * `Illuminate\Database\Database\Connection.php:425` (`$statement->execute()`)
 * while the Tokyo pooler round trip or the socket recovers. The stalls observed
 * resolved at 10.6 s and 34.4 s - and two others were cut off by PHP first.
 * The stock max_execution_time in the cli-server SAPI is 30 s, so those two
 * were turned into `Maximum execution time of 30 seconds exceeded` fatals even
 * though the query itself was perfectly valid and a moment later would have
 * returned. That is a clock problem, not a database problem: pg_stat_activity
 * showed no waiting backends and no lock contention while it happened.
 *
 * Raising the limit means the request reaches its answer and returns it. Once
 * the limit was widened, the 34.4 s case came back as a 200 instead of a fatal.
 * If the socket does finally error rather than answer, SupabaseLostConnectionDetector
 * matches SQLSTATE[08006] and Laravel re-connects on a fresh pooler socket, so
 * the request still completes.
 *
 * 120 s is deliberate: Windows TCP data retransmission keeps trying for well
 * over a minute on a half-open socket, so a limit near 30-60 s reliably fires
 * first and destroys a request that was still recoverable. This is the
 * "proceed even if it exceeds" half of the budget rule - 1 s is the target,
 * but a request that overruns it must finish rather than be cut off.
 *
 * Scoped to api/* only: static assets and the SPA shell hold no database
 * handle, so they keep the stock limit and a hung static request still fails
 * fast.
 *
 * Override with API_TIME_LIMIT if the link ever needs a different window.
 */
class ApiTimeLimit
{
    public function handle(Request $request, Closure $next)
    {
        if ($request->is('api/*')) {
            @set_time_limit(max(30, (int) env('API_TIME_LIMIT', 120)));
        }

        return $next($request);
    }
}
