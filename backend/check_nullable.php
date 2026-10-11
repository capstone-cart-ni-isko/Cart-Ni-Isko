#!/usr/bin/env php
<?php
// Check actual NOT NULL constraints and important differences
$pdo = new PDO('pgsql:host=aws-0-ap-northeast-1.pooler.supabase.com;dbname=postgres;port=5432;client_encoding=utf8;sslmode=require', 'postgres.qxkxpyahmfdrhradnphw', 'cartniisko2026');

$tables = ['customer', 'employee', 'product', 'prodvar', 'orders', 'pickup', 'delivery', 'appointments', 'bag', 'wishlist'];
foreach ($tables as $t) {
    echo "\n=== $t - NULLABLE columns ===\n";
    $cols = $pdo->query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = '$t' ORDER BY ordinal_position")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($cols as $c) {
        if ($c['is_nullable'] === 'YES') {
            echo "  NULL: " . $c['column_name'] . "\n";
        }
    }
}