<?php
$pdo = new PDO('pgsql:host=aws-0-ap-northeast-1.pooler.supabase.com;dbname=postgres;port=5432;client_encoding=utf8;sslmode=require', 'postgres.qxkxpyahmfdrhradnphw', 'cartniisko2026');
$tables = ['customer', 'employee', 'product', 'prodvar', 'orders', 'delivery', 'pickup', 'prodsales', 'reviews', 'custnotif', 'empnotif', 'schedules', 'bag', 'wishlist', 'appointments'];
foreach ($tables as $t) {
    echo "\n=== $t ===\n";
    try {
        $cols = $pdo->query("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = '$t' ORDER BY ordinal_position")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cols as $c) {
            echo "  " . $c['column_name'] . ' (' . $c['data_type'] . ') ' . ($c['column_default'] ?? 'null') . "\n";
        }
    } catch (Exception $e) {
        echo "  ERROR: " . $e->getMessage() . "\n";
    }
}