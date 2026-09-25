<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class InspectSchema extends Command
{
    protected $signature = 'schema:inspect';
    protected $description = 'Print live table/column inventory for SRS alignment';

    public function handle(): int
    {
        $tables = DB::select("select table_name from information_schema.tables where table_schema='public' order by table_name");
        foreach ($tables as $r) {
            $this->info("TABLE: {$r->table_name}");
        }

        $cols = DB::select("select table_name, column_name, is_nullable, data_type from information_schema.columns where table_schema='public' and table_name in ('customer','employee','orders','appointment','appointments','delivery','parcel','pickup','custnotif','reports') order by table_name, ordinal_position");
        foreach ($cols as $c) {
            $this->line(sprintf('%-14s %-24s %-8s %s', $c->table_name, $c->column_name, $c->is_nullable, $c->data_type));
        }

        foreach (DB::select("select tablename, indexname, indexdef from pg_indexes where schemaname='public' and tablename in ('customer','employee','orders','pickup','parcel','delivery','appointments')") as $i) {
            $this->line("IDX: {$i->indexname} :: {$i->indexdef}");
        }
        foreach (DB::select("select conname, conrelid::regclass::text as tbl, pg_get_constraintdef(oid) as def from pg_constraint where contype='f' and connamespace='public'::regnamespace") as $f) {
            $this->line("FK: {$f->tbl} {$f->conname} {$f->def}");
        }
        foreach (DB::select("select schemaname, tablename, policyname from pg_policies where schemaname='public'") as $p) {
            $this->line("RLS: {$p->tablename}.{$p->policyname}");
        }
        foreach (DB::select("select viewname from pg_views where schemaname='public'") as $v) {
            $this->line("VIEW: {$v->viewname}");
        }
        return self::SUCCESS;
    }
}
