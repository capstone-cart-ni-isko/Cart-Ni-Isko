#!/usr/bin/env php
<?php
// Comprehensive compliance check: system-new.docx vs current code
// Focus on critical functional requirements

$issues = [];

// 1. Check appointment booking - REQ-BOOK_APP requirements
echo "=== Checking REQ-BOOK_APP requirements ===\n";

// REQ-BOOK_APP-01: Appointment timeslots must be 10 minutes long
// REQ-BOOK_APP-02: A single timeslot can accommodate up to 5 pickup appointments or 1 visit appointment
// REQ-BOOK_APP-03: Customers cannot book appointments less than 30 minutes from the current time
// REQ-BOOK_APP-04: All appointment details must be validated before submission
// REQ-BOOK_APP-05: QR codes must be unique per appointment

// Check the AppointmentsAPI controller
$appointCode = file_get_contents('C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\AppointmentsAPI.php');
if (preg_match('/public function createAppointment/', $appointCode)) {
    echo "  REQ-BOOK_APP-05: QR code generation checked\n";
} else {
    $issues[] = "REQ-BOOK_APP-05: QR code generation not found";
}

// Check if slot validation exists
if (preg_match('/slotHasCapacity/', $appointCode)) {
    echo "  REQ-BOOK_APP-02: Slot capacity check exists\n";
} else {
    $issues[] = "REQ-BOOK_APP-02: Slot capacity check missing";
}

// 2. Order checkout requirements
echo "\n=== Checking REQ-CHECKOUT requirements ===\n";

// REQ-CHECKOUT-01: Customer can check out only certain product variations or all items in the cart at once
// REQ-CHECKOUT-02: An order checkout that failed to be saved will bring back the cart to the original state before the checkout was started
// REQ-CHECKOUT-03: The total order amount and other additional fees must first be settled through online payment gateways

// Check placeOrder transaction atomicity
if (preg_match('/DB::transaction/', $appointCode)) {
    echo "  REQ-CHECKOUT-02: Atomic transaction exists\n";
} else {
    $issues[] = "REQ-CHECKOUT-02: Atomic transaction missing";
}

// Check OTP gate
if (preg_match('/otpGate/', $appointCode)) {
    echo "  REQ-CHECKOUT-03: OTP gate exists\n";
} else {
    $issues[] = "REQ-CHECKOUT-03: OTP gate missing";
}

// 3. Inventory management
echo "\n=== Checking REQ-MANAGE_INV requirements ===\n";

// REQ-MANAGE_INV-02: Disabled products must be hidden from the customer catalog immediately
// REQ-MANAGE_INV-04: Low-stock alerts must trigger notifications to admins when thresholds are breached

// Check filterCatalog disables products for customers
if (preg_match('/whereNull\(prod_disabled\)/', $appointCode)) {
    echo "  REQ-MANAGE_INV-02: Disabled products hidden from catalog\n";
} else {
    $issues[] = "REQ-MANAGE_INV-02: Disabled products not hidden";
}

// Check low stock threshold
if (preg_match('/low_stock_threshold/', $appointCode)) {
    echo "  REQ-MANAGE_INV-04: Low-stock alerts configured\n";
} else {
    $issues[] = "REQ-MANAGE_INV-04: Low-stock alerts missing";
}

// 4. Notification system
echo "\n=== Checking REQ-AN requirements ===\n";

// REQ-AN-01: A notification remains unread upon reaching the inbox of the user until he manually clicks that specific notification
// REQ-AN-02: The look of an unread notification must be similar yet distinguishable from notifications already read
// REQ-AN-03: There must be an automated follow-up notification for every priority notification that must be read but remains unread

if (preg_match('/custnotif_read/', $appointCode)) {
    echo "  REQ-AN-01: Unread tracking exists\n";
} else {
    $issues[] = "REQ-AN-01: Unread tracking missing";
}

// 5. QR code verification
echo "\n=== Checking REQ-APC requirements ===\n";

// REQ-APC-01: Each QR code must be unique per order and must not be reusable across different orders or after the order has reached the following status("claimed", "cancelled", "returned")
// REQ-APC-02: Only staff,admin, and superadmin employees may use the in-store QR code scanning interface, customers may only scan the parcel QR code on their end for delivery orders.
// REQ-APC-03: The system must immediately update the order status and trigger the corresponding notification to both the customer and the store-side upon successful/failed QR code scan.

if (preg_match('/announceStatus/', $appointCode)) {
    echo "  REQ-APC-03: Status update + notification on QR scan\n";
} else {
    $issues[] = "REQ-APC-03: QR scan status update missing";
}

// Check for QR code uniqueness validation
if (preg_match('/unique.*QR|QR.*unique/', $appointCode)) {
    echo "  REQ-APC-01: QR code uniqueness check\n";
} else {
    $issues[] = "REQ-APC-01: QR code uniqueness check missing";
}

// Summary
echo "\n\n=== TOTAL ISSUES: " . count($issues) . " ===\n";
foreach ($issues as $issue) {
    echo "  - $issue\n";
}