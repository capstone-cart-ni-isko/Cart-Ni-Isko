<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Security review 2026-11-20 (H7, M6).
 *
 * 1. Many controller actions catch an exception themselves and answer
 *    `{"error": $e->getMessage()}`, which can leak SQL, table and column
 *    names. Outside debug mode the raw `error` text is logged and removed
 *    from any 5xx JSON body; the friendly `message` stays.
 * 2. Baseline security headers on every API response.
 */
class SecureApiResponses
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($response instanceof JsonResponse
            && $response->getStatusCode() >= 500
            && ! config('app.debug')) {
            $data = $response->getData(true);

            if (is_array($data) && array_key_exists('error', $data)) {
                Log::error('API error detail withheld from client', [
                    'path'   => $request->path(),
                    'status' => $response->getStatusCode(),
                    'error'  => is_scalar($data['error']) ? (string) $data['error'] : json_encode($data['error']),
                ]);
                unset($data['error']);
                $response->setData($data);
            }
        }

        $headers = $response->headers;
        $headers->set('X-Content-Type-Options', 'nosniff');
        $headers->set('X-Frame-Options', 'DENY');
        $headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        if ($request->isSecure()) {
            $headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
