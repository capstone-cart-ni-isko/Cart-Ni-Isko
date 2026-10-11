<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Gives a fresh (or test) database the session columns of the system-new.docx
 * SCHEMA.
 *
 * All of them already exist on the live Supabase connection - that document's
 * SCHEMA is what the live database runs - so every addition is guarded by
 * hasColumn() and the migration is a no-op there: no existing table, column or
 * row of the live database is touched, and no row is ever written. What it
 * does provide to the sqlite fixture used by phpunit is the set of columns the
 * authentication flows actually write:
 *
 *   *_login_active - the session nonce of the signed bearer token (ApiToken)
 *   *_last_logout  - FLOW-CUST_LOGOUT-04 / the 15-day rule of FLOW-CUST_LOGIN-02
 *   *_login_failed - FLOW-ACCESS_LOG-01: a rejected login still leaves a mark
 *   *_suspended    - the disabled-account flag every token parse reads
 */
return new class extends Migration
{
    /** table => column => closure adding it (only ever called for missing columns). */
    private const COLUMNS = [
        'customer' => [
            'cust_login_active' => 'string',
            'cust_login_failed' => 'timestamp',
            'cust_last_logout'  => 'timestamp',
            'cust_suspended'    => 'timestamp',
        ],
        'employee' => [
            'emp_login_active' => 'string',
            'emp_last_logout'  => 'timestamp',
            'emp_suspended'    => 'timestamp',
        ],
    ];

    public function up(): void
    {
        foreach (self::COLUMNS as $tableName => $columns) {
            if (! Schema::hasTable($tableName)) {
                continue;
            }

            $missing = array_filter(
                array_keys($columns),
                static fn (string $column) => ! Schema::hasColumn($tableName, $column)
            );

            if ($missing === []) {
                continue;
            }

            Schema::table($tableName, static function (Blueprint $table) use ($columns, $missing) {
                foreach ($missing as $column) {
                    $columns[$column] === 'string'
                        ? $table->string($column)->nullable()
                        : $table->timestamp($column)->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        // The columns belong to the system-new.docx SCHEMA: they are never
        // dropped, on any connection.
    }
};
