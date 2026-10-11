<?php

namespace App\Support;

use App\Http\Controllers\DatabaseAPI;
use Closure;

/**
 * System rule 80 - "Only the DatabaseAPI.php backend API must directly
 * communicate with the database."
 *
 * Queries are still written where they belong (an API builds its own query),
 * but the moment one is handed to PDO it first passes through
 * DatabaseAPI::passToDatabase(), which validates it and is the single place
 * in the application that reaches the database. Wiring the funnel into
 * Connection::run() means every entry point is covered at once - Eloquent
 * models, the DB facade, schema work and raw statements - instead of relying
 * on each call site to remember a wrapper.
 *
 * Applied to each driver by the resolvers registered in
 * AppServiceProvider::register(). The pgsql resolver keeps stacking on
 * BoolSafePostgresConnection so boolean bindings stay textual.
 */
trait RoutesQueriesThroughDatabaseAPI
{
    /**
     * @param  string  $query
     * @param  array  $bindings
     * @param  \Closure  $callback
     * @return mixed
     */
    protected function run($query, $bindings, Closure $callback)
    {
        return DatabaseAPI::passToDatabase(
            $query,
            $bindings,
            fn () => parent::run($query, $bindings, $callback)
        );
    }
}
