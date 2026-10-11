#!/usr/bin/env php
<?php
// Check REQ-MANAGE_INV-02: Disabled products hidden from catalog
$filterCode = file_get_contents('C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\ProductsAPI.php');

// Check the filterCatalog method
if (preg_match('/public function filterCatalog/', $filterCode)) {
    echo "filterCatalog method found\n";
}

// Look for the specific code that filters disabled products for customers
$hasCustomerFilter = strpos($filterCode, "whereNull('prod_disabled')") !== false;
$hasStatusActive = strpos($filterCode, "'active'") !== false;

echo "Has prod_disabled filter for customers: " . ($hasCustomerFilter ? "YES" : "NO") . "\n";
echo "Has 'active' status: " . ($hasStatusActive ? "YES" : "NO") . "\n";

// Check the exact filterCatalog code around line 663-723
$lines = explode("\n", $filterCode);
$inFilter = false;
$filterLines = 0;
foreach ($lines as $i => $line) {
    if (strpos($line, 'public function filterCatalog') !== false) {
        $inFilter = true;
    }
    if ($inFilter) {
        $filterLines++;
        if (strpos($line, "whereNull('prod_disabled')") !== false || strpos($line, "'active'") !== false || strpos($line, "'disabled'") !== false) {
            echo "  Line $filterLines: " . substr($line, 0, 100) . "\n";
        }
    }
    if ($inFilter && $filterLines > 70) break;
}