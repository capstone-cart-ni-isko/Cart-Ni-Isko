#!/usr/bin/env php
<?php
// Gap analysis: system-new.docx vs current implementation
// This script compares the schema requirements from system-new.txt 
// with the actual database columns and code implementation

$pdo = new PDO('pgsql:host=aws-0-ap-northeast-1.pooler.supabase.com;dbname=postgres;port=5432;client_encoding=utf8;sslmode=require', 'postgres.qxkxpyahmfdrhradnphw', 'cartniisko2026');

// Define system-new.docx schema requirements
$schemaRequirements = [
    'customer' => [
        'cust_id' => ['type' => 'int8', 'primary' => true, 'unique' => true, 'null' => false],
        'cust_created' => ['type' => 'timestamptz', 'default' => 'now()'],
        'cust_type' => ['type' => 'varchar', 'default' => 'guest'],
        'cust_categ' => ['type' => 'varchar', 'default' => 'student'],
        'cust_email' => ['type' => 'varchar', 'null' => true],
        'cust_phone' => ['type' => 'varchar', 'null' => true],
        'cust_password' => ['type' => 'varchar'],
        'cust_bday' => ['type' => 'date'],
        'cust_notif_appointremind' => ['type' => 'int4', 'default' => 10],
        'cust_notif_email' => ['type' => 'bool', 'default' => false],
        'cust_notif_prod' => ['type' => 'bool', 'default' => false],
        'cust_wishlist' => ['type' => 'int4', 'default' => 0],
        'cust_orders' => ['type' => 'int4', 'default' => 0],
        'cust_bag' => ['type' => 'int4', 'default' => 0],
        'cust_unread' => ['type' => 'int4', 'default' => 0],
        'cust_darkmode' => ['type' => 'bool', 'default' => false],
    ],
    'employee' => [
        'emp_id' => ['type' => 'int8', 'primary' => true, 'unique' => true, 'null' => false],
        'emp_created' => ['type' => 'timestamptz', 'default' => 'now()'],
        'emp_categ' => ['type' => 'varchar', 'default' => 'staff'],
        'emp_type' => ['type' => 'varchar', 'default' => 'STAFF'], // from business rules
        'emp_notif_appointremind' => ['type' => 'int4', 'default' => 10],
        'emp_notif_email' => ['type' => 'bool', 'default' => false],
        'emp_present' => ['type' => 'bool', 'default' => true],
        'emp_darkmode' => ['type' => 'bool', 'default' => false],
    ],
    'product' => [
        'prod_id' => ['type' => 'int8'],
        'prod_created' => ['type' => 'timestamptz', 'default' => 'now()'],
        'prod_categ' => ['type' => 'varchar', 'default' => 'others'],
        'prod_total_var' => ['type' => 'int4', 'default' => 1],
        'prod_disabled' => ['type' => 'timestamptz', 'null' => true],
        'prod_deleted' => ['type' => 'timestamptz', 'null' => true],
    ],
    'prodvar' => [
        'prodvar_id' => ['type' => 'int8'],
        'prod_id' => ['type' => 'int8'],
        'prodvar_name' => ['type' => 'varchar'],
        'prodvar_stock' => ['type' => 'int4', 'default' => 0],
        'prodvar_main' => ['type' => 'bool', 'default' => false],
        'prodvar_markup' => ['type' => 'numeric', 'default' => 0.00],
        'prodvar_preorder' => ['type' => 'bool', 'default' => false],
        'prodvar_disabled' => ['type' => 'timestamptz', 'null' => true],
        'prodvar_deleted' => ['type' => 'timestamptz', 'null' => true],
    ],
    'orders' => [
        'ord_id' => ['type' => 'int8'],
        'cust_id' => ['type' => 'int8'],
        'ord_created' => ['type' => 'timestamptz', 'default' => 'now()'],
        'ord_status' => ['type' => 'varchar', 'default' => 'processing'],
        'ord_claiming' => ['type' => 'varchar', 'default' => 'pickup'],
        'ord_amount' => ['type' => 'numeric', 'default' => 0.00],
    ],
    'pickup' => [
        'pickup_id' => ['type' => 'int8'],
        'appoint_id' => ['type' => 'int8'],
        'ord_id' => ['type' => 'int8'],
        'pickup_created' => ['type' => 'timestamptz', 'default' => 'now()'],
    ],
    'delivery' => [
        'deliver_id' => ['type' => 'int8'],
        'cust_id' => ['type' => 'int8'],
        'deliver_created' => ['type' => 'timestamptz', 'default' => 'now()'],
        'deliver_env' => ['type' => 'varchar', 'default' => 'sandbox'],
        'deliver_qr' => ['type' => 'varchar'],
    ],
    'appointments' => [
        'appoint_id' => ['type' => 'int8'],
        'cust_id' => ['type' => 'int8'],
        'emp_id' => ['type' => 'int8'],
        'appoint_type' => ['type' => 'varchar', 'default' => 'visit'],
        'appoint_status' => ['type' => 'varchar', 'default' => 'upcoming'],
        'appoint_qr' => ['type' => 'varchar'],
        'appoint_start' => ['type' => 'timestamptz'],
        'appoint_end' => ['type' => 'timestamptz'],
        'appoint_closed' => ['type' => 'timestamptz', 'null' => true],
    ],
    'bag' => [
        'bag_id' => ['type' => 'int8'],
        'cust_id' => ['type' => 'int8'],
        'prodvar_id' => ['type' => 'int8'],
        'bag_qty' => ['type' => 'int4', 'default' => 1],
        'bag_amount' => ['type' => 'numeric', 'default' => 0.00],
        'bag_placed' => ['type' => 'bool', 'default' => false],
        'bag_created' => ['type' => 'timestamptz', 'default' => 'now()'],
        'bag_deleted' => ['type' => 'timestamptz', 'null' => true],
    ],
    'wishlist' => [
        'wish_id' => ['type' => 'int8'],
        'cust_id' => ['type' => 'int8'],
        'prod_id' => ['type' => 'int8'],
        'wish_created' => ['type' => 'timestamptz', 'default' => 'now()'],
        'wish_hidden' => ['type' => 'timestamptz', 'null' => true],
    ],
];

// Get actual columns from database
$gaps = [];

foreach ($schemaRequirements as $table => $reqs) {
    echo "\n=== Checking table: $table ===\n";
    $actualCols = $pdo->query("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = '$table' ORDER BY ordinal_position")->fetchAll(PDO::FETCH_ASSOC);
    
    $actual = [];
    foreach ($actualCols as $c) {
        $actual[$c['column_name']] = [
            'type' => $c['data_type'],
            'default' => $c['column_default'] ?? 'null',
            'null' => strpos($c['data_type'], 'varchar') !== false || strpos($c['data_type'], 'timestamp') !== false || $c['column_default'] !== 'now()'
        ];
    }
    
    foreach ($reqs as $col => $req) {
        if (!isset($actual[$col])) {
            $gaps[$table][] = "MISSING: $col";
            echo "  MISSING: $col\n";
            continue;
        }
        
        $actualCol = $actual[$col];
        $issues = [];
        
        // Check type
        if (isset($req['type']) && $actualCol['type'] !== $req['type']) {
            $issues[] = "Type mismatch: expected {$req['type']}, got {$actualCol['type']}";
        }
        
        // Check default
        if (isset($req['default']) && $actualCol['default'] !== $req['default']) {
            $issues[] = "Default mismatch: expected {$req['default']}, got {$actualCol['default']}";
        }
        
        // Check nullability
        if (isset($req['null']) && $req['null'] === false && $actualCol['null'] !== false) {
            $issues[] = "Expected NOT NULL but column allows NULL";
        }
        
        if ($issues) {
            $gaps[$table][] = "$col: " . implode(', ', $issues);
            echo "  $col: " . implode(', ', $issues) . "\n";
        } else {
            echo "  $col: OK\n";
        }
    }
}

// Summary
echo "\n\n=== GAP SUMMARY ===\n";
$totalGaps = 0;
foreach ($gaps as $table => $tableGaps) {
    echo "Table $table: " . count($tableGaps) . " gaps\n";
    $totalGaps += count($tableGaps);
}
echo "Total gaps: $totalGaps\n";