<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * api_auth: consolidated customer login RPC.
 *
 * `api_auth_cust_login` returns the account row ONLY when the submitted
 * password matches the stored bcrypt digest, so the credential read and the
 * password comparison travel as ONE database round trip instead of the old
 * "fetch the user, then compare" pair. The bcrypt work runs inside PostgreSQL
 * (pgcrypto) rather than in the PHP worker, so CPU-bound hashing can no longer
 * push a login past the 1-second frontend budget on a high-latency Tokyo link.
 *
 * PHP's `password_hash()` emits the `$2y$` prefix, which pgcrypto does not
 * recognise; PostgreSQL's Blowfish is the corrected implementation that `$2y$`
 * names, so the digest is compared under its `$2a$` alias. The result is
 * byte-for-byte what `password_verify()` returns, including bcrypt's 72-byte
 * truncation rule.
 *
 * Schema-only change: it never inserts, edits, or removes any data row, and the
 * PHP login path keeps working without it (see AuthAPI::customerLogin).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
            do $$
            begin
                if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
                    create extension pgcrypto with schema public;
                end if;
            end $$;

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
                  and crypt(p_password, replace(c.cust_password, '$2y$', '$2a$'))
                      = replace(c.cust_password, '$2y$', '$2a$')
            $fn$;
        SQL);
    }

    public function down(): void
    {
        // Additive RPC: leaving it in place is harmless, and dropping it would
        // push every login back onto the two-round-trip PHP fallback.
    }
};
