<?php

namespace App\Http\Middleware;

use App\Support\ApiToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Slides an authenticated session forward so an employee who keeps working is
 * never logged out (REQ-EMP_LOGOUT-03 wants 30 minutes of *inactivity*, not a
 * hard cut-off). The response carries a re-signed token whenever the presented
 * one is older than ApiToken::RENEW_AFTER; the frontend adopts it silently.
 * Nothing is persisted - the signature and the *_login_active nonce still
 * decide whether the token is any good.
 */
class RenewApiToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $parsed = $request->attributes->get('cni_token');
        if (! is_array($parsed) || ! isset($parsed['payload']['n'], $parsed['payload']['a'])) {
            return $response;
        }

        if (time() - (int) $parsed['payload']['a'] < ApiToken::RENEW_AFTER) {
            return $response;
        }

        $response->headers->set(
            ApiToken::RENEW_HEADER,
            ApiToken::renew($parsed['user'], (string) $parsed['payload']['n'])
        );

        return $response;
    }
}
