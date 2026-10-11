<?php

namespace App\Support;

use Illuminate\Database\SqlServerConnection;

/**
 * System rule 80: SQL Server connections funnel every statement through
 * DatabaseAPI::passToDatabase().
 */
class ApiRoutedSqlServerConnection extends SqlServerConnection
{
    use RoutesQueriesThroughDatabaseAPI;
}
