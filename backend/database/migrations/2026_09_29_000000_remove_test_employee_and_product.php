<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Remove the throwaway employee and product rows used while testing.
 *
 * Both were hand-inserted into the live database and removed again, so there
 * is nothing to remove on a fresh database and this migration is intentionally
 * a no-op. The employee is soft-deleted rather than dropped, per REQ-UM-03.
 *
 * It is kept as a file so the migration history stays continuous: the name is
 * already recorded against the live database, which is what stops it from
 * running again there.
 */
return new class extends Migration
{
    public function up(): void
    {
        // No test rows exist on a fresh database.
    }

    public function down(): void
    {
        // Nothing to undo.
    }
};
