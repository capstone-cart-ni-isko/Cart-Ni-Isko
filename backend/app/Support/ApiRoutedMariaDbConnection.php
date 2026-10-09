<?php

namespace App\Support;

use Illuminate\Database\MariaDbConnection;

/**
 * System rule 80: MariaDB connections funnel every statement through
 * DatabaseAPI::passToDatabase().
 */
class ApiRoutedMariaDbConnection extends MariaDbConnection
{
    use RoutesQueriesThroughDatabaseAPI;
}
