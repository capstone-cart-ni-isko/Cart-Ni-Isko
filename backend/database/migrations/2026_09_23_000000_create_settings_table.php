<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Creates the persisted system settings key/value store used by SettingsAPI
 * (slot capacities, low-stock threshold, operating hours, store name, ...).
 *
 * Guarded with Schema::hasTable so the migration is a no-op on connections
 * where the table already exists (same pattern as 2026_09_22_000000).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('settings')) {
            return;
        }

        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
