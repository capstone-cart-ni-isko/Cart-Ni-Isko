#!/usr/bin/env php
<?php
// Comprehensive system-new.docx compliance verification
// Checks admin side and customer side against all critical requirements

echo "=== Cart ni Isko System-new.docx Compliance Verification ===\n\n";

// Business Rules from system-new.txt
$br = [
    "1. The store is named 'Tindahan ni Isko'",
    "2. BUeños are categorized as 'student', 'alumni', or 'faculty'.",
    "3. A person is a student if he is currently enrolled at Bicol University.",
    "4. A person is an alumni if he is formerly enrolled at Bicol University regardless if he graduated or not.",
    "5. A person is a faculty if he is currently teaching at Bicol University, regardless if he is a student or an alumni.",
    "6. A customer can book zero or more appointments.",
    "7. Appointments must be categorized as 'visit' or 'pickup'.",
    "8. An appointment must belong to only one customer.",
    "9. An appointment must be facilitated by only one employee.",
    "10. An appointment must not be booked in a timeslot where there is no employee prescheduled.",
    "11. An appointment timeslot must exactly be 10 minutes long.",
    "12. A timeslot can have zero to 5 pickup appointments and only 1 visit appointment.",
    "13. A customer can add zero or more products to his bag.",
    "14. A product must have one or more product variations in the bag.",
    "15. A product variation must have one or more pieces in the bag.",
    "16. The store can have zero or more customers.",
    "17. Customers are categorized as 'BUeños' or 'guest'.",
    "18. A guest must not be a 'student', 'alumni', or 'faculty'.",
    "19. A phone number must belong to only one customer.",
    "20. A customer must have one or more addresses.",
    "21. A customer can have zero or more backup phone numbers.",
    "22. A phone number belonging to a customer can be used as a backup phone number by another customer.",
    "23. A customer can have zero or more backup email addresses.",
    "24. An email address belonging to a customer can be used as a backup email address by another customer.",
    "25. The store must have one or more employees.",
    "26. An employee must be a student.",
    "27. A Bicol University email must belong to only one employee.",
    "28. An employee can have zero or more backup phone numbers.",
    "29. A phone number belonging to an employee can be used as a backup phone number by another employee.",
    "30. An employee can have zero or more backup email addresses.",
    "31. An email address belonging to an employee can be used as a backup email address by another employee.",
    "32. Employees are categorized as 'staff', 'admin', or 'super admin'.",
    "33. The store must have one or more super admins.",
    "34. The store can have zero or more admins.",
    "35. The store can have zero or more staff.",
    "36. Only super admins can enroll, suspend, or remove an employee.",
    "37. Only super admins can change the category of an employee.",
    "38. Only super admins can preschedule and modify the current schedule of an employee.",
    "39. Only super admins can view the access log of all customers and employees.",
    "40. Only super admins can change system-wide settings.",
    "41. Only super admins and admins can add, modify, or disable products in the inventory.",
    "42. Only super admins and admins can manage preorders.",
    "43. Only super admins and admins can facilitate booked appointments.",
    "44. Only super admins and admins can facilitate walk-in orders.",
    "45. Only super admins and admins can read, approve, and delete reviews.",
    "46. An employee must be prescheduled for a minimum total of 180 minutes per week.",
    "47. A customer can place zero or more orders.",
    "48. An order must belong to only one customer.",
    "49. An order must include one or more products.",
    "50. A product must have one or more product variations in an order.",
    "51. A product variation must have one or more pieces in an order.",
    "52. Orders must be categorized as 'walk-in' or 'preorder'.",
    "53. A preorder must be claimed either by pickup or delivery.",
    "54. A preorder pickup is both an appointment and an order.",
    "55. A preorder must be paid only online.",
    "56. A preorder can still be claimed from the physical store even if the appointment or delivery is over.",
    "57. A walk-in order must be done, paid, and claimed in the physical store.",
    "58. A walk-in order must be facilitated by only one employee.",
    "59. A product must have one or more product variations.",
    "60. A product disabled in the inventory must be hidden in the catalog.",
    "61. A product tag must belong to only one product, regardless of letter capitalizations.",
    "62. A product name must belong to only one product, regardless of letter capitalizations.",
    "63. A customer can have zero or more products to his wishlist.",
    "64. A page must have one or more tabs.",
    "65. The page ribbon can be seen in different tabs, but not on a different page.",
    "66. Input validation must be realtime.",
    "67. Invalid input messages must show in real time below or beside a form field.",
    "68. There must be a working 'back' button or 'exit' button wherever necessary in the system.",
    "69. If using a 'back' button, it must be at the top left.",
    "70. If using an 'exit' button, it must be at the top right.",
    "71. The customer portal and the admin portal must be separate.",
    "72. The customer portal and the admin portal must both have a ribbon docked at the top.",
    "73. The 'Tindahan ni Isko' logo must be at the left of the ribbon.",
    "74. The search bar must be at the center of the ribbon.",
    "75. The horizontal array composed of a maximum of 5 icons must be at the right of the ribbon.",
];

// Check each business rule against the codebase
$checked = 0;
$total = count($br);
$passed = 0;
$failed = 0;

foreach ($br as $rule) {
    $checked++;
    // Simple heuristic: check if key terms exist in code/doc
    $ruleLower = strtolower($rule);
    $found = false;
    
    // Check in relevant files
    $checkFiles = [
        'C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\UserAPI.php',
        'C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\OrdersAPI.php',
        'C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\ProductsAPI.php',
        'C:\cartniisko\Cart-Ni-Isko\backend\App\Http\Controllers\AppointmentsAPI.php',
        'C:\cartniisko\Cart-Ni-Isko\frontend\src',
    ];
    
    foreach ($checkFiles as $file) {
        if (file_exists($file)) {
            $code = file_get_contents($file);
            if (stripos($code, strtolower(substr($rule, 0, 30))) !== false) {
                $found = true;
                break;
            }
        }
    }
    
    if ($found) {
        $passed++;
        echo "  [$checked/$total] ✓ $rule\n";
    } else {
        $failed++;
        echo "  [$checked/$total] ✗ $rule (not found in code)\n";
    }
}

echo "\n=== Summary ===\n";
echo "Checked: $checked/$total business rules\n";
echo "Passed: $passed\n";
echo "Failed: $failed\n";
echo "Compliance Rate: " . round(($passed/$total)*100, 1) . "%\n";