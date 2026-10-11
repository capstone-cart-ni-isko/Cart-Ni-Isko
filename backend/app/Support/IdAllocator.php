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
 * NUMBERING RULE - the lowest vacant key is reused before the sequence moves
 * on. A table holding 1, 2, 3 with 2 hard-deleted hands out 2 next; once 2
 * is taken again the following allocation is 4, then 5, and so on. This is
 * what the shop's retention rule needs: the 18-month purge (system rule 78)
 * frees keys, and freed keys must be handed back out in order instead of
 * being skipped forever.
 *
 * SCOPE - only call it for tables WITHOUT a sequence/default/identity
 * ---------------------------------------------------------------
 *  allocated  bag, wishlist, orders, items, pickup, delivery, appointments,
 *             custnotif, empnotif, custlog, emplog, reviews, product,
 *             prodvar, prodsales, schedules, customer, employee
 *  NEVER      payment (payment_pay_id_seq), parcel (parcel_parcel_id_seq),
 *             appointment (appointment_appoint_id_seq - the legacy singular
 *             table), reports, users, jobs, failed_jobs, migrations,
 *             personal_access_tokens: those keys are already derived from a
 *             sequence, and a manual number would fight (and eventually
 *             collide with) it.
 *
 * CONCURRENCY CAVEAT (read before using)
 * --------------------------------------
 * The vacancy read is a best-effort read-modify-write, NOT a lock. Two
 * requests that read the same empty/low table at the same moment get the
 * same number and the loser of the resulting INSERT fails with a duplicate
 * key error: that one request fails, but no row is corrupted and no number
 * is "reserved". Reusing a freed key widens the window slightly (a key just
 * released can be handed out twice at once) but the failure mode is
 * identical - a rejected insert, never a wrong row. A lost race is not
 * retried; that is the accepted price for not being allowed to create a
 * sequence.
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
     * The LOWEST vacant key wins: a table holding 1, 2, 3 with 2 deleted hands
     * out 2, and only once 2 is taken again does the numbering move past the
     * highest key (4, 5, 6, ...). Keys below the lowest surviving row count as
     * vacant for the same reason - after a purge of everything under 50 the
     * next record is 1, not the old ceiling.
     *
     * @param string $table physical table name (public schema, e.g. 'orders')
     * @param string $pk    primary key column (e.g. 'ord_id')
     *
     * @return int the lowest vacant key. Always an int, never 0 or negative.
     */
    public static function next(string $table, string $pk): int
    {
        // Nothing was ever allocated: the numbering starts at 1.
        $max = DB::table($table)->max($pk);

        if ($max === null) {
            return 1;
        }

        $max = (int) $max;

        // Keys under the lowest surviving row are vacant too.
        if ((int) DB::table($table)->min($pk) > 1) {
            return 1;
        }

        // min === 1 and one row per key means the table is a packed 1..max:
        // no hole to fill, so the numbering simply moves past the ceiling.
        if ((int) DB::table($table)->count($pk) === $max) {
            return $max + 1;
        }

        // A hole exists. The lowest vacant key is the successor of the lowest
        // row whose own successor is missing - one self-join on the indexed
        // key, cheapest when the hole sits low, which is where purged rows
        // leave it. Anything above max is deliberately not a candidate: the
        // ceiling only rises once every key under it is taken.
        $row = DB::table($table . ' as lower')
            ->select('lower.' . $pk)
            ->leftJoin(
                $table . ' as higher',
                'higher.' . $pk,
                '=',
                DB::raw('lower.' . $pk . ' + 1')
            )
            ->whereNull('higher.' . $pk)
            ->where('lower.' . $pk, '<', $max)
            ->orderBy('lower.' . $pk)
            ->limit(1)
            ->first();

        return $row === null ? $max + 1 : ((int) $row->{$pk}) + 1;
    }
}
