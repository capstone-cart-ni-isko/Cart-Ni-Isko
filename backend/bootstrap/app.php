<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // First in the stack: every later stage benefits from the wider clock.
        $middleware->append(App\Http\Middleware\ApiTimeLimit::class);
        $middleware->append(App\Http\Middleware\CacheReads::class);
        $middleware->append(App\Http\Middleware\RenewApiToken::class);

        // API-only app: an unauthenticated request has no page to be sent to,
        // so guests stay put and the handler below answers 401 JSON.
        $middleware->redirectGuestsTo(fn () => null);

        $middleware->alias([
            'role' => App\Http\Middleware\EnsureRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // This app has no `login` route: a request that reaches an
        // auth:sanctum endpoint without a valid token must answer 401 JSON
        // (the frontend drops the session on 401), never a redirect.
        $exceptions->shouldRenderJsonWhen(fn ($request) => $request->is('api/*'));
        $exceptions->render(function (Illuminate\Auth\AuthenticationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated. Please sign in again.'
            ], 401);
        });

        // Fault-tolerance backstop (rule 76 / 80): whichever controller action
        // an unexpected failure escapes from, an API caller still gets the one
        // `{success:false, message}` envelope instead of an HTML error page or
        // a stack trace. The kernel has already reported (logged) the
        // exception by the time this runs, so nothing is duplicated here.
        //
        // Everything Laravel renders on its own keeps its own status and body:
        // authentication (401), validation (422 with `errors`), and the HTTP
        // exceptions behind 404 / 405 / 419 / 429 never reach the 500 branch.
        $exceptions->render(function (\Throwable $e, $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            if ($e instanceof Illuminate\Auth\AuthenticationException
                || $e instanceof Illuminate\Validation\ValidationException
                || $e instanceof Illuminate\Http\Exceptions\HttpResponseException
                || $e instanceof Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) {
                return null;
            }

            return response()->json([
                'success' => false,
                'message' => 'Something went wrong. Please try again.',
            ], 500);
        });
    })->create();
