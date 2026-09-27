<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Speeds up the order, checkout and pickup reads, which are the other two
 * hot paths beside the appointment list:
 *
 *  - orders_ord_status_idx (ord_status): the status dashboard (REQ-SD-02/04)
 *    and the order history both filter on the status transition
 *    (TO PROCESS > TO CLAIM / TO RECEIVE > CLAIMED / RECEIVED).
 *  - orders_ord_cust_idx (cust_id): "my orders" for the logged-in customer.
 *  - items_ord_idx / pickup_ord_idx / parcel_ord_idx (ord_id): every order
 *    overview, its QR and its PICKUP(row) follow an order by ord_id, so those
 *    lookups become index scans instead of table scans.
 *  - pickup_appoint_idx (appoint_id): joins an appointment back to the order
 *    it created (SRS PICKUP(ord_id, appoint_id, pay_id)).
 *
 * Purely additive: no row is inserted, updated or removed.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('orders')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->index('ord_status', 'orders_ord_status_idx');
                if (Schema::hasColumn('orders', 'cust_id')) {
                    $table->index('cust_id', 'orders_ord_cust_idx');
                }
            });
        }

        if (Schema::hasTable('items') && Schema::hasColumn('items', 'ord_id')) {
            Schema::table('items', fn (Blueprint $table) => $table->index('ord_id', 'items_ord_idx'));
        }

        if (Schema::hasTable('pickup')) {
            Schema::table('pickup', function (Blueprint $table) {
                if (Schema::hasColumn('pickup', 'ord_id')) {
                    $table->index('ord_id', 'pickup_ord_idx');
                }
                if (Schema::hasColumn('pickup', 'appoint_id')) {
                    $table->index('appoint_id', 'pickup_appoint_idx');
                }
            });
        }

        if (Schema::hasTable('parcel') && Schema::hasColumn('parcel', 'ord_id')) {
            Schema::table('parcel', fn (Blueprint $table) => $table->index('ord_id', 'parcel_ord_idx'));
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('orders')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropIndex('orders_ord_status_idx');
                if (Schema::hasColumn('orders', 'cust_id')) {
                    $table->dropIndex('orders_ord_cust_idx');
                }
            });
        }

        if (Schema::hasTable('items') && Schema::hasColumn('items', 'ord_id')) {
            Schema::table('items', fn (Blueprint $table) => $table->dropIndex('items_ord_idx'));
        }

        if (Schema::hasTable('pickup')) {
            Schema::table('pickup', function (Blueprint $table) {
                if (Schema::hasColumn('pickup', 'ord_id')) {
                    $table->dropIndex('pickup_ord_idx');
                }
                if (Schema::hasColumn('pickup', 'appoint_id')) {
                    $table->dropIndex('pickup_appoint_idx');
                }
            });
        }

        if (Schema::hasTable('parcel') && Schema::hasColumn('parcel', 'ord_id')) {
            Schema::table('parcel', fn (Blueprint $table) => $table->dropIndex('parcel_ord_idx'));
        }
    }
};
