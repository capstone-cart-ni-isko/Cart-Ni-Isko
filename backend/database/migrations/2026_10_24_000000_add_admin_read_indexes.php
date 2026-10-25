<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The admin console reads the whole catalog and order history on every
 * dashboard cycle, so the joins behind those reads must not fall back to
 * sequential scans:
 *
 *  - bag(prodvar_id): the bag rows for a variant, joined by the order
 *    overview (items -> bag -> prodvar -> product).
 *  - items(bag_id): groups an order's item rows back to its bag rows.
 *  - prodsales(prodvar_id): sales totals grouped per product.
 *
 * Indexes are matched by the columns they cover, not by name, because a
 * database may already carry the same index under an older or hand-made name
 * (production already has `idx_prodsales_prodvar`).
 *
 * Purely additive: no row is inserted, updated or removed.
 */
return new class extends Migration
{
    /** @var array<int, array{0:string, 1:array<int, string>, 2:string}> */
    private array $indexes = [
        ['bag', ['prodvar_id'], 'bag_prodvar_idx'],
        ['items', ['bag_id'], 'items_bag_idx'],
        ['prodsales', ['prodvar_id'], 'prodsales_prodvar_idx'],
    ];

    public function up(): void
    {
        foreach ($this->indexes as [$table, $columns, $name]) {
            $this->addIndex($table, $columns, $name);
        }
    }

    public function down(): void
    {
        foreach ($this->indexes as [$table, $columns, $name]) {
            if (!Schema::hasTable($table) || !$this->hasIndex($table, $name)) {
                continue;
            }

            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropIndex($name));
        }
    }

    private function addIndex(string $table, array $columns, string $name): void
    {
        if (!Schema::hasTable($table)) {
            return;
        }

        foreach ($columns as $column) {
            if (!Schema::hasColumn($table, $column)) {
                return;
            }
        }

        if ($this->hasIndexOn($table, $columns) || $this->hasIndex($table, $name)) {
            return;
        }

        Schema::table($table, fn (Blueprint $blueprint) => $blueprint->index($columns, $name));
    }

    private function hasIndexOn(string $table, array $columns): bool
    {
        $wanted = array_map('strtolower', $columns);

        foreach (Schema::getIndexes($table) as $index) {
            $actual = array_map('strtolower', $index['columns'] ?? []);
            if ($actual === $wanted) {
                return true;
            }
        }

        return false;
    }

    private function hasIndex(string $table, string $name): bool
    {
        foreach (Schema::getIndexes($table) as $index) {
            if (($index['name'] ?? null) === $name) {
                return true;
            }
        }

        return false;
    }
};
