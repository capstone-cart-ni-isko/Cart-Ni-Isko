<?php

namespace App\Support;

/**
 * System rule 80 + the boolean-binding fix: the live Supabase/Postgres
 * connection keeps BoolSafePostgresConnection::prepareBindings() and adds the
 * DatabaseAPI::passToDatabase() funnel, so both stack on the same connection
 * (only one resolver per driver can be registered).
 */
class ApiRoutedPostgresConnection extends BoolSafePostgresConnection
{
    use RoutesQueriesThroughDatabaseAPI;
}
