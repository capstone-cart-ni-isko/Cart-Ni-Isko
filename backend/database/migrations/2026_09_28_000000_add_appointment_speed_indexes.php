<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Speeds up the appointment list the ribbon opens. Every query the customer
 * side makes is "my bookings for a date range / status", and the SRS keeps the
 * status implicit (appoint_closed + appoint_date + appoint_type), so:
 *
 *  - appointment_cust_date_idx (cust_id, appoint_date): REQ-SC-01 "a customer
 *    only ever sees their own bookings" plus the date ordering/filtering.
 *  - appointment_date_idx (appoint_date): date-only reads, i.e. the master
 *    calendar and the day-wide capacity counts.
 *  - appointment_closed_idx (appoint_closed): the open-vs-closed split behind
 *    the upcoming / done / cancelled pills.
 *  - appointment_type_date_idx (appoint_type, appoint_date): the per-type slot
 *    capacity and staffing counts in slotState() (REQ-AB-01/02/03).
 *
 * Purely additive: no row is inserted, updated or removed.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('appointment')) {
            return;
        }

        Schema::table('appointment', function (Blueprint $table) {
            $table->index(['cust_id', 'appoint_date'], 'appointment_cust_date_idx');
            $table->index('appoint_date', 'appointment_date_idx');
            $table->index('appoint_closed', 'appointment_closed_idx');
            $table->index(['appoint_type', 'appoint_date'], 'appointment_type_date_idx');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('appointment')) {
            return;
        }

        Schema::table('appointment', function (Blueprint $table) {
            $table->dropIndex('appointment_cust_date_idx');
            $table->dropIndex('appointment_date_idx');
            $table->dropIndex('appointment_closed_idx');
            $table->dropIndex('appointment_type_date_idx');
        });
    }
};
