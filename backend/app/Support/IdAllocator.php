<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Application-level primary key allocator for the legacy Supabase tables.
 *
 * WHY IT EXISTS
 * -------------
 * On the live database every legacy business table ships a bare
 * `bigint NOT NULL` primary key with NO identity, NO column default and NO
 * backing sequence (verified read-only through information_schema), so an
 * Eloquent insert that omits the key dies with a NOT NULL violation. The
 * legacy PHP app assigned ids by hand; DDL is off limits here (no sequence,
 * identity, default, trigger, table or column may be added), so the number is
 * allocated in application code instead: MAX(pk) + 1.
 *
 * SCOPE - only call it for tables WITHOUT a sequence/default/identity
 * ---------------------------------------------------------------
 *  max+1  bag, wishlist, orders, items, pickup, delivery, appointments,
 *         custnotif, empnotif, custlog, emplog, reviews, product, prodvar,
 *         prodsales, schedules, customer, employee
 *  NEVER  payment (payment_pay_id_seq), parcel (parcel_parcel_id_seq),
 *         appointment (appointment_appoint_id_seq - the legacy singular
 *         table), reports, users, jobs, failed_jobs, migrations,
 *         personal_access_tokens: those keys are already derived from a
 *         sequence, and a manual max+1 would fight (and eventually collide
 *         with) it.
 *
 * CONCURRENCY CAVEAT (read before using)
 * --------------------------------------
 * `MAX(pk) + 1` is a best-effort read-modify-write, NOT a lock. Two requests
 * that read the same empty/low table at the same moment get the same number
 * and the loser of the resulting INSERT fails with a duplicate key error:
 * that one request fails, but no row is corrupted and no number is
 * "reserved". There is no gap protection and a lost race is not retried -
 * that is the accepted price for not being allowed to create a sequence.
 *
 * Callers that already run inside DB::transaction() (checkout, appointment
 * booking) should call this helper inside that transaction so the allocation
 * happens next to the insert; note that under Postgres READ COMMITTED this
 * only narrows the window - a concurrent MAX() read still cannot see the
 * other transaction's uncommitted row. The appointment booking path is the
 * one truly serialised case: it also takes pg_advisory_xact_lock() for the
 * slot before allocating, so bookings for the same slot cannot collide.
 */
final class IdAllocator
{
    /** Not instantiable: this is a stateless function holder. */
    private function __construct()
    {
    }

    /**
     * Next free primary key for a table that has no sequence of its own.
     *
     * @param string $table physical table name (public schema, e.g. 'orders')
     * @param string $pk    primary key column (e.g. 'ord_id')
     *
     * @return int MAX(pk) + 1, or 1 when the table is empty. Always an int.
     */
    public static function next(string $table, string $pk): int
    {
        $max = DB::table($table)->max($pk);

        return $max === null ? 1 : ((int) $max) + 1;
    }
}
