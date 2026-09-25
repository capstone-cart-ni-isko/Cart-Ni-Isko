<?php
$pdo = new PDO('pgsql:host=aws-0-ap-northeast-1.pooler.supabase.com;dbname=postgres;port=5432;client_encoding=utf8;sslmode=require', 'postgres.qxkxpyahmfdrhradnphw', 'cartniisko2026');
$tables = $pdo->query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")->fetchAll(PDO::FETCH_COLUMN);
echo "Tables & row counts:\n";
foreach ($tables as $t) {
    $c = $pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn();
    echo "  $t: $c\n";
}
echo "\nSequences:\n";
foreach (['customer_cust_id_seq', 'employee_emp_id_seq'] as $s) {
    $v = $pdo->query("SELECT last_value FROM $s")->fetchColumn();
    echo "  $s last_value=$v\n";
}
echo "\nCustomer IDs: " . implode(',', $pdo->query('SELECT cust_id FROM customer ORDER BY cust_id')->fetchAll(PDO::FETCH_COLUMN)) . "\n";
echo "Employee IDs: " . implode(',', $pdo->query('SELECT emp_id FROM employee ORDER BY emp_id')->fetchAll(PDO::FETCH_COLUMN)) . "\n";