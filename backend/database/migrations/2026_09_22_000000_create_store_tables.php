<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Creates the Cart ni Isko business tables (customer, product, orders, wishlist, ...).
 *
 * The tables already exist in Supabase, so on that connection every Schema::hasTable()
 * check short-circuits and nothing is altered. The migration exists so that a fresh
 * database (and the sqlite :memory: database used by phpunit) gets the full schema.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('customer')) {
            Schema::create('customer', function (Blueprint $table) {
                $table->bigIncrements('cust_id');
                $table->timestampTz('cust_created')->useCurrent();
                $table->timestamp('cust_disabled')->nullable();
                $table->timestamp('cust_deleted')->nullable();
                $table->string('cust_password');
                $table->string('cust_nickname');
                $table->string('cust_pronoun');
                $table->date('cust_birthday');
                $table->string('cust_brgy');
                $table->string('cust_city');
                $table->string('cust_province');
                $table->string('cust_callcode');
                $table->string('cust_phone');
                $table->string('cust_email')->nullable();
                $table->string('cust_backupcallcode')->nullable();
                $table->string('cust_backupphone')->nullable();
                $table->string('cust_backupemail')->nullable();
                $table->string('cust_type')->default('STUDENT');
                $table->string('cust_college')->nullable();
                $table->integer('cust_wishlist')->default(0);
                $table->integer('cust_cart')->default(0);
                $table->integer('cust_orders')->default(0);
                $table->integer('cust_appoints')->default(0);
                $table->unique(['cust_email'], 'customer_cust_email_key');
                $table->unique(['cust_phone'], 'customer_cust_phone_key');
            });
        }

        if (!Schema::hasTable('employee')) {
            Schema::create('employee', function (Blueprint $table) {
                $table->bigIncrements('emp_id');
                $table->timestampTz('emp_created')->useCurrent();
                $table->timestamp('emp_disabled')->nullable();
                $table->timestamp('emp_deleted')->nullable();
                $table->string('emp_password');
                $table->string('emp_surname');
                $table->string('emp_givname');
                $table->string('emp_midname')->nullable();
                $table->string('emp_suffix')->nullable();
                $table->string('emp_studnum');
                $table->string('emp_pronoun');
                $table->date('emp_birthday');
                $table->string('emp_brgy');
                $table->string('emp_city');
                $table->string('emp_province');
                $table->string('emp_country')->default('');
                $table->string('emp_callcode')->default('+63');
                $table->string('emp_phone');
                $table->string('emp_email');
                $table->string('emp_backupcallcode')->nullable();
                $table->string('emp_backupphone')->nullable();
                $table->string('emp_backupemail')->nullable();
                $table->string('emp_type')->default('STAFF');
                $table->boolean('emp_instore')->default(false);
                $table->unique(['emp_email'], 'employee_emp_email_key');
                $table->unique(['emp_phone'], 'employee_emp_phone_key');
            });
        }

        if (!Schema::hasTable('product')) {
            Schema::create('product', function (Blueprint $table) {
                $table->bigIncrements('prod_id');
                $table->timestampTz('prod_created')->useCurrent();
                $table->timestampTz('prod_disabled')->nullable();
                $table->timestamp('prod_deleted')->nullable();
                $table->string('prod_tag');
                $table->string('prod_name');
                $table->string('prod_categ')->default('OTHERS');
                $table->decimal('prod_price', 10, 2)->default(0);
                $table->integer('prod_qty')->default(0);
                $table->text('prod_desc')->nullable();
                $table->integer('prod_peakqty')->default(0);
                $table->decimal('prod_peaksold', 10, 2)->default(0);
                $table->timestamp('prod_peakdate')->useCurrent();
                $table->integer('prod_todayqty')->default(0);
                $table->decimal('prod_todaysold', 10, 2)->default(0);
            });
        }

        if (!Schema::hasTable('orders')) {
            Schema::create('orders', function (Blueprint $table) {
                $table->bigIncrements('ord_id');
                $table->bigInteger('cust_id');
                $table->timestampTz('ord_created')->useCurrent();
                $table->timestamp('ord_completed')->nullable();
                $table->string('ord_tag');
                $table->string('ord_status')->default('TO PROCESS');
                $table->integer('ord_rating')->default(0);
                $table->text('ord_review')->nullable();
            });
        }

        if (!Schema::hasTable('items')) {
            Schema::create('items', function (Blueprint $table) {
                $table->bigIncrements('item_id');
                $table->bigInteger('ord_id');
                $table->bigInteger('prod_id');
                $table->integer('item_qty')->default(0);
                $table->decimal('item_amount', 10, 2)->default('0');
            });
        }

        if (!Schema::hasTable('wishlist')) {
            Schema::create('wishlist', function (Blueprint $table) {
                $table->bigInteger('cust_id');
                $table->bigInteger('prod_id');
                $table->timestampTz('wish_created')->useCurrent();
                $table->integer('item_qty')->default(0);
                $table->decimal('item_amount', 10, 2)->default(0);
                $table->primary(['cust_id', 'prod_id']);
            });
        }

        if (!Schema::hasTable('payment')) {
            Schema::create('payment', function (Blueprint $table) {
                $table->bigIncrements('pay_id');
                $table->timestampTz('pay_created')->useCurrent();
                $table->string('pay_ref');
                $table->decimal('pay_given', 10, 2)->default(0);
                $table->decimal('pay_due', 10, 2)->default(0);
                $table->decimal('pay_change', 10, 2)->default(0);
            });
        }

        if (!Schema::hasTable('appointments')) {
            Schema::create('appointments', function (Blueprint $table) {
                $table->bigIncrements('appoint_id');
                $table->bigInteger('cust_id');
                $table->timestampTz('appoint_created')->useCurrent();
                $table->timestamp('appoint_closed')->nullable();
                $table->timestamp('appoint_date');
                $table->string('appoint_type')->default('VISIT');
                $table->string('appoint_qr');
                $table->text('appoint_desc')->nullable();
            });
        }

        if (!Schema::hasTable('pickup')) {
            Schema::create('pickup', function (Blueprint $table) {
                $table->bigIncrements('pickup_id');
                $table->bigInteger('ord_id');
                $table->bigInteger('appoint_id');
                $table->bigInteger('pay_id');
                $table->timestamp('pickup_created');
                $table->timestamp('pickup_completed')->nullable();
            });
        }

        if (!Schema::hasTable('delivery')) {
            Schema::create('delivery', function (Blueprint $table) {
                $table->bigIncrements('delivery_id');
                $table->timestampTz('delivery_created')->useCurrent();
                $table->timestamp('delivery_closed')->nullable();
                $table->string('delivery_ref');
                $table->date('delivery_date');
                $table->string('delivery_address');
                $table->string('delivery_status');
                $table->string('delivery_qr');
                $table->text('delivery_desc')->nullable();
            });
        }

        if (!Schema::hasTable('parcel')) {
            Schema::create('parcel', function (Blueprint $table) {
                $table->bigIncrements('parcel_id');
                $table->bigInteger('ord_id');
                $table->bigInteger('delivery_id');
                $table->bigInteger('pay_id');
                $table->timestamp('parcel_created');
                $table->timestamp('parcel_completed')->nullable();
            });
        }

        if (!Schema::hasTable('custlog')) {
            Schema::create('custlog', function (Blueprint $table) {
                $table->bigIncrements('custlog_id');
                $table->bigInteger('cust_id');
                $table->timestampTz('custlog_created')->useCurrent();
                $table->text('custlog_action');
                $table->text('custlog_desc');
            });
        }

        if (!Schema::hasTable('custnotif')) {
            Schema::create('custnotif', function (Blueprint $table) {
                $table->bigIncrements('custnotif_');
                $table->bigInteger('cust_id');
                $table->timestampTz('custnotif_created')->useCurrent();
                $table->timestamp('custnotif_read')->nullable();
                $table->text('custnotif_msg');
            });
        }

        if (!Schema::hasTable('emplog')) {
            Schema::create('emplog', function (Blueprint $table) {
                $table->bigIncrements('emplog_id');
                $table->bigInteger('emp_id');
                $table->timestampTz('emplog_created')->useCurrent();
                $table->text('emplog_action');
                $table->text('emplog_desc');
            });
        }

        if (!Schema::hasTable('empnotif')) {
            Schema::create('empnotif', function (Blueprint $table) {
                $table->bigIncrements('empnotif_id');
                $table->bigInteger('emp_id');
                $table->timestampTz('empnotif_created')->useCurrent();
                $table->timestamp('empnotif_read')->nullable();
                $table->text('empnotif_msg');
            });
        }

        if (!Schema::hasTable('reports')) {
            Schema::create('reports', function (Blueprint $table) {
                $table->bigIncrements('report_id');
                $table->bigInteger('emp_id');
                $table->timestampTz('report_created')->useCurrent();
                $table->string('report_file');
                $table->text('report_title');
                $table->text('report_desc')->nullable();
            });
        }

        if (!Schema::hasTable('cache')) {
            Schema::create('cache', function (Blueprint $table) {
                $table->string('key', 255);
                $table->text('value');
                $table->integer('expiration');
            });
        }

        if (!Schema::hasTable('cache_locks')) {
            Schema::create('cache_locks', function (Blueprint $table) {
                $table->string('key', 255);
                $table->string('owner', 255);
                $table->integer('expiration');
            });
        }

        if (!Schema::hasTable('failed_jobs')) {
            Schema::create('failed_jobs', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('uuid', 255);
                $table->text('connection');
                $table->text('queue');
                $table->text('payload');
                $table->text('exception');
                $table->timestamp('failed_at')->useCurrent();
                $table->unique(['uuid'], 'failed_jobs_uuid_unique');
            });
        }

        if (!Schema::hasTable('job_batches')) {
            Schema::create('job_batches', function (Blueprint $table) {
                $table->string('id', 255);
                $table->string('name', 255);
                $table->integer('total_jobs');
                $table->integer('pending_jobs');
                $table->integer('failed_jobs');
                $table->text('failed_job_ids');
                $table->text('options')->nullable();
                $table->integer('cancelled_at')->nullable();
                $table->integer('created_at');
                $table->integer('finished_at')->nullable();
            });
        }

        if (!Schema::hasTable('jobs')) {
            Schema::create('jobs', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('queue', 255);
                $table->text('payload');
                $table->smallint('attempts');
                $table->integer('reserved_at')->nullable();
                $table->integer('available_at');
                $table->integer('created_at');
            });
        }

        if (!Schema::hasTable('migrations')) {
            Schema::create('migrations', function (Blueprint $table) {
                $table->increments('id');
                $table->string('migration', 255);
                $table->integer('batch');
            });
        }

        if (!Schema::hasTable('password_reset_tokens')) {
            Schema::create('password_reset_tokens', function (Blueprint $table) {
                $table->string('email', 255);
                $table->string('token', 255);
                $table->timestamp('created_at')->nullable();
            });
        }

        if (!Schema::hasTable('personal_access_tokens')) {
            Schema::create('personal_access_tokens', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('tokenable_type', 255);
                $table->bigInteger('tokenable_id');
                $table->text('name');
                $table->string('token', 64);
                $table->text('abilities')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamp('created_at')->nullable();
                $table->timestamp('updated_at')->nullable();
                $table->unique(['token'], 'personal_access_tokens_token_unique');
            });
        }

        if (!Schema::hasTable('sessions')) {
            Schema::create('sessions', function (Blueprint $table) {
                $table->string('id', 255);
                $table->bigInteger('user_id')->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->text('payload');
                $table->integer('last_activity');
            });
        }

        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('name', 255);
                $table->string('email', 255);
                $table->timestamp('email_verified_at')->nullable();
                $table->string('password', 255);
                $table->string('remember_token', 100)->nullable();
                $table->timestamp('created_at')->nullable();
                $table->timestamp('updated_at')->nullable();
                $table->unique(['email'], 'users_email_unique');
            });
        }

    }

    public function down(): void
    {
        // Intentionally left empty: these tables are shared with the Supabase instance.
    }
};

