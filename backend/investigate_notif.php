#!/usr/bin/env php
<?php
// Check REQ-AN-01: Unread tracking and REQ-APC-03: QR scan status update + notification

// Check custnotif_read in the code
$allCode = file_get_contents('C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\UserAPI.php');

// Search for notification-related code using simpler methods
echo "=== Checking notifications in UserAPI ===\n";

// Look for createNotification, distributeNotifications
if (str_contains($allCode, 'createNotification')) {
    echo "  createNotification function exists\n";
}
if (str_contains($allCode, 'distributeNotifications')) {
    echo "  distributeNotifications function exists\n";
}
if (str_contains($allCode, 'custnotif_read')) {
    echo "  custnotif_read column used\n";
}
if (str_contains($allCode, 'empnotif_read')) {
    echo "  empnotif_read column used\n";
}

// Check SystemAPI for notifications
$sysCode = file_get_contents('C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\SystemAPI.php');
if (str_contains($sysCode, 'createNotification')) {
    echo "  SystemAPI createNotification exists\n";
}
if (str_contains($sysCode, 'announceStatus')) {
    echo "  SystemAPI announceStatus exists\n";
}
if (str_contains($sysCode, 'notifyCustomer')) {
    echo "  SystemAPI notifyCustomer exists\n";
}
if (str_contains($sysCode, 'announce(')) {
    echo "  SystemAPI announce method exists\n";
}

// Check OrdersAPI for announceStatus
$ordersCode = file_get_contents('C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\OrdersAPI.php');
if (str_contains($ordersCode, 'announceStatus')) {
    echo "  OrdersAPI announceStatus exists\n";
}
if (str_contains($ordersCode, 'announce(')) {
    echo "  OrdersAPI announce method exists\n";
}

// Check for notification logging
if (str_contains($ordersCode, 'logCustomer')) {
    echo "  OrdersAPI logCustomer exists\n";
}

// Check UserAPI for logCustomer
if (str_contains($allCode, 'logCustomer')) {
    echo "  UserAPI logCustomer exists\n";
}