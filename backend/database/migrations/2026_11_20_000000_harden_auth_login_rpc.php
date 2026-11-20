<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Security fix: the original `api_auth_cust_login` also accepted
 * `c.cust_password = p_password` for every row, so submitting a stored bcrypt
 * digest itself (for example from a leaked dump) signed the account in.
 * The plain comparison now applies only to legacy rows that were never
 * hashed; hashed rows are checked with bcrypt alone.
 *
 * Schema-only change: it never inserts, edits, or removes any data row.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
            create or replace function api_auth_cust_login(
                p_phone    text,
                p_password text
            )
            returns setof customer
            language sql
            stable
            set search_path = public, extensions
            as $fn$
                select c.*
                from customer c
                where c.cust_phone = p_phone
                  and c.cust_password is not null
                  and (
                      (c.cust_password like '$2%' and crypt(p_password, replace(c.cust_password, '$2y$', '$2a$')) = replace(c.cust_password, '$2y$', '$2a$'))
                      or (c.cust_password not like '$%' and c.cust_password = p_password)
                  )
            $fn$;
        SQL);
    }

    public function down(): void
    {
        // Rolling back would reopen the hash-as-password hole; keep it.
    }
};
