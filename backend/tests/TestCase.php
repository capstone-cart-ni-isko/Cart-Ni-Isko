<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Schema;

abstract class TestCase extends BaseTestCase
{
    /** Snapshot of storage/app/system-settings.json taken before each test. */
    private ?string $settingsSnapshot = null;
    private bool $settingsExisted = false;

    protected function setUp(): void
    {
        parent::setUp();

        $this->alignTestSchemaWithLiveSpec();
        $this->snapshotSystemSettings();
    }

    /**
     * Settings live in a JSON document under storage/app, not in a table, so a
     * test that saves one would otherwise leak into every later run. The file
     * is restored (and SystemSettings' static cache dropped) after each test.
     */
    private function snapshotSystemSettings(): void
    {
        $path = \App\Support\SystemSettings::path();
        $this->settingsExisted = file_exists($path);
        $this->settingsSnapshot = $this->settingsExisted ? file_get_contents($path) : null;
    }

    protected function tearDown(): void
    {
        $path = \App\Support\SystemSettings::path();
        \App\Support\SystemSettings::flush();

        if ($this->settingsExisted && $this->settingsSnapshot !== null) {
            file_put_contents($path, $this->settingsSnapshot);
        } elseif (file_exists($path)) {
            @unlink($path);
        }

        $this->settingsSnapshot = null;
        $this->settingsExisted = false;

        parent::tearDown();
    }

    /**
     * TEST-ONLY schema alignment.
     *
     * The live Supabase database (which matches system-new.txt) is the source
     * of truth, but the migrations predate the spec refresh, so the in-memory
     * SQLite test schema drifts from production. Everything here is guarded
     * and runs only against the test database: no migration is added, no live
     * schema or row is touched.
     *
     * Shape changes fall into two groups:
     *
     *  1. Columns live has that the migrations never created
     *     (custnotif_type, empnotif_type, prod_total_var, orders.ord_amount,
     *     items.bag_id, ...) - added directly.
     *
     *  2. Tables whose migrations froze an OLDER generation (legacy
     *     emplog_action / ord_tag / delivery_ref with NOT NULL) while the
     *     code writes the live shape - dropped and recreated with the live
     *     columns plus the legacy columns kept NULLABLE, so both live-shaped
     *     application writes and any legacy test fixture still insert.
     *
     * Same idea as the duty_shift fixture tables the feature tests already
     * create in their own setUp().
     */
    private function alignTestSchemaWithLiveSpec(): void
    {
        // ---- 1. simple column additions -----------------------------------
        if (Schema::hasTable('custnotif') && ! Schema::hasColumn('custnotif', 'custnotif_type')) {
            Schema::table('custnotif', function ($blueprint) {
                $blueprint->string('custnotif_type')->default('priority');
            });
        }

        if (Schema::hasTable('empnotif') && ! Schema::hasColumn('empnotif', 'empnotif_type')) {
            Schema::table('empnotif', function ($blueprint) {
                $blueprint->string('empnotif_type')->default('priority');
            });
        }

        if (Schema::hasTable('product') && ! Schema::hasColumn('product', 'prod_total_var')) {
            Schema::table('product', function ($blueprint) {
                $blueprint->integer('prod_total_var')->default(1);
            });
        }

        // The live EMPLOYEE table names the category `emp_categ` (system-new,
        // default 'staff'); the migration only ever created the legacy
        // `emp_type`. Controller::notifyEmployeesByType() - the low-stock,
        // roster and tracking alerts - filters on emp_categ, so without the
        // column every one of those queries died on "no such column".
        if (Schema::hasTable('employee') && ! Schema::hasColumn('employee', 'emp_categ')) {
            Schema::table('employee', function ($blueprint) {
                $blueprint->string('emp_categ')->nullable();
            });
        }

        // ---- 2. whole-table alignment --------------------------------------
        if (! Schema::hasTable('schedules')) {
            Schema::create('schedules', function ($blueprint) {
                $blueprint->bigIncrements('sched_id');
                $blueprint->bigInteger('emp_id');
                $blueprint->timestampTz('sched_time_start');
                $blueprint->timestampTz('sched_time_end');
                $blueprint->timestampTz('sched_created')->useCurrent();
                $blueprint->timestampTz('sched_disabled')->nullable();
            });
        }

        if (! Schema::hasTable('prodsales')) {
            Schema::create('prodsales', function ($blueprint) {
                $blueprint->bigIncrements('prodsales_id');
                $blueprint->bigInteger('prodvar_id');
                $blueprint->date('prodsales_date')->useCurrent();
                $blueprint->integer('prodsales_qty')->default(0);
                $blueprint->decimal('prodsales_amount', 10, 2)->default(0);
                $blueprint->integer('prodsales_bag')->default(0);
                $blueprint->integer('prodsales_cust')->default(0);
                $blueprint->integer('prodsales_guest')->default(0);
                $blueprint->integer('prodsales_walkin')->default(0);
                $blueprint->integer('prodsales_preorder')->default(0);
                $blueprint->integer('prodsales_unsold')->default(0);
                $blueprint->integer('prodsales_cancelled')->default(0);
                $blueprint->integer('prodsales_wishlist')->default(0);
                $blueprint->string('prodsales_bueno_categ')->nullable();
                $blueprint->string('prodsales_college')->nullable();
                $blueprint->timestampTz('prodsales_created')->useCurrent();
            });
        }

        // Legacy-shaped tables: recreate with the live shape. Only ever runs
        // right after migrate, so the tables are still empty.
        if (Schema::hasTable('emplog') && ! Schema::hasColumn('emplog', 'emplog_access')) {
            Schema::drop('emplog');
            Schema::create('emplog', function ($blueprint) {
                $blueprint->bigIncrements('emplog_id');
                $blueprint->bigInteger('emp_id');
                $blueprint->string('emplog_access')->default('view');
                $blueprint->string('emplog_endpoint');
                $blueprint->timestampTz('emplog_created')->useCurrent();
                // legacy generation, kept for old fixtures
                $blueprint->text('emplog_action')->nullable();
                $blueprint->text('emplog_desc')->nullable();
            });
        }

        if (Schema::hasTable('custlog') && ! Schema::hasColumn('custlog', 'custlog_access')) {
            Schema::drop('custlog');
            Schema::create('custlog', function ($blueprint) {
                $blueprint->bigIncrements('custlog_id');
                $blueprint->bigInteger('cust_id');
                $blueprint->string('custlog_access')->default('view');
                $blueprint->string('custlog_endpoint');
                $blueprint->timestampTz('custlog_created')->useCurrent();
                // legacy generation, kept for old fixtures
                $blueprint->text('custlog_action')->nullable();
                $blueprint->text('custlog_desc')->nullable();
            });
        }

        if (Schema::hasTable('orders') && ! Schema::hasColumn('orders', 'ord_amount')) {
            Schema::drop('orders');
            Schema::create('orders', function ($blueprint) {
                $blueprint->bigIncrements('ord_id');
                $blueprint->bigInteger('cust_id');
                $blueprint->decimal('ord_amount', 10, 2)->default(0);
                // Register discount (orders.ord_discount): nullable on the
                // live connection, so it is nullable here too.
                $blueprint->decimal('ord_discount', 10, 2)->nullable();
                $blueprint->string('ord_status')->default('processing');
                $blueprint->string('ord_claiming')->default('pickup');
                $blueprint->decimal('pay_received', 10, 2)->default(0);
                $blueprint->decimal('pay_change', 10, 2)->default(0);
                $blueprint->string('pay_reference')->nullable();
                $blueprint->timestampTz('ord_created')->useCurrent();
                // legacy generation, kept nullable for old fixtures
                $blueprint->string('ord_tag')->nullable();
                $blueprint->timestampTz('ord_completed')->nullable();
                $blueprint->integer('ord_rating')->nullable();
                $blueprint->text('ord_review')->nullable();
            });
        }

        if (Schema::hasTable('items') && ! Schema::hasColumn('items', 'bag_id')) {
            Schema::drop('items');
            Schema::create('items', function ($blueprint) {
                $blueprint->bigIncrements('item_id');
                $blueprint->bigInteger('ord_id');
                $blueprint->bigInteger('bag_id')->nullable();
                $blueprint->timestampTz('item_created')->useCurrent();
                // legacy generation, kept nullable for old fixtures
                $blueprint->bigInteger('prod_id')->nullable();
                $blueprint->integer('item_qty')->nullable();
                $blueprint->decimal('item_amount', 10, 2)->nullable();
            });
        }

        // The customer migration froze the PRE-system-new shape (cust_nickname,
        // cust_birthday, cust_brgy, cust_cart, ...) while the model and the live
        // table speak system-new.docx (cust_givname, cust_surname, cust_bday,
        // cust_bag, ...), so any live-shaped write - e.g. the walk-in customer
        // POS checkout creates - died on "no column named cust_givname".
        // Recreate it as the union: every live column plus the legacy ones the
        // old fixtures still send, exactly like orders/items/pickup above.
        if (Schema::hasTable('customer') && ! Schema::hasColumn('customer', 'cust_givname')) {
            Schema::drop('customer');
            Schema::create('customer', function ($blueprint) {
                $blueprint->bigIncrements('cust_id');

                // --- system-new.docx SCHEMA (live) ---
                $blueprint->timestampTz('cust_created')->useCurrent();
                $blueprint->timestamp('cust_deleted')->nullable();
                $blueprint->string('cust_password');
                $blueprint->string('cust_givname')->nullable();
                $blueprint->string('cust_surname')->nullable();
                $blueprint->string('cust_email')->nullable();
                $blueprint->string('cust_phone');
                $blueprint->string('cust_callcode')->default('+63');
                $blueprint->string('cust_pronoun')->default('they/them');
                $blueprint->string('cust_type')->default('guest');
                $blueprint->string('cust_categ')->nullable();
                $blueprint->string('cust_college')->nullable();
                $blueprint->string('cust_dept')->nullable();
                $blueprint->string('cust_address')->nullable();
                $blueprint->date('cust_bday')->nullable();
                $blueprint->string('cust_avatar')->nullable();
                $blueprint->string('cust_backup_phone')->nullable();
                $blueprint->string('cust_backup_email')->nullable();
                $blueprint->string('cust_backup_ques')->nullable();
                $blueprint->string('cust_backup_answer')->nullable();
                $blueprint->string('cust_backup_code')->nullable();
                $blueprint->boolean('cust_darkmode')->default(false);
                $blueprint->timestamp('cust_suspended')->nullable();
                $blueprint->string('cust_login_active')->nullable();
                $blueprint->timestamp('cust_login_failed')->nullable();
                $blueprint->timestamp('cust_last_logout')->nullable();
                $blueprint->integer('cust_notif_appointremind')->default(10);
                $blueprint->boolean('cust_notif_email')->default(false);
                $blueprint->boolean('cust_notif_prod')->default(false);
                $blueprint->integer('cust_appoint')->default(0);
                $blueprint->integer('cust_orders')->default(0);
                $blueprint->integer('cust_bag')->default(0);
                $blueprint->integer('cust_wishlist')->default(0);
                $blueprint->integer('cust_unread')->default(0);

                // --- legacy generation, kept nullable for old fixtures ---
                $blueprint->timestamp('cust_disabled')->nullable();
                $blueprint->string('cust_nickname')->nullable();
                $blueprint->date('cust_birthday')->nullable();
                $blueprint->string('cust_brgy')->nullable();
                $blueprint->string('cust_city')->nullable();
                $blueprint->string('cust_province')->nullable();
                $blueprint->string('cust_country')->nullable()->default('');
                $blueprint->string('cust_username')->nullable();
                $blueprint->string('cust_campus')->nullable();
                $blueprint->string('cust_course')->nullable();
                $blueprint->string('cust_year')->nullable();
                $blueprint->timestamp('cust_cred_changed')->nullable();
                $blueprint->string('cust_backupcallcode')->nullable();
                $blueprint->string('cust_backupphone')->nullable();
                $blueprint->string('cust_backupemail')->nullable();
                $blueprint->integer('cust_cart')->default(0);
                $blueprint->integer('cust_appoints')->default(0);
                $blueprint->string('cust_photo')->nullable();

                $blueprint->unique(['cust_email'], 'customer_cust_email_key');
                $blueprint->unique(['cust_phone'], 'customer_cust_phone_key');
            });
        }

        if (Schema::hasTable('pickup') && Schema::hasColumn('pickup', 'pay_id')) {
            Schema::drop('pickup');
            Schema::create('pickup', function ($blueprint) {
                $blueprint->bigIncrements('pickup_id');
                $blueprint->bigInteger('appoint_id')->nullable();
                $blueprint->bigInteger('ord_id');
                $blueprint->timestampTz('pickup_created')->useCurrent();
                // legacy generation, kept nullable for old fixtures
                $blueprint->bigInteger('pay_id')->nullable();
                $blueprint->timestampTz('pickup_completed')->nullable();
            });
        }

        if (Schema::hasTable('delivery') && ! Schema::hasColumn('delivery', 'deliver_expect')) {
            Schema::drop('delivery');
            Schema::create('delivery', function ($blueprint) {
                $blueprint->bigIncrements('deliver_id');
                $blueprint->bigInteger('ord_id');
                $blueprint->bigInteger('cust_id');
                $blueprint->string('deliver_address')->nullable();
                $blueprint->string('deliver_phone')->nullable();
                $blueprint->string('deliver_qr')->nullable();
                $blueprint->timestampTz('deliver_expect')->nullable();
                $blueprint->timestampTz('deliver_created')->useCurrent();
                $blueprint->timestampTz('deliver_end')->nullable();
                $blueprint->string('deliver_env')->nullable();
                $blueprint->string('deliver_recipient')->nullable();
                $blueprint->float('deliver_lat')->nullable();
                $blueprint->float('deliver_lng')->nullable();
                $blueprint->text('deliver_notes')->nullable();
                $blueprint->string('deliver_service')->nullable();
                $blueprint->decimal('deliver_fee_charged', 10, 2)->nullable();
                $blueprint->decimal('deliver_fee_actual', 10, 2)->nullable();
                $blueprint->timestampTz('deliver_placed')->nullable();
                $blueprint->timestampTz('deliver_pickedup')->nullable();
                $blueprint->timestampTz('deliver_completed')->nullable();
                $blueprint->string('deliver_share_link')->nullable();
                $blueprint->text('deliver_last_event')->nullable();
                // legacy generation, kept nullable for old fixtures
                $blueprint->string('delivery_ref')->nullable();
                // `schema:align` renames the pre-SRS delivery_* spellings to the
                // deliver_* names the model writes, so the fixture must carry the
                // aligned names (delivery_date/delivery_status are dead).
                $blueprint->timestamp('deliver_date')->nullable();
                $blueprint->string('deliver_status')->nullable();
                $blueprint->timestampTz('deliver_deleted')->nullable();
            });
        }
    }
}
