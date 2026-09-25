<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\DutyShift;
use App\Models\EmpNotif;
use App\Models\Employee;
use App\Models\Item;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Payment;
use App\Models\Pickup;
use App\Models\Product;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Feature tests for the SRS acceptance rules implemented on the backend:
 * banned-account login (REQ-UM-02), appointment slot capacity/staffing
 * (REQ-AB-01..04 / REQ-SC-01..03), transactional checkout rollback
 * (REQ-OC-02), QR scanning transitions (REQ-APC-01/02/03), persisted
 * system settings, review purchase/approval rules (REQ-APC-01/2) and
 * the POS walk-in account (REQ-POS-01).
 */
class SrsRequirementsTest extends TestCase
{
    use RefreshDatabase;

    // Sequential counter so helper-created rows never collide on unique keys
    private int $seq = 0;

    // Cached bearer tokens per model, so repeated requests reuse one token
    private array $tokens = [];

    // ==========================================
    // FIXTURE HELPERS
    // ==========================================

    private function headers($model): array
    {
        // The sanctum guard (a RequestGuard) caches the resolved user and the
        // request it was built from for the life of the application instance,
        // and feature tests reuse that instance across requests. Dropping the
        // guards makes every request re-authenticate its own bearer token,
        // which is required whenever a test switches between identities.
        $this->app['auth']->forgetGuards();

        $key = get_class($model) . ':' . $model->getKey();
        if (!isset($this->tokens[$key])) {
            $this->tokens[$key] = $model->createToken('test')->plainTextToken;
        }

        return ['Authorization' => 'Bearer ' . $this->tokens[$key]];
    }

    private function makeCustomer(array $attributes = []): Customer
    {
        $this->seq++;

        return Customer::create(array_merge([
            'cust_created'   => now(),
            'cust_password'  => Hash::make('Password123!'),
            'cust_nickname'  => 'Tester' . $this->seq,
            'cust_pronoun'   => 'they/them',
            'cust_birthday'  => '2001-01-01',
            'cust_brgy'      => 'Sagpon',
            'cust_city'      => 'Legazpi',
            'cust_province'  => 'Albay',
            'cust_country'   => '',
            'cust_callcode'  => '+63',
            'cust_phone'     => '09' . str_pad((string) (700000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'cust_email'     => 'cust' . $this->seq . uniqid() . '@example.com',
            'cust_type'      => 'Student',
            'cust_college'   => 'BUCE',
            'cust_wishlist'  => 0,
            'cust_cart'      => 0,
            'cust_orders'    => 0,
            'cust_appoints'  => 0,
        ], $attributes));
    }

    private function makeEmployee(array $attributes = []): Employee
    {
        $this->seq++;

        return Employee::create(array_merge([
            'emp_created'   => now(),
            'emp_password'  => Hash::make('Password123!'),
            'emp_surname'   => 'Dela Cruz',
            'emp_givname'   => 'Juan',
            'emp_midname'   => '',
            'emp_suffix'    => '',
            'emp_studnum'   => '2023-' . (10000 + $this->seq),
            'emp_pronoun'   => 'they/them',
            'emp_birthday'  => '2000-01-01',
            'emp_brgy'      => 'Sagpon',
            'emp_city'      => 'Legazpi',
            'emp_province'  => 'Albay',
            'emp_country'   => '',
            'emp_callcode'  => '+63',
            'emp_phone'     => '09' . str_pad((string) (500000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'emp_email'     => 'emp' . $this->seq . uniqid() . '@bicol-u.edu.ph',
            'emp_type'      => 'STAFF',
            'emp_instore'   => 0,
        ], $attributes));
    }

    private function makeProduct(array $attributes = []): Product
    {
        $this->seq++;

        return Product::create(array_merge([
            'prod_created'   => now(),
            'prod_tag'       => 'TAG' . $this->seq . strtoupper(substr(md5(uniqid()), 0, 6)),
            'prod_name'      => 'Product ' . $this->seq . ' ' . uniqid(),
            'prod_categ'     => 'ACCESSORIES',
            'prod_price'     => 150.00,
            'prod_qty'       => 10,
            'prod_desc'      => 'Test product',
            'prod_peakqty'   => 10,
            'prod_peaksold'  => 0,
            'prod_peakdate'  => now(),
            'prod_todayqty'  => 10,
            'prod_todaysold' => 0,
        ], $attributes));
    }

    /** Pickup checkout requires a previously booked claiming appointment (REQ-OC-01). */
    private function makeClaimAppointment(Customer $customer, int $ordId): Appointment
    {
        $this->seq++;

        return Appointment::create([
            'cust_id'         => $customer->getKey(),
            'appoint_created' => now(),
            'appoint_closed'  => null,
            'appoint_date'    => now()->addDays(3)->format('Y-m-d H:00'),
            'appoint_type'    => 'CLAIM',
            'appoint_qr'      => 'APPT-' . strtoupper(substr(md5(uniqid()), 0, 12)) . '-' . $ordId,
            'appoint_desc'    => 'Pickup of order ' . $ordId,
        ]);
    }

    private function makeOrder(Customer $customer, array $attributes = []): Order
    {
        return Order::create(array_merge([
            'cust_id'       => $customer->getKey(),
            'ord_created'   => now(),
            'ord_completed' => null,
            'ord_tag'       => 'ORD-' . strtoupper(substr(md5(uniqid()), 0, 8)),
            'ord_status'    => 'TO PROCESS',
            'ord_rating'    => 0,
            'ord_review'    => null,
        ], $attributes));
    }

    // Finds one slot in a GET /appoint/slots payload by type and start time
    private function slotFor(array $slots, string $type, string $start): array
    {
        foreach ($slots as $slot) {
            if ($slot['type'] === $type && $slot['start'] === $start) {
                return $slot;
            }
        }

        throw new \RuntimeException('Slot not found: ' . $type . ' @ ' . $start);
    }

    // ==========================================
    // AUTH / LOGIN RULES (REQ-UM-02)
    // ==========================================

    public function test_banned_accounts_are_rejected_with_403_on_login()
    {
        // Disabled customer with the correct password still cannot log in
        $bannedCustomer = $this->makeCustomer(['cust_disabled' => now()]);
        $this->postJson('/api/auth/cust_login', [
            'phone'    => $bannedCustomer->cust_phone,
            'password' => 'Password123!',
        ])
            ->assertStatus(403)
            ->assertJson(['success' => false, 'message' => 'Account disabled']);

        // Soft-deleted customers are refused the same way
        $deletedCustomer = $this->makeCustomer();
        $deletedCustomer->update(['cust_deleted' => now()]);
        $this->postJson('/api/auth/cust_login', [
            'phone'    => $deletedCustomer->cust_phone,
            'password' => 'Password123!',
        ])
            ->assertStatus(403)
            ->assertJson(['success' => false, 'message' => 'Account disabled']);

        // Disabled employees are refused as well
        $bannedEmployee = $this->makeEmployee(['emp_disabled' => now()]);
        $this->postJson('/api/auth/emp_login', [
            'email'    => $bannedEmployee->emp_email,
            'password' => 'Password123!',
        ])
            ->assertStatus(403)
            ->assertJson(['success' => false, 'message' => 'Account disabled']);

        // An active account still logs in fine and receives a token
        $active = $this->makeCustomer();
        $this->postJson('/api/auth/cust_login', [
            'phone'    => $active->cust_phone,
            'password' => 'Password123!',
        ])
            ->assertStatus(200)
            ->assertJson(['success' => true]);
    }

    // ==========================================
    // ROUTE AUTH CONTRACT
    // ==========================================

    public function test_protected_routes_require_a_token_and_public_routes_do_not()
    {
        $date = now()->addDays(2)->format('Y-m-d');
        $product = $this->makeProduct();

        // Protected routes answer 401 without a bearer token
        $this->json('GET', '/api/appoint/slots', ['date' => $date])->assertStatus(401);
        $this->json('GET', '/api/notif/display', ['recipient_type' => 'customer'])->assertStatus(401);
        $this->postJson('/api/tracking/scan', ['code' => 'ANY-CODE'])->assertStatus(401);
        $this->postJson('/api/cart/add', [])->assertStatus(401);
        $this->json('PUT', '/api/settings/update', ['settings' => []])->assertStatus(401);
        $this->json('GET', '/api/wishlist/display', ['cust_id' => 1])->assertStatus(401);

        // Guest catalog + review endpoints stay public
        $this->json('GET', '/api/products/filter')->assertStatus(200)->assertJson(['success' => true]);
        $this->json('GET', '/api/products/search', ['q' => 'lanyard'])->assertStatus(200)->assertJson(['success' => true]);
        $this->json('GET', '/api/products/sort')->assertStatus(200)->assertJson(['success' => true]);
        $this->json('GET', '/api/products/view', ['prod_id' => $product->prod_id])->assertStatus(200)->assertJson(['success' => true]);
        $this->json('GET', '/api/reviews/display')->assertStatus(200)->assertJson(['success' => true]);
        $this->json('GET', '/api/reviews/score')->assertStatus(200)->assertJson(['success' => true]);
    }

    // ==========================================
    // APPOINTMENT SLOTS (REQ-AB-01..04 / REQ-SC-01..03)
    // ==========================================

    public function test_appointment_slot_grid_capacity_and_staffing_rules()
    {
        $employee = $this->makeEmployee(['emp_type' => 'ADMIN']);   // not in-store yet
        $customer = $this->makeCustomer();
        $other    = $this->makeCustomer();
        $date     = now()->addDays(5)->format('Y-m-d');

        // --- REQ-SC-02: the calendar grid renders typed increments ---
        $slots = $this->json('GET', '/api/appoint/slots', ['date' => $date], $this->headers($employee))
            ->assertStatus(200)
            ->json('data.slots');

        $claim = array_values(array_filter($slots, fn ($s) => $s['type'] === 'CLAIM'));
        $visit = array_values(array_filter($slots, fn ($s) => $s['type'] === 'VISIT'));

        $this->assertCount(20, $claim);   // 08:00-18:00 in 30-minute blocks
        $this->assertCount(60, $visit);   // 08:00-18:00 in 10-minute blocks
        $this->assertSame('08:00', substr($claim[0]['start'], 11));
        $this->assertSame('08:30', substr($claim[0]['end'], 11));
        $this->assertSame('08:10', substr($visit[0]['end'], 11));
        $this->assertSame(10, $claim[0]['capacity']);   // REQ-AB-01
        $this->assertSame(1, $visit[0]['capacity']);     // REQ-AB-02

        // --- REQ-AB-03: zero in-store employees => both types unavailable ---
        $this->assertFalse($claim[0]['available']);
        $this->assertSame('Not enough in-store employees available (minimum 1 required)', $claim[0]['reason']);
        $this->assertFalse($visit[0]['available']);
        $this->assertSame('Not enough in-store employees available (minimum 2 required)', $visit[0]['reason']);

        // --- REQ-SC-03: unavailable slots cannot be booked ---
        $this->json('POST', '/api/appoint/create', [
            'cust_id'      => $customer->cust_id,
            'appoint_date' => $date . ' 11:00',
            'appoint_type' => 'VISIT',
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJson(['success' => false, 'message' => 'Not enough in-store employees available (minimum 2 required)']);

        // One employee on a full-day shift unlocks CLAIM slots (minimum is one)
        $onDuty = $this->makeEmployee();
        DutyShift::create([
            'emp_id'      => $onDuty->emp_id,
            'shift_date'  => $date,
            'shift_start' => '08:00',
            'shift_end'   => '18:00',
            'shift_type'  => 'DESK DUTY',
        ]);

        // --- REQ-SC-01: customers always book on their own behalf ---
        // A mismatched cust_id is refused rather than silently reassigned
        $this->json('POST', '/api/appoint/create', [
            'cust_id'      => $other->cust_id,
            'appoint_date' => $date . ' 10:00',
            'appoint_type' => 'CLAIM',
        ], $this->headers($customer))
            ->assertStatus(403)
            ->assertJson(['message' => 'Customer account mismatch.']);

        $first = $this->json('POST', '/api/appoint/create', [
            'cust_id'      => $customer->cust_id,
            'appoint_date' => $date . ' 10:00',
            'appoint_type' => 'CLAIM',
        ], $this->headers($customer))
            ->assertStatus(201);
        $this->assertEquals($customer->cust_id, $first->json('data.cust_id'));

        // Fill the 10:00 CLAIM slot up to its capacity of ten (REQ-AB-01)
        for ($i = 0; $i < 9; $i++) {
            $this->json('POST', '/api/appoint/create', [
                'cust_id'      => $customer->cust_id,
                'appoint_date' => $date . ' 10:00',
                'appoint_type' => 'CLAIM',
            ], $this->headers($customer))->assertStatus(201);
        }

        // The eleventh booking is refused because the slot is full
        $this->json('POST', '/api/appoint/create', [
            'cust_id'      => $customer->cust_id,
            'appoint_date' => $date . ' 10:00',
            'appoint_type' => 'CLAIM',
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJson(['success' => false, 'message' => 'Slot fully booked']);

        // The calendar reflects the full slot for every reader
        $slots = $this->json('GET', '/api/appoint/slots', ['date' => $date], $this->headers($employee))
            ->assertStatus(200)
            ->json('data.slots');
        $full = $this->slotFor($slots, 'CLAIM', $date . ' 10:00');
        $this->assertSame(10, $full['booked']);
        $this->assertSame(10, $full['capacity']);
        $this->assertFalse($full['available']);
        $this->assertSame('Slot fully booked', $full['reason']);

        // --- REQ-AB-04: closing a booked slot notifies with a detailed reason ---
        $appointment = Appointment::where('appoint_type', 'CLAIM')->first();
        $this->json('POST', '/api/appoint/close', [
            'appoint_id' => $appointment->appoint_id,
            'reason'     => 'Store fully occupied for the university event',
        ], $this->headers($employee))
            ->assertStatus(200)
            ->assertJson(['success' => true]);

        $this->assertNotNull($appointment->fresh()->appoint_closed);
        $priorityNote = CustNotif::where('cust_id', $customer->cust_id)
            ->where('custnotif_msg', 'like', '%[PRIORITY]%')
            ->orderBy('custnotif_id')
            ->first();
        $this->assertNotNull($priorityNote);
        $this->assertStringContainsString('Store fully occupied for the university event', $priorityNote->custnotif_msg);

        // The freed slot is bookable again (closed bookings leave the count)
        $this->json('POST', '/api/appoint/create', [
            'cust_id'      => $customer->cust_id,
            'appoint_date' => $date . ' 10:00',
            'appoint_type' => 'CLAIM',
        ], $this->headers($customer))->assertStatus(201);

        // --- REQ-SC-01: customers see only their own bookings, staff the master view ---
        $this->json('GET', '/api/appoint/display', ['scope' => 'master'], $this->headers($other))
            ->assertStatus(200)
            ->assertJsonCount(0, 'data');

        $master = $this->json('GET', '/api/appoint/display', ['scope' => 'master'], $this->headers($employee))
            ->assertStatus(200)
            ->json('data');
        $this->assertSame(Appointment::count(), count($master));
    }

    // ==========================================
    // CHECKOUT TRANSACTION (REQ-OC-02)
    // ==========================================

    public function test_checkout_rolls_back_to_the_original_cart_state_when_stock_is_insufficient()
    {
        $customer = $this->makeCustomer();
        $product  = $this->makeProduct(['prod_qty' => 2]);

        // Put five units in the cart even though only two are in stock
        $cart = $this->json('POST', '/api/cart/add', [
            'cust_id'  => $customer->cust_id,
            'prod_id'  => $product->prod_id,
            'item_qty' => 5,
        ], $this->headers($customer));
        $cart->assertStatus(201);

        $order = Order::find($cart->json('data.order.ord_id'));
        $this->assertSame('TO PROCESS', $order->ord_status);
        $this->assertStringStartsWith('CART-', $order->ord_tag);
        $this->assertEquals(1, $customer->fresh()->cust_cart);

        // REQ: a pickup order must reference a booked claiming appointment
        $appointment = $this->makeClaimAppointment($customer, $order->ord_id);

        // Checkout fails on stock and must leave nothing behind
        $this->json('POST', '/api/checkout/payment', [
            'ord_id'        => $order->ord_id,
            'pay_given'     => 10000,
            'dispatch_type' => 'pickup',
            'appoint_id'    => $appointment->appoint_id,
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJson(['success' => false, 'message' => 'Insufficient stock for ' . $product->prod_name]);

        // REQ-OC-02: the cart is exactly as it was before checkout started
        $order->refresh();
        $this->assertSame('TO PROCESS', $order->ord_status);
        $this->assertStringStartsWith('CART-', $order->ord_tag);
        $this->assertEquals(2, $product->fresh()->prod_qty);
        $this->assertEquals(1, $customer->fresh()->cust_cart);
        $this->assertSame(0, Payment::count());
        $this->assertSame(0, Pickup::count());
        $this->assertSame(1, Item::where('ord_id', $order->ord_id)->count());
        $this->assertSame(0, CustNotif::where('cust_id', $customer->cust_id)->count());
    }

    public function test_successful_checkout_renames_the_cart_order_updates_stock_and_notifies()
    {
        $customer = $this->makeCustomer();
        $admin    = $this->makeEmployee(['emp_type' => 'ADMIN']);
        $product  = $this->makeProduct(['prod_qty' => 6]);

        $cart = $this->json('POST', '/api/cart/add', [
            'cust_id'  => $customer->cust_id,
            'prod_id'  => $product->prod_id,
            'item_qty' => 2,
        ], $this->headers($customer));
        $cart->assertStatus(201);
        $order = Order::find($cart->json('data.order.ord_id'));

        // REQ: a pickup order must reference a booked claiming appointment
        $appointment = $this->makeClaimAppointment($customer, $order->ord_id);

        $this->json('POST', '/api/checkout/payment', [
            'ord_id'        => $order->ord_id,
            'pay_given'     => 100000,
            'dispatch_type' => 'pickup',
            'appoint_id'    => $appointment->appoint_id,
        ], $this->headers($customer))->assertStatus(201);

        // CART-* order tag becomes ORD-* and the status moves to TO CLAIM
        $order->refresh();
        $this->assertStringStartsWith('ORD-', $order->ord_tag);
        $this->assertSame('TO CLAIM', $order->ord_status);

        $this->assertSame(1, Payment::count());
        $this->assertSame(1, Pickup::count());
        $this->assertEquals(4, $product->fresh()->prod_qty);   // 6 - 2
        $this->assertEquals(0, $customer->fresh()->cust_cart);

        // REQ-OT-01: "to claim" is exempt from regular notifications
        $customerNote = CustNotif::where('cust_id', $customer->cust_id)
            ->where('custnotif_msg', 'like', '%status changed to TO CLAIM%')
            ->first();
        $this->assertNull($customerNote);

        // REQ-IM-03: stock dropping to/below the threshold (4 <= 5) raises a
        // priority alert for admin accounts
        $adminNote = EmpNotif::where('emp_id', $admin->emp_id)
            ->where('empnotif_msg', 'like', '%[PRIORITY] Low stock%')
            ->first();
        $this->assertNotNull($adminNote);
    }

    // ==========================================
    // QR SCANNING (REQ-APC-01 / 02 / 03)
    // ==========================================

    public function test_tracking_scan_enforces_role_and_status_transitions()
    {
        $owner     = $this->makeCustomer();
        $stranger  = $this->makeCustomer();
        $employee  = $this->makeEmployee();
        $date      = now()->addDays(2)->format('Y-m-d');

        // A cart order that was never checked out (scanned via ord_tag)
        $cartOrder = $this->makeOrder($owner, ['ord_tag' => 'ORD-CART99', 'ord_status' => 'TO PROCESS']);

        // An in-store pickup order waiting to be claimed, linked to an
        // appointment QR code (appointment -> pickup -> order resolution)
        $appointment = Appointment::create([
            'cust_id'         => $owner->cust_id,
            'appoint_created' => now(),
            'appoint_closed'  => null,
            'appoint_date'    => $date . ' 09:00',
            'appoint_type'    => 'CLAIM',
            'appoint_qr'      => 'APPT-SCAN01',
            'appoint_desc'    => 'Pickup claim',
        ]);
        $payment = Payment::create([
            'pay_created' => now(),
            'pay_ref'     => 'PAY-SCAN01',
            'pay_given'   => 150.00,
            'pay_due'     => 150.00,
            'pay_change'  => 0.00,
        ]);
        $pickupOrder = $this->makeOrder($owner, ['ord_tag' => 'ORD-PICK01', 'ord_status' => 'TO CLAIM']);
        $pickup = Pickup::create([
            'ord_id'           => $pickupOrder->ord_id,
            'appoint_id'       => $appointment->appoint_id,
            'pay_id'           => $payment->pay_id,
            'pickup_created'   => now(),
            'pickup_completed' => null,
        ]);

        // A delivery order waiting for the owning customer to receive it
        // (resolved via deliver_qr -> parcel -> order)
        $delivery = Delivery::create([
            'deliver_created' => now(),
            'deliver_deleted' => null,
            'delvier_ref'     => 'DEL-SCAN01',
            'deliver_date'    => now()->addDay(),
            'deliver_address' => 'Legazpi City',
            'deliver_status'  => 'TRANSIT',
            'deliver_qr'      => 'QR-DEL-SCAN01',
        ]);
        $deliveryOrder = $this->makeOrder($owner, ['ord_tag' => 'ORD-DEL001', 'ord_status' => 'TO RECEIVE']);
        Parcel::create([
            'ord_id'           => $deliveryOrder->ord_id,
            'deliver_id'       => $delivery->deliver_id,
            'pay_id'           => $payment->pay_id,
            'parcel_created'   => now(),
            'parcel_completed' => null,
        ]);

        // No token at all -> 401
        $this->postJson('/api/tracking/scan', ['code' => 'APPT-SCAN01'])->assertStatus(401);

        // Orders still in the cart cannot be scanned yet (ord_tag lookup)
        $this->json('POST', '/api/tracking/scan', ['code' => 'ORD-CART99'], $this->headers($employee))
            ->assertStatus(409)
            ->assertJson(['message' => 'Order cannot be scanned while its status is TO PROCESS']);

        // REQ-APC-02: customers may not verify in-store claiming codes
        $this->json('POST', '/api/tracking/scan', ['code' => 'APPT-SCAN01', 'scanned_by' => 'Front desk'], $this->headers($owner))
            ->assertStatus(403)
            ->assertJson(['message' => 'Only store employees can verify in-store claiming QR codes']);

        // An employee scan moves TO CLAIM -> CLAIMED and notifies both sides
        $this->json('POST', '/api/tracking/scan', ['code' => 'APPT-SCAN01'], $this->headers($employee))
            ->assertStatus(200)
            ->assertJson(['data' => ['ord_status' => 'CLAIMED']]);

        $pickupOrder->refresh();
        $this->assertSame('CLAIMED', $pickupOrder->ord_status);
        $this->assertNotNull($pickupOrder->ord_completed);
        $this->assertNotNull($pickup->fresh()->pickup_completed);
        $this->assertNotNull($appointment->fresh()->appoint_closed);
        $this->assertNotNull(
            CustNotif::where('cust_id', $owner->cust_id)->where('custnotif_msg', 'like', '%has been claimed%')->first()
        );
        $this->assertNotNull(
            EmpNotif::where('emp_id', $employee->emp_id)->where('empnotif_msg', 'like', '%claimed via QR scan%')->first()
        );

        // REQ-APC-01: the code is no longer reusable once claimed
        $this->json('POST', '/api/tracking/scan', ['code' => 'APPT-SCAN01'], $this->headers($employee))
            ->assertStatus(409)
            ->assertJson(['message' => 'Order has already been claimed and its QR code can no longer be scanned']);

        // REQ-APC-02: the parcel QR belongs to the owning customer only
        $this->json('POST', '/api/tracking/scan', ['code' => 'QR-DEL-SCAN01'], $this->headers($stranger))
            ->assertStatus(403)
            ->assertJson(['message' => 'Only the owning customer can verify delivery QR codes']);
        $this->json('POST', '/api/tracking/scan', ['code' => 'QR-DEL-SCAN01'], $this->headers($employee))
            ->assertStatus(403);

        // The owner scan moves TO RECEIVE -> CLAIMED and marks the delivery done
        $this->json('POST', '/api/tracking/scan', ['code' => 'QR-DEL-SCAN01'], $this->headers($owner))
            ->assertStatus(200)
            ->assertJson(['message' => 'Order received successfully']);

        $deliveryOrder->refresh();
        $this->assertSame('CLAIMED', $deliveryOrder->ord_status);
        $this->assertNotNull(Parcel::where('ord_id', $deliveryOrder->ord_id)->first()->parcel_completed);
        $this->assertSame('DELIVERED', $delivery->fresh()->deliver_status);
        $this->assertNotNull(
            CustNotif::where('cust_id', $owner->cust_id)->where('custnotif_msg', 'like', '%received successfully%')->first()
        );

        // Re-scanning the finished delivery is refused too
        $this->json('POST', '/api/tracking/scan', ['code' => 'QR-DEL-SCAN01'], $this->headers($owner))
            ->assertStatus(409)
            ->assertJson(['message' => 'Order has already been claimed and its QR code can no longer be scanned']);

        // REQ-APC-03: an unknown code 404s and the store side is alerted
        $this->json('POST', '/api/tracking/scan', ['code' => 'NO-SUCH-CODE'], $this->headers($employee))
            ->assertStatus(404)
            ->assertJson(['message' => 'QR code does not match any active order']);
        $this->assertNotNull(
            EmpNotif::where('emp_id', $employee->emp_id)->where('empnotif_msg', 'like', '%Failed QR scan%')->first()
        );
    }

    // ==========================================
    // SYSTEM SETTINGS PERSISTENCE
    // ==========================================

    public function test_settings_are_persisted_and_consumed_by_the_slot_calendar()
    {
        $employee = $this->makeEmployee(['emp_type' => 'ADMIN']);
        $date     = now()->addDays(4)->format('Y-m-d');

        // Built-in defaults before anything has been stored
        $this->json('GET', '/api/settings/display', [], $this->headers($employee))
            ->assertStatus(200)
            ->assertJson(['data' => [
                'store_name'         => 'Tindahan ni Isko',
                'operating_hours'    => '08:00 - 18:00',
                'max_claiming_slots' => 10,
                'maintenance_mode'   => false,
            ]]);

        // Update persists every submitted key
        $this->json('PUT', '/api/settings/update', [
            'settings' => [
                'store_name'         => 'Isko Central Store',
                'max_claiming_slots' => 7,
                'maintenance_mode'   => true,
            ],
        ], $this->headers($employee))
            ->assertStatus(200)
            ->assertJson(['data' => [
                'store_name'         => 'Isko Central Store',
                'max_claiming_slots' => 7,
                'maintenance_mode'   => true,
            ]]);

        // A separate, later request still sees the stored values
        $this->json('GET', '/api/settings/display', [], $this->headers($employee))
            ->assertStatus(200)
            ->assertJson(['data' => [
                'store_name'      => 'Isko Central Store',
                'operating_hours' => '08:00 - 18:00',
            ]]);
        $this->assertSame('Isko Central Store', Setting::getValue('store_name'));
        $this->assertTrue(Setting::getValue('maintenance_mode'));

        // The slot calendar reads the persisted capacity (7, not the default 10)
        $slots = $this->json('GET', '/api/appoint/slots', ['date' => $date], $this->headers($employee))
            ->assertStatus(200)
            ->json('data.slots');
        $this->assertSame(7, $this->slotFor($slots, 'CLAIM', $date . ' 08:00')['capacity']);
    }

    // ==========================================
    // REVIEWS (REQ-APC-01 / REQ-APC-2)
    // ==========================================

    public function test_review_rules_purchase_uniqueness_and_approval_gating()
    {
        $customer  = $this->makeCustomer();
        $stranger  = $this->makeCustomer();
        // REQ-APC-01: reviews are approved by an admin or super admin employee
        $employee  = $this->makeEmployee(['emp_type' => 'ADMIN']);
        $product   = $this->makeProduct(['prod_qty' => 5]);

        // A cart order that was never checked out is not a purchase
        $cartOrder = $this->makeOrder($customer, ['ord_status' => 'TO PROCESS']);
        $this->json('POST', '/api/reviews/create', [
            'ord_id'     => $cartOrder->ord_id,
            'ord_rating' => 5,
            'ord_review' => 'Nice lanyard',
        ], $this->headers($customer))
            ->assertStatus(403)
            ->assertJson(['message' => 'You may only review products you have already purchased']);

        // A genuinely purchased order
        $paidOrder = $this->makeOrder($customer, ['ord_status' => 'CLAIMED']);
        Item::create([
            'ord_id'      => $paidOrder->ord_id,
            'prod_id'     => $product->prod_id,
            'item_qty'    => 1,
            'item_amount' => 150.00,
        ]);

        // Only the purchasing customer may review their order
        $this->json('POST', '/api/reviews/create', [
            'ord_id'     => $paidOrder->ord_id,
            'ord_rating' => 5,
        ], $this->headers($stranger))
            ->assertStatus(403)
            ->assertJson(['message' => 'You may only review your own orders']);

        // The submission is stored as PENDING (REQ-APC-01 approval flow)
        $this->json('POST', '/api/reviews/create', [
            'ord_id'     => $paidOrder->ord_id,
            'prod_id'    => $product->prod_id,
            'ord_rating' => 4,
            'ord_review' => 'Solid quality',
        ], $this->headers($customer))
            ->assertStatus(201)
            ->assertJson(['data' => ['status' => 'PENDING']]);
        $this->assertSame('[PENDING] Solid quality', $paidOrder->fresh()->ord_review);

        // One review per order (edits go through PUT /reviews/update)
        $this->json('POST', '/api/reviews/create', [
            'ord_id'     => $paidOrder->ord_id,
            'ord_rating' => 5,
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJson(['message' => 'You have already reviewed this order. Please edit your existing review instead.']);

        // One rating / feedback entry per product across all of the customer's orders
        $secondOrder = $this->makeOrder($customer, ['ord_status' => 'CLAIMED']);
        Item::create([
            'ord_id'      => $secondOrder->ord_id,
            'prod_id'     => $product->prod_id,
            'item_qty'    => 1,
            'item_amount' => 150.00,
        ]);
        $this->json('POST', '/api/reviews/create', [
            'ord_id'     => $secondOrder->ord_id,
            'ord_rating' => 5,
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJson(['message' => 'You have already reviewed this product. Please edit your existing review instead.']);

        // A customer who never bought the product cannot review it either
        $this->json('POST', '/api/reviews/create', [
            'prod_id'    => $product->prod_id,
            'ord_rating' => 1,
        ], $this->headers($stranger))
            ->assertStatus(403)
            ->assertJson(['message' => 'You may only review products you have already purchased']);

        // Pending reviews stay hidden from the public endpoints
        $public = $this->json('GET', '/api/reviews/display', ['prod_id' => $product->prod_id])
            ->assertStatus(200);
        $this->assertCount(0, $public->json('data'));
        $this->json('GET', '/api/reviews/score', ['prod_id' => $product->prod_id])
            ->assertStatus(200)
            ->assertJson(['data' => ['total_reviews' => 0]]);

        // Moderation is employee-only (role:admin middleware answers first)
        $this->json('POST', '/api/reviews/moderate', [
            'ord_id'  => $paidOrder->ord_id,
            'approve' => true,
        ], $this->headers($customer))
            ->assertStatus(403)
            ->assertJson(['message' => 'Employee authentication is required.']);

        // Approval flips the review public and starts it counting in the score
        $this->json('POST', '/api/reviews/moderate', [
            'ord_id'  => $paidOrder->ord_id,
            'approve' => true,
        ], $this->headers($employee))
            ->assertStatus(200)
            ->assertJson(['data' => ['status' => 'APPROVED']]);
        $this->assertSame('[APPROVED] Solid quality', $paidOrder->fresh()->ord_review);

        $approved = $this->json('GET', '/api/reviews/display', ['prod_id' => $product->prod_id])
            ->assertStatus(200)
            ->json('data');
        $this->assertCount(1, $approved);
        $this->assertSame('Solid quality', $approved[0]['ord_review']);   // marker stripped
        $this->assertSame('APPROVED', $approved[0]['status']);

        $score = $this->json('GET', '/api/reviews/score', ['prod_id' => $product->prod_id])
            ->assertStatus(200)
            ->json('data');
        $this->assertEquals(1, $score['total_reviews']);
        $this->assertEquals(4, $score['average_rating']);

        // REQ-APC-2: approved reviews can no longer be edited
        $this->json('PUT', '/api/reviews/update', [
            'ord_id'     => $paidOrder->ord_id,
            'ord_review' => 'Edited afterwards',
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJson(['message' => 'Approved reviews can no longer be edited']);

        // The customer hears about the moderation decision
        $this->assertNotNull(
            CustNotif::where('cust_id', $customer->cust_id)
                ->where('custnotif_msg', 'like', '%has been approved%')
                ->first()
        );

        // Employees can pull the pending moderation queue (now empty)
        $this->json('GET', '/api/reviews/display', ['status' => 'pending'], $this->headers($employee))
            ->assertStatus(200)
            ->assertJsonCount(0, 'data');
    }

    // ==========================================
    // POS WALK-IN SALES (REQ-POS-01)
    // ==========================================

    public function test_pos_walk_in_checkout_uses_the_shared_walk_in_account()
    {
        $employee = $this->makeEmployee(['emp_type' => 'ADMIN']);
        $product  = $this->makeProduct(['prod_qty' => 8]);

        // Ring up a POS order
        $posOrder = $this->json('POST', '/api/pos/add', [
            'prod_id'  => $product->prod_id,
            'item_qty' => 3,
        ], $this->headers($employee));
        $posOrder->assertStatus(201);
        $ordId = $posOrder->json('data.order.ord_id');

        $checkout = $this->json('POST', '/api/pos/checkout', [
            'ord_id'    => $ordId,
            'pay_given' => 1000,
        ], $this->headers($employee))
            ->assertStatus(201)
            ->assertJson(['data' => ['walk_in' => ['cust_nickname' => 'Walk-in']]]);

        // REQ-POS-01: one shared "Walk-in" customer with phone 0000000000
        $walkIn = Customer::where('cust_phone', '0000000000')->first();
        $this->assertNotNull($walkIn);
        $this->assertSame('Walk-in', $walkIn->cust_nickname);
        $this->assertEquals($walkIn->cust_id, $checkout->json('data.order.cust_id'));

        $order = Order::find($ordId);
        $this->assertSame('TO CLAIM', $order->ord_status);
        $this->assertSame(1, Payment::count());
        $this->assertEquals(5, $product->fresh()->prod_qty);   // 8 - 3

        // A second walk-in sale reuses the very same account
        $second = $this->json('POST', '/api/pos/add', [
            'prod_id'  => $product->prod_id,
            'item_qty' => 1,
        ], $this->headers($employee));
        $second->assertStatus(201);

        $this->json('POST', '/api/pos/checkout', [
            'ord_id'    => $second->json('data.order.ord_id'),
            'pay_given' => 500,
        ], $this->headers($employee))->assertStatus(201);

        $this->assertSame(1, Customer::where('cust_phone', '0000000000')->count());
    }
}
