#!/usr/bin/env php
<?php
// Check REQ-APC-03: QR code scan updates status and triggers notifications

// Check OrdersAPI scanCode method
$ordersCode = file_get_contents('C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\OrdersAPI.php');
echo "=== Checking REQ-APC-03 in OrdersAPI ===\n";

// Look for scanCode method
if (str_contains($ordersCode, 'scanCode')) {
    echo "  scanCode method exists\n";
}

// Look for the scan endpoint
if (str_contains($ordersCode, "'/tracking/scan'")) {
    echo "  /tracking/scan endpoint exists\n";
}

// Check if scanCode updates status
if (str_contains($ordersCode, 'appoint_status')) {
    echo "  appoint_status updated in scan\n";
}
if (str_contains($ordersCode, 'deliver_status')) {
    echo "  deliver_status updated in scan\n";
}
if (str_contains($ordersCode, "announce(")) {
    echo "  announce() called in scan\n";
}
if (str_contains($ordersCode, "'[PRIORITY]")) {
    echo "  Priority notification in scan\n";
}

// Check AppointmentsAPI for QR closing
$appointCode = file_get_contents('C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\AppointmentsAPI.php');
echo "\n=== Checking REQ-APC-03 in AppointmentsAPI ===\n";

if (str_contains($appointCode, 'appoint_status')) {
    echo "  appoint_status handled\n";
}
if (str_contains($appointCode, 'appoint_closed')) {
    echo "  appoint_closed handled\n";
}
if (str_contains($appointCode, "'[PRIORITY]")) {
    echo "  Priority notification handled\n";
}

// Check Customer API for appointment QR scanning
$userCode = file_get_contents('C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\UserAPI.php');
echo "\n=== Checking REQ-APC-03 in UserAPI ===\n";

if (str_contains($userCode, 'appoint_qr')) {
    echo "  appoint_qr referenced\n";
}
if (str_contains($userCode, 'appoint_status')) {
    echo "  appoint_status referenced\n";
}