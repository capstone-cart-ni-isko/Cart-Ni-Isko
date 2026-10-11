<?php

namespace App\Support;

use Illuminate\Database\PostgresConnection;

/**
 * PostgreSQL boolean bindings.
 *
 * Laravel's base Connection::prepareBindings() casts every PHP bool to an
 * integer (true => 1, false => 0) because MySQL and SQLite accept numeric
 * booleans. PostgreSQL does not: a bound parameter arrives with an integer
 * type OID, so any statement that compares or writes a boolean column fails
 * with `operator does not exist: boolean = integer`.
 *
 * The live database stores bag_placed, emp_present, emp_darkmode,
 * cust_darkmode, cust_notif_email, cust_notif_prod, emp_notif_email,
 * prodvar_main and prodvar_preorder as `boolean`, so the connection rewrites
 * bool bindings to their textual form before PDO sees them. Text parameters
 * are sent with an unspecified type OID, letting PostgreSQL infer `boolean`
 * from the column (and still parse "1"/"0" for the numeric columns such as
 * cust_notif_appointremind), which keeps every existing call site working
 * without a project-wide sweep.
 */
class BoolSafePostgresConnection extends PostgresConnection
{
    public function prepareBindings(array $bindings)
    {
        foreach ($bindings as $key => $value) {
            if (is_bool($value)) {
                $bindings[$key] = $value ? '1' : '0';
            }
        }

        return parent::prepareBindings($bindings);
    }
}
