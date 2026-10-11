<?php

namespace App\Support;

use Illuminate\Database\MySqlConnection;

/**
 * System rule 80: MySQL/MariaDB connections also funnel every statement
 * through DatabaseAPI::passToDatabase().
 */
class ApiRoutedMySqlConnection extends MySqlConnection
{
    use RoutesQueriesThroughDatabaseAPI;
}
