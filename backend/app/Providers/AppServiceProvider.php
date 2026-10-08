<?php

namespace App\Providers;

use App\Support\ApiToken;
use App\Support\BoolSafePostgresConnection;
use App\Support\SupabaseLostConnectionDetector;
use Illuminate\Auth\RequestGuard;
use Illuminate\Contracts\Database\LostConnectionDetector as LostConnectionDetectorContract;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        /*
            PostgreSQL cannot compare a `boolean` column against the integer
            Laravel casts PHP booleans to, so every query built by this
            application runs through a connection that keeps boolean bindings
            textual. Registered here (rather than in boot) so the resolver is
            in place before the first database connection is resolved.
        */
        Connection::resolverFor('pgsql', fn ($connection, $database, $prefix, $config) => new BoolSafePostgresConnection(
            $connection,
            $database,
            $prefix,
            $config
        ));

        /*
         * A connect attempt that times out against the Tokyo pooler raises
         * "timeout expired", which Laravel's stock detector does not match -
         * so a transient blip became a 500 instead of a silent re-connect.
         * This binding adds the two pgsql/pooler failures we actually see.
         */
        $this->app->singleton(LostConnectionDetectorContract::class, fn () => new SupabaseLostConnectionDetector());
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /*
            The `api` guard answers `auth:api` and `$request->user('api')`.
            It resolves the account straight from the signed bearer token, so
            no token table is required (system-new.docx SCHEMA has none).
        */
        Auth::extend('cni_token', function ($app, $name, array $config) {
            return new RequestGuard(
                fn ($request) => ApiToken::userFromRequest($request),
                $app['request'],
                $app['auth']->createUserProvider($config['provider'] ?? null)
            );
        });
    }
}
