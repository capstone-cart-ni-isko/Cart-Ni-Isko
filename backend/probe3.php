<?php
// Try different connection methods with cartniisko2026
$candidates = [
    ['host' => 'aws-0-ap-northeast-1.pooler.supabase.com', 'user' => 'postgres.qxkxpyahmfdrhradnphw', 'label' => 'pooler+pooleruser'],
    ['host' => 'aws-0-ap-northeast-1.pooler.supabase.com', 'user' => 'postgres', 'label' => 'pooler+postgres'],
    ['host' => 'qxkxpyahmfdrhradnphw.db.supabase.com', 'user' => 'postgres', 'label' => 'direct+postgres'],
    ['host' => 'qxkxpyahmfdrhradnphw.db.supabase.com', 'user' => 'postgres.qxkxpyahmfdrhradnphw', 'label' => 'direct+pooleruser'],
];
foreach ($candidates as $c) {
    $dsn = "pgsql:host={$c['host']};dbname=postgres;port=5432;client_encoding=utf8;sslmode=require";
    try {
        $pdo = new PDO($dsn, $c['user'], 'cartniisko2026');
        echo "SUCCESS: {$c['label']}\n";
        exit(0);
    } catch (PDOException $e) {
        echo "FAIL: {$c['label']} => " . substr(strstr($e->getMessage(), ':'), 0, 80) . "\n";
    }
}
echo "NONE WORKED\n";
