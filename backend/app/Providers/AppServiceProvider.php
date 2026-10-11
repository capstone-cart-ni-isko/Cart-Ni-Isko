<?php

namespace App\Providers;

use App\Support\ApiRoutedMariaDbConnection;
use App\Support\ApiRoutedMySqlConnection;
use App\Support\ApiRoutedPostgresConnection;
use App\Support\ApiRoutedSQLiteConnection;
use App\Support\ApiRoutedSqlServerConnection;
use App\Support\ApiToken;
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
            system-new.docx MODELS lists exactly seven files under app/Models:
            Customer, Delivery, Employee, Order, Pickup, Product, Visit. The
            supporting tables (bag, custlog, custnotif, wishlist, emplog,
            empnotif, schedules, items, parcel, payment, prodsales, prodvar,
            reviews, appointment, setting, user) keep their Eloquent classes in
            App\Support\DatabaseModels.php - same App\Models namespace, so no
            call site changed - and this loader maps them there. It runs after
            composer's own loader, which skips the file for being PSR-4
            non-compliant, so an unknown App\Models\* class reaches this one.
        */
        spl_autoload_register(function (string $class): void {
            if (! str_starts_with($class, 'App\\Models\\')) {
                return;
            }

            static $loaded = false;
            if (! $loaded) {
                $loaded = true;
                require_once app_path('Support/DatabaseModels.php');
            }
        }, true, false);

        /*
            PostgreSQL cannot compare a `boolean` column against the integer
            Laravel casts PHP booleans to, so every query built by this
            application runs through a connection that keeps boolean bindings
            textual. Registered here (rather than in boot) so the resolver is
            in place before the first database connection is resolved.
        */
        Connection::resolverFor('pgsql', fn ($connection, $database, $prefix, $config) => new ApiRoutedPostgresConnection(
            $connection,
            $database,
            $prefix,
            $config
        ));

        /*
            SYSTEM RULE 80 - only DatabaseAPI may communicate with the
            database. The other drivers get the same treatment as pgsql above:
            each resolves to an ApiRouted*Connection whose run() override
            hands every statement to DatabaseAPI::passToDatabase() before the
            driver sees it (App\Support\RoutesQueriesThroughDatabaseAPI).
            Migrations and the test suite run on sqlite, so that resolver is
            what makes rule 80 hold outside production too.
        */
        Connection::resolverFor('sqlite', fn ($connection, $database, $prefix, $config) => new ApiRoutedSQLiteConnection(
            $connection,
            $database,
            $prefix,
            $config
        ));
        Connection::resolverFor('mysql', fn ($connection, $database, $prefix, $config) => new ApiRoutedMySqlConnection(
            $connection,
            $database,
            $prefix,
            $config
        ));
        Connection::resolverFor('mariadb', fn ($connection, $database, $prefix, $config) => new ApiRoutedMariaDbConnection(
            $connection,
            $database,
            $prefix,
            $config
        ));
        Connection::resolverFor('sqlsrv', fn ($connection, $database, $prefix, $config) => new ApiRoutedSqlServerConnection(
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
