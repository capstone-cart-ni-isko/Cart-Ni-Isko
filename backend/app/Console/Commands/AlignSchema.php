<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Idempotent one-shot alignment of the live Supabase schema to the SRS
 * naming (singular `appointment`, `deliver_*`, `custnotif_id`, `report_text`)
 * plus the nullability the walk-in/POS flows require. Every step is guarded,
 * so re-running the command is always a no-op.
 */
class AlignSchema extends Command
{
    protected $signature = 'schema:align';
    protected $description = 'Align live Supabase schema to SRS naming (idempotent)';

    public function handle(): int
    {
        $this->renameTable('appointments', 'appointment');

        foreach ([
            'delivery_id' => 'deliver_id',
            'delivery_created' => 'deliver_created',
            'delivery_closed' => 'deliver_deleted',
            'delivery_ref' => 'delvier_ref',
            'delivery_date' => 'deliver_date',
            'delivery_address' => 'deliver_address',
            'delivery_status' => 'deliver_status',
            'delivery_qr' => 'deliver_qr',
            'delivery_desc' => 'deliver_desc',
        ] as $from => $to) {
            $this->renameColumn('delivery', $from, $to);
        }

        $this->renameColumn('parcel', 'delivery_id', 'deliver_id');
        $this->renameColumn('custnotif', 'custnotif_', 'custnotif_id');
        $this->renameColumn('reports', 'report_desc', 'report_text');

        // Matches 2026_09_22_000000: nullable with a blank default (the POS
        // walk-in customer row omits it entirely).
        $this->addColumn('customer', "cust_country varchar null default ''", 'cust_country');

        // orders.cust_id / pickup.appoint_id are NOT NULL in the SRS dump, but
        // POS orders start anonymous (cust_id null until the Walk-in account is
        // attached at checkout) and pickup/appoint_id is optional on both
        // checkout paths, so live must relax both to keep those flows working.
        $this->makeNullable('orders', 'cust_id');
        $this->makeNullable('pickup', 'appoint_id');

        // SRS says DATETIME; live is a plain date that would truncate the ETA.
        $this->changeType('delivery', 'deliver_date', 'timestamp without time zone', 'timestamp');

        $this->info('Live schema aligned to SRS.');
        return self::SUCCESS;
    }

    private function renameTable(string $from, string $to): void
    {
        if (Schema::hasTable($from) && !Schema::hasTable($to)) {
            DB::statement("alter table \"{$from}\" rename to \"{$to}\"");
            $this->info("renamed table {$from} -> {$to}");
        }
    }

    private function renameColumn(string $table, string $from, string $to): void
    {
        if (Schema::hasTable($table) && Schema::hasColumn($table, $from) && !Schema::hasColumn($table, $to)) {
            DB::statement("alter table \"{$table}\" rename column \"{$from}\" to \"{$to}\"");
            $this->info("renamed {$table}.{$from} -> {$to}");
        }
    }

    private function addColumn(string $table, string $definition, string $column): void
    {
        if (Schema::hasTable($table) && !Schema::hasColumn($table, $column)) {
            DB::statement("alter table \"{$table}\" add column {$definition}");
            $this->info("added {$table}.{$column}");
        }
    }

    private function changeType(string $table, string $column, string $type, string $using): void
    {
        if (!Schema::hasTable($table) || !Schema::hasColumn($table, $column)) {
            return;
        }
        $current = DB::selectOne(
            "select data_type from information_schema.columns where table_schema='public' and table_name=? and column_name=?",
            [$table, $column]
        );
        $isTimestamp = $current && str_starts_with($current->data_type, 'timestamp');
        if ($current && !$isTimestamp) {
            DB::statement("alter table \"{$table}\" alter column \"{$column}\" type {$type} using \"{$column}\"::{$using}");
            $this->info("retyped {$table}.{$column} -> {$type}");
        }
    }

    private function makeNullable(string $table, string $column): void
    {
        if (!Schema::hasTable($table) || !Schema::hasColumn($table, $column)) {
            return;
        }
        $nullable = DB::selectOne(
            "select is_nullable from information_schema.columns where table_schema='public' and table_name=? and column_name=?",
            [$table, $column]
        );
        if ($nullable && $nullable->is_nullable === 'NO') {
            DB::statement("alter table \"{$table}\" alter column \"{$column}\" drop not null");
            $this->info("made {$table}.{$column} nullable");
        }
    }
}
