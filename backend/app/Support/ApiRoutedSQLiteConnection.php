<?php

namespace App\Support;

use Illuminate\Database\SQLiteConnection;

/**
 * System rule 80: sqlite queries (the test suite and local development run on
 * `:memory:`) reach PDO only through DatabaseAPI::passToDatabase().
 */
class ApiRoutedSQLiteConnection extends SQLiteConnection
{
    use RoutesQueriesThroughDatabaseAPI;
}
