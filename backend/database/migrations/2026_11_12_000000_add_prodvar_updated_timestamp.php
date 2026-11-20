<?php

use Illuminate\Database\Migrations\Migration;

/**
 * This file was committed empty (0 bytes) in c01e9a0, which made every
 * `php artisan test` run fail with "Class AddProdvarUpdatedTimestamp not
 * found". Nothing in the app reads a `prodvar_updated` column yet, so it is a
 * no-op placeholder until the intended schema change is written here.
 */
return new class extends Migration
{
    public function up(): void
    {
    }

    public function down(): void
    {
    }
};
