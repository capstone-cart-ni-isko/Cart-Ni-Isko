<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Bring the seeded staff accounts up to the current shape.
 *
 * This migration originally rewrote the password and email of the staff
 * accounts that had been seeded by hand. A fresh database gets its staff from
 * the employee registration endpoint instead, so there is nothing to rewrite
 * here and the migration is intentionally a no-op.
 *
 * It is kept as a file so the migration history stays continuous: the name is
 * already recorded against the live database, which is what stops it from
 * running again there.
 */
return new class extends Migration
{
    public function up(): void
    {
        // No seeded staff rows exist on a fresh database.
    }

    public function down(): void
    {
        // Nothing to undo.
    }
};
