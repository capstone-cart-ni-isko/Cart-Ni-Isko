<?php

namespace Tests\Feature;

use App\Models\Visit;
use App\Models\Bag;
use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\EmpNotif;
use App\Models\Employee;
use App\Models\Item;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Payment;
use App\Models\Pickup;
use App\Models\Product;
use App\Models\Prodvar;
use App\Models\Review;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
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
            // The api guard is the signed `cni_token` bearer (ApiToken), not a
            // Sanctum personal access token, so the test mints one the same
            // way login does.
            $this->tokens[$key] = \App\Support\ApiToken::issue($model);
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

    /**
     * FLOW-BOOK_APP-05: POST /appoint/create only clears for a customer who
     * has cleared the phone OTP, and each booking burns that verification.
     * The booking fixtures therefore grant exactly what POST /api/otp/verify
     * writes (Controller::otpVerifiedKey - scope + purpose), so the end-to-end
     * path is still asserted on its own test below.
     */
    private function grantAppointmentOtp(Customer $customer): void
    {
        Cache::put(
            'otp:ok:cust:' . (int) $customer->cust_id . ':appointment',
            true,
            now()->addMinutes(10)
        );
    }

    /**
     * FLOW-CHECKOUT-08: the same scoped flag gates POST /api/checkout/payment
     * under the `checkout` purpose.
     */
    private function grantCheckoutOtp(Customer $customer): void
    {
        Cache::put(
            'otp:ok:cust:' . (int) $customer->cust_id . ':checkout',
            true,
            now()->addMinutes(10)
        );
    }

    /**
     * Rule 55 / REQ-CHECKOUT-03: the PWA never settles a preorder in cash, so
     * the feature tests put a gateway behind the checkout the same way the
     * deployed app does - a configured key plus a faked PayMongo API.
     *
     * @param array{status?: int, body?: array} $session
     */
    private function fakePayMongo(array $session = []): string
    {
        $secret = 'sk_test_' . str_repeat('a', 32);
        $webhookSecret = 'whsec_' . str_repeat('b', 32);

        config([
            'services.paymongo.secret_key'     => $secret,
            'services.paymongo.public_key'     => 'pk_test_' . str_repeat('c', 32),
            'services.paymongo.webhook_secret' => $webhookSecret,
            'services.frontend_url'            => 'http://localhost:5173',
        ]);

        $body = $session['body'] ?? [
            'data' => [
                'id'         => 'cs_test_session',
                'attributes' => [
                    'status'        => 'active',
                    'checkout_url'  => 'https://checkout.paymongo.com/cs_test_session',
                    'livemode'      => false,
                ],
            ],
        ];

        Http::fake([
            'api.paymongo.com/v2/checkout_sessions*' => Http::response($body, $session['status'] ?? 200),
            'api.paymongo.com/v2/checkout_sessions/*' => Http::response($body, $session['status'] ?? 200),
            'api.paymongo.com/*' => Http::response($body, $session['status'] ?? 200),
        ]);

        return $webhookSecret;
    }

    /**
     * The exact `Paymongo-Signature` PayMongo sends: `t=<ts>,v1=<hmac>` where
     * the digest covers `"{timestamp}.{raw_body}"` (PayMongoService::webhookVerify).
     */
    private function payMongoSignature(string $rawBody, string $secret, ?int $timestamp = null): string
    {
        $t   = $timestamp ?? time();
        $v1  = hash_hmac('sha256', $t . '.' . $rawBody, $secret);

        return 't=' . $t . ',v1=' . $v1;
    }

    /**
     * REQ-CUST_SIGNUP-04: the six-digit code only travels through the
     * account's own notification inbox, so the test reads it from where the
     * customer would - the newest custnotif row of that account.
     */
    private function inboxCodeFor(int $custId): string
    {
        $message = CustNotif::where('cust_id', $custId)
            ->orderByDesc('custnotif_created')
            ->orderByDesc('custnotif_id')
            ->value('custnotif_msg');

        $this->assertNotNull($message, 'No verification code reached the account inbox.');
        $this->assertMatchesRegularExpression('/\b\d{6}\b/', $message);

        preg_match('/\b(\d{6})\b/', $message, $matches);

        return $matches[1];
    }

    private function makeEmployee(array $attributes = []): Employee
    {
        $this->seq++;

        // emp_type is a legacy fixture column and is deliberately absent from
        // the model's fillable list (the live table spells it emp_categ), so
        // Employee::create() silently dropped it and every fixture employee
        // fell back to the column default 'STAFF' - which made EnsureRole
        // answer 403 on every role:admin route (POS, ...). Write it past mass
        // assignment, exactly as ShiftApiTest does.
        $data = array_merge([
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
        ], $attributes);

        // Keep the live category column in step with whatever the fixture was
        // asked for: `emp_categ` is what EnsureRole and notifyEmployeesByType
        // read on production.
        $data['emp_categ'] = $data['emp_type'] ?? 'STAFF';

        return Employee::forceCreate($data);
    }

    private function makeProduct(array $attributes = []): Product
    {
        $this->seq++;

        $product = Product::create(array_merge([
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

        // Live products always own at least their main variation - POST
        // /products/add creates one - and the register resolves every bag line
        // through prodvar, so a product with no variation can never be sold:
        // pos/add answers "is no longer offered". Seed it with the product's
        // stock so the fixtures behave like a real catalogue row.
        Prodvar::create([
            'prod_id'         => $product->prod_id,
            'prodvar_name'    => 'Default',
            'prodvar_stock'   => (int) $product->prod_qty,
            'prodvar_main'    => true,
            'prodvar_created' => now(),
        ]);

        return $product;
    }

    /**
     * A future appointment slot (the grid opens at 08:00, ten-minute blocks).
     * Everything here is booked ahead of the clock so the pickup sweep and the
     * "late scan" branch never touch a fixture.
     */
    private function futureSlot(int $daysAhead = 3, string $time = '10:00'): string
    {
        return now()->addDays($daysAhead)->format('Y-m-d') . ' ' . $time;
    }

    /**
     * A genuinely purchased order: DOMAIN 26 links an order to the products it
     * sold through `items.bag_id` -> `bag.prodvar_id`, so a review fixture has
     * to carry the bag row too - `items.prod_id` is a legacy column the live
     * path never writes.
     */
    private function makePurchasedOrder(Customer $customer, Product $product): Order
    {
        $order = $this->makeOrder($customer, ['ord_status' => 'claimed']);

        $prodvar = Prodvar::where('prod_id', $product->prod_id)->orderBy('prodvar_id')->first();
        $this->assertNotNull($prodvar, 'The product fixture must own a variation.');

        $bag = Bag::create([
            'bag_id'      => \App\Support\IdAllocator::next('bag', 'bag_id'),
            'cust_id'     => $customer->getKey(),
            'prodvar_id'  => $prodvar->prodvar_id,
            'bag_qty'     => 1,
            'bag_amount'  => (float) $product->prod_price,
            'bag_placed'  => \Illuminate\Support\Facades\DB::raw('true'),
            'bag_created' => now(),
            'bag_deleted' => null,
        ]);

        Item::create([
            'ord_id'  => $order->ord_id,
            'bag_id'  => $bag->bag_id,
        ]);

        return $order;
    }

    private function makeOrder(Customer $customer, array $attributes = []): Order
    {
        return Order::create(array_merge([
            'cust_id'       => $customer->getKey(),
            'ord_created'   => now(),
            'ord_completed' => null,
            'ord_tag'       => 'ORD-' . strtoupper(substr(md5(uniqid()), 0, 8)),
            'ord_status'    => 'processing',
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

        // Suspended employees are refused as well (emp_suspended is the live
        // column; emp_disabled no longer exists on the live employee table)
        $bannedEmployee = $this->makeEmployee(['emp_suspended' => now()]);
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

        $this->assertCount(60, $claim);   // 08:00-18:00 in 10-minute blocks (rule 11)
        $this->assertCount(60, $visit);   // 08:00-18:00 in 10-minute blocks
        $this->assertSame('08:00', substr($claim[0]['start'], 11));
        $this->assertSame('08:10', substr($claim[0]['end'], 11));
        $this->assertSame('08:10', substr($visit[0]['end'], 11));
        $this->assertSame(5, $claim[0]['capacity']);   // REQ-AB-01 / rule 12 (0-5 pickup)
        $this->assertSame(1, $visit[0]['capacity']);     // REQ-AB-02 / rule 12 (1 visit)

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

        // One in-store employee unlocks CLAIM slots (minimum is one)
        $this->makeEmployee(['emp_instore' => 1]);

        // --- REQ-SC-01: customers always book on their own behalf ---
        // A mismatched cust_id is refused rather than silently reassigned
        $this->json('POST', '/api/appoint/create', [
            'cust_id'      => $other->cust_id,
            'appoint_date' => $date . ' 10:00',
            'appoint_type' => 'CLAIM',
        ], $this->headers($customer))
            ->assertStatus(403)
            ->assertJson(['message' => 'Customer account mismatch.']);

        // FLOW-BOOK_APP-05: the booking clears only with a phone OTP behind it
        $this->grantAppointmentOtp($customer);
        $first = $this->json('POST', '/api/appoint/create', [
            'cust_id'      => $customer->cust_id,
            'appoint_date' => $date . ' 10:00',
            'appoint_type' => 'CLAIM',
        ], $this->headers($customer))
            ->assertStatus(201);
        $this->assertEquals($customer->cust_id, $first->json('data.cust_id'));

        // Fill the 10:00 CLAIM slot up to its capacity of five (rule 12)
        for ($i = 0; $i < 4; $i++) {
            // Every booking burns the verification it was made with
            $this->grantAppointmentOtp($customer);
            $this->json('POST', '/api/appoint/create', [
                'cust_id'      => $customer->cust_id,
                'appoint_date' => $date . ' 10:00',
                'appoint_type' => 'CLAIM',
            ], $this->headers($customer))->assertStatus(201);
        }

        // The sixth booking is refused because the slot is full
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
        $this->assertSame(5, $full['booked']);
        $this->assertSame(5, $full['capacity']);
        $this->assertFalse($full['available']);
        $this->assertSame('Slot fully booked', $full['reason']);

        // --- REQ-AB-04: closing a booked slot notifies with a detailed reason ---
        $appointment = Visit::where('appoint_type', 'CLAIM')->first();
        $this->json('POST', '/api/appoint/close', [
            'appoint_id' => $appointment->appoint_id,
            'reason'     => 'Store fully occupied for the university event',
        ], $this->headers($employee))
            ->assertStatus(200)
            ->assertJson(['success' => true]);

        $this->assertNotNull($appointment->fresh()->appoint_closed);
        // The close is broadcast with its reason (the booking confirmation
        // above is also a [PRIORITY] row, so the reason narrows the match)
        $priorityNote = CustNotif::where('cust_id', $customer->cust_id)
            ->where('custnotif_msg', 'like', '%Store fully occupied for the university event%')
            ->orderBy('custnotif_id')
            ->first();
        $this->assertNotNull($priorityNote);
        $this->assertStringContainsString('[PRIORITY]', $priorityNote->custnotif_msg);

        // The freed slot is bookable again (closed bookings leave the count)
        $this->grantAppointmentOtp($customer);
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
        $this->assertSame(Visit::count(), count($master));
    }

    // ==========================================
    // BOOKING OTP (FLOW-BOOK_APP-05)
    // ==========================================

    public function test_a_booking_is_refused_until_the_phone_otp_is_cleared()
    {
        $customer = $this->makeCustomer();
        $date     = now()->addDays(5)->format('Y-m-d');

        // One in-store employee unlocks CLAIM slots (REQ-AB-01)
        $this->makeEmployee(['emp_instore' => 1]);

        $first = [
            'cust_id'      => $customer->cust_id,
            'appoint_date' => $date . ' 10:00',
            'appoint_type' => 'CLAIM',
        ];
        $second = [
            'cust_id'      => $customer->cust_id,
            'appoint_date' => $date . ' 10:30',
            'appoint_type' => 'CLAIM',
        ];

        // Nothing verified yet: the save is refused outright, never half-made
        $this->json('POST', '/api/appoint/create', $first, $this->headers($customer))
            ->assertStatus(428)
            ->assertJsonPath('code', 'OTP_REQUIRED')
            ->assertJsonPath('data.purpose', 'appointment');
        $this->assertSame(0, Visit::count());

        // The code reaches the account's own inbox (REQ-CUST_SIGNUP-04)
        $this->postJson('/api/otp/issue', ['purpose' => 'appointment'], $this->headers($customer))
            ->assertStatus(200);
        $this->postJson('/api/otp/verify', [
            'purpose' => 'appointment',
            'code'    => $this->inboxCodeFor((int) $customer->cust_id),
        ], $this->headers($customer))->assertStatus(200);

        // The very same booking now saves (FLOW-BOOK_APP-05)
        $this->json('POST', '/api/appoint/create', $first, $this->headers($customer))
            ->assertStatus(201);
        $this->assertSame(1, Visit::count());

        // The verification is burned with it: the next booking needs its own
        $this->json('POST', '/api/appoint/create', $second, $this->headers($customer))
            ->assertStatus(428);
        $this->assertSame(1, Visit::count());
    }

    // ==========================================
    // CHECKOUT TRANSACTION (REQ-OC-02)
    // ==========================================

    public function test_checkout_rolls_back_to_the_original_cart_state_when_stock_is_insufficient()
    {
        $customer = $this->makeCustomer();
        // A claim slot needs one in-store employee (REQ-AB-01) and a staff
        // owner for the appointment row (appointments.emp_id).
        $this->makeEmployee(['emp_instore' => 1]);
        $product = $this->makeProduct(['prod_qty' => 2]);   // prodvar stock = 2

        // FLOW-BAG-05: the bag is a BAG row, not an order - no order exists
        // until POST /checkout/payment assembles one (FLOW-CHECKOUT-02).
        $cart = $this->json('POST', '/api/cart/add', [
            'cust_id'  => $customer->cust_id,
            'prod_id'  => $product->prod_id,
            'item_qty' => 5,
        ], $this->headers($customer));
        $cart->assertStatus(201);

        $this->assertSame(0, Order::count());
        $this->assertSame(1, $cart->json('data.cart_count'));
        $this->assertCount(1, $cart->json('data.items'));
        $this->assertEquals(750.0, (float) $cart->json('data.subtotal'));   // 150 x 5
        $this->assertEquals(1, $customer->fresh()->cust_cart);

        // Rule 55: cash at the counter is refused outright for a preorder -
        // the bag stays untouched and no order row exists.
        $this->json('POST', '/api/checkout/payment', [
            'pay_given'     => 10000,
            'dispatch_type' => 'pickup',
            'appoint_start' => $this->futureSlot(),
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJsonPath('code', 'ONLINE_PAYMENT_REQUIRED');
        $this->assertSame(0, Order::count());

        // FLOW-CHECKOUT-08: the online placement is gated by the checkout OTP
        $this->fakePayMongo();
        $this->json('POST', '/api/checkout/payment/intent', [
            'gateway'       => 'paymongo',
            'dispatch_type' => 'pickup',
            'appoint_start' => $this->futureSlot(),
        ], $this->headers($customer))
            ->assertStatus(428)
            ->assertJsonPath('code', 'OTP_REQUIRED')
            ->assertJsonPath('data.purpose', 'checkout');
        $this->assertSame(0, Order::count());

        // Checkout fails on stock and must leave nothing behind
        $this->grantCheckoutOtp($customer);
        $this->json('POST', '/api/checkout/payment/intent', [
            'gateway'       => 'paymongo',
            'dispatch_type' => 'pickup',
            'appoint_start' => $this->futureSlot(),
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJson(['success' => false, 'message' => 'Insufficient stock for '
                . $product->prod_name . ' (Default) - only 2 unit(s) remain.']);

        // REQ-OC-02: the cart is exactly as it was before checkout started
        $this->assertSame(0, Order::count());
        $this->assertSame(0, Item::count());
        $this->assertSame(0, Payment::count());
        $this->assertSame(0, Pickup::count());
        // The appointment is written inside the same transaction, so a rolled
        // back checkout never leaves a stray CLAIM slot behind.
        $this->assertSame(0, Visit::count());
        $this->assertEquals(2, (int) Prodvar::where('prod_id', $product->prod_id)->value('prodvar_stock'));
        $this->assertEquals(1, $customer->fresh()->cust_cart);
        $this->assertSame(0, CustNotif::where('cust_id', $customer->cust_id)->count());
    }

    public function test_successful_checkout_creates_the_order_deducts_stock_and_notifies()
    {
        $customer = $this->makeCustomer();
        $admin    = $this->makeEmployee(['emp_type' => 'ADMIN']);
        $this->makeEmployee(['emp_instore' => 1]);   // REQ-AB-01: one in store
        $product  = $this->makeProduct(['prod_qty' => 6]);   // prodvar stock = 6

        $cart = $this->json('POST', '/api/cart/add', [
            'cust_id'  => $customer->cust_id,
            'prod_id'  => $product->prod_id,
            'item_qty' => 2,
        ], $this->headers($customer));
        $cart->assertStatus(201);
        $this->assertSame(0, Order::count());

        // Rule 55: the preorder cannot be tendered in cash at the counter.
        $this->json('POST', '/api/checkout/payment', [
            'pay_given'     => 100000,
            'dispatch_type' => 'pickup',
            'appoint_start' => $this->futureSlot(),
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJsonPath('code', 'ONLINE_PAYMENT_REQUIRED');

        $webhookSecret = $this->fakePayMongo();

        $this->grantCheckoutOtp($customer);
        $checkout = $this->json('POST', '/api/checkout/payment/intent', [
            'gateway'       => 'paymongo',
            'dispatch_type' => 'pickup',
            'appoint_start' => $this->futureSlot(),
        ], $this->headers($customer))->assertStatus(201);

        // The browser is sent to PayMongo's hosted page and told where it came
        // back to - the customer is never asked for cash afterwards.
        $this->assertNotEmpty($checkout->json('data.checkout_url'));
        $this->assertSame('order:' . $checkout->json('data.ord_id'), $checkout->json('data.reference'));

        // FLOW-CHECKOUT-02: one order, one payment, one pickup row and the
        // auto-booked CLAIM appointment the pickup hangs off.
        $order = Order::where('cust_id', $customer->cust_id)->first();
        $this->assertNotNull($order);
        // The order waits for the store to release it - a placed order is not
        // claimable yet (processing -> to claim -> claimed).
        $this->assertSame('processing', $order->ord_status);
        $this->assertSame('pickup', $order->ord_claiming);
        // The receipt reference is the hosted checkout session the webhook
        // echoes back (REQ-CHECKOUT-03).
        $this->assertSame('cs_test_session', (string) $order->pay_reference);
        $this->assertSame(0.0, (float) $order->pay_received);   // not settled yet
        $this->assertSame(0, (int) $checkout->json('data.cart_count'));

        $this->assertSame(1, Payment::count());
        $this->assertSame(1, Pickup::count());
        $this->assertSame(1, Item::where('ord_id', $order->ord_id)->count());

        $pickup    = Pickup::where('ord_id', $order->ord_id)->first();
        $appointment = Visit::find($pickup->appoint_id);
        $this->assertNotNull($appointment);
        $this->assertSame('CLAIM', $appointment->appoint_type);
        $this->assertSame('upcoming', $appointment->appoint_status);
        $this->assertNotNull($appointment->appoint_qr);
        $this->assertTrue($appointment->appoint_start->isFuture());

        // REQ-WALKIN-03 / REQ-CHECKOUT-02: the variation stock is the truth
        $this->assertEquals(4, (int) Prodvar::where('prod_id', $product->prod_id)->value('prodvar_stock'));
        $this->assertEquals(1, (int) $customer->fresh()->cust_orders);   // REQ-BAG-03 counter

        // REQ-BAG-03: the bag badge mirrors the live bag line count, so the
        // next cart read reports (and re-syncs) an empty bag.
        $this->json('GET', '/api/cart/display', ['scope' => 'bag'], $this->headers($customer))
            ->assertStatus(200)
            ->assertJson(['data' => ['cart_count' => 0]]);
        $this->assertEquals(0, $customer->fresh()->cust_cart);

        // FLOW-CHECKOUT-09: the customer is told the order landed
        $this->assertNotNull(
            CustNotif::where('cust_id', $customer->cust_id)
                ->where('custnotif_msg', 'like', '%has been placed%')
                ->first()
        );

        // REQ-IM-03: stock dropping to/below the threshold (4 <= 5) raises a
        // priority alert for admin accounts
        $this->assertNotNull(
            EmpNotif::where('emp_id', $admin->emp_id)
                ->where('empnotif_msg', 'like', '%[PRIORITY] Low stock%')
                ->first()
        );

        // REQ-CHECKOUT-03: only the signed gateway webhook settles the order.
        // The return-URL poll (POST /checkout/payment/status) asks PayMongo
        // the same question and settles identically when the push is late.
        $raw = json_encode([
            'data' => [
                'id'         => 'evt_test_paid',
                'type'       => 'checkout_session.payment.paid',
                'attributes' => [
                    'reference_number' => 'order:' . $order->ord_id,
                    'status'           => 'paid',
                ],
            ],
        ], JSON_UNESCAPED_SLASHES);

        // An unsigned push is refused - money is never taken on trust.
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Content-Type' => 'application/json'])
            ->postJson('/api/checkout/payment/webhook', json_decode($raw, true))
            ->assertStatus(403);
        $this->assertSame(0.0, (float) $order->fresh()->pay_received);

        $this->withHeaders([
            'Content-Type'           => 'application/json',
            'Paymongo-Signature'     => $this->payMongoSignature($raw, $webhookSecret),
        ])->postJson('/api/checkout/payment/webhook', json_decode($raw, true))
            ->assertStatus(200);

        $order->refresh();
        $this->assertSame('processing', $order->ord_status);
        $this->assertEquals((float) $order->ord_amount, (float) $order->pay_received);
        $this->assertNotNull(
            CustNotif::where('cust_id', $customer->cust_id)
                ->where('custnotif_msg', 'like', '%Payment confirmed%')
                ->first()
        );

        // The same webhook again is idempotent: no double settlement.
        $this->withHeaders([
            'Content-Type'           => 'application/json',
            'Paymongo-Signature'     => $this->payMongoSignature($raw, $webhookSecret),
        ])->postJson('/api/checkout/payment/webhook', json_decode($raw, true))
            ->assertStatus(200);
        $this->assertEquals((float) $order->ord_amount, (float) $order->fresh()->pay_received);
        $this->assertSame(1, Payment::count());
    }

    // ==========================================
    // QR SCANNING (REQ-APC-01 / 02 / 03)
    // ==========================================

    public function test_tracking_scan_enforces_role_and_status_transitions()
    {
        $owner     = $this->makeCustomer();
        $stranger  = $this->makeCustomer();
        $employee  = $this->makeEmployee();

        // A checkout that is still being processed: it already owns its pickup
        // rows and its receipt reference, but nobody may hand it over yet.
        $processingOrder = $this->makeOrder($owner, [
            'ord_status'    => 'processing',
            'pay_reference' => 'PAY-PROC01',
        ]);
        $processingVisit = Visit::create([
            'cust_id'         => $owner->cust_id,
            'appoint_type'    => 'CLAIM',
            'appoint_status'  => 'upcoming',
            'appoint_qr'      => 'APPT-PROC01',
            'appoint_start'   => now()->addDays(2)->setTime(9, 0),
            'appoint_end'     => now()->addDays(2)->setTime(9, 10),
            'appoint_created' => now(),
        ]);
        Pickup::create([
            'ord_id'         => $processingOrder->ord_id,
            'appoint_id'     => $processingVisit->appoint_id,
            'pickup_created' => now(),
        ]);

        // An in-store pickup order waiting to be claimed, linked to an
        // appointment QR code (appointment -> pickup -> order resolution)
        $appointment = Visit::create([
            'cust_id'         => $owner->cust_id,
            'appoint_type'    => 'CLAIM',
            'appoint_status'  => 'upcoming',
            'appoint_qr'      => 'APPT-SCAN01',
            'appoint_start'   => now()->addDays(2)->setTime(10, 0),
            'appoint_end'     => now()->addDays(2)->setTime(10, 10),
            'appoint_created' => now(),
        ]);
        $payment = Payment::create([
            'pay_created' => now(),
            'pay_ref'     => 'PAY-SCAN01',
            'pay_given'   => 150.00,
            'pay_due'     => 150.00,
            'pay_change'  => 0.00,
        ]);
        $pickupOrder = $this->makeOrder($owner, [
            'ord_status'    => 'to claim',
            'pay_reference' => 'PAY-SCAN01',
        ]);
        Pickup::create([
            'ord_id'         => $pickupOrder->ord_id,
            'appoint_id'     => $appointment->appoint_id,
            'pay_id'         => $payment->pay_id,
            'pickup_created' => now(),
        ]);

        // A delivery order waiting for the owning customer to receive it
        // (resolved via deliver_qr -> order)
        $deliveryOrder = $this->makeOrder($owner, [
            'ord_status'    => 'to receive',
            'ord_claiming'  => 'delivery',
        ]);
        $delivery = Delivery::create([
            'ord_id'          => $deliveryOrder->ord_id,
            'cust_id'         => $owner->cust_id,
            'deliver_address' => 'Legazpi City',
            'deliver_qr'      => 'QR-DEL-SCAN01',
            'deliver_created' => now(),
        ]);
        Parcel::create([
            'ord_id'         => $deliveryOrder->ord_id,
            'deliver_id'     => $delivery->deliver_id,
            'pay_id'         => $payment->pay_id,
            'parcel_created' => now(),
        ]);

        // No token at all -> 401
        $this->postJson('/api/tracking/scan', ['code' => 'APPT-SCAN01'])->assertStatus(401);

        // REQ-APC-01: an order still being prepared cannot be handed over yet
        // (the receipt reference resolves it, so ord_tag is never a scan key)
        $this->json('POST', '/api/tracking/scan', ['code' => 'PAY-PROC01'], $this->headers($employee))
            ->assertStatus(409)
            ->assertJson(['message' => 'Order cannot be scanned while its status is processing']);

        // REQ-ORD_CLAIM-02: the pickup code belongs to employees or the owner
        $this->json('POST', '/api/tracking/scan', ['code' => 'APPT-SCAN01'], $this->headers($stranger))
            ->assertStatus(403)
            ->assertJson(['message' => 'Only store employees or the owning customer can verify pickup QR codes']);

        // An employee scan moves to claim -> claimed and notifies both sides
        $claim = $this->json('POST', '/api/tracking/scan', ['code' => 'APPT-SCAN01'], $this->headers($employee))
            ->assertStatus(200)
            ->assertJson(['data' => ['ord_status' => 'claimed']]);

        $pickupOrder->refresh();
        $this->assertSame('claimed', $pickupOrder->ord_status);
        $this->assertNotNull($appointment->fresh()->appoint_closed);
        $this->assertSame('done', $appointment->fresh()->appoint_status);
        // The claim moment is read back off the appointment (pickupPayload
        // derives the legacy `pickup_completed` column from appoint_closed)
        $this->assertNotNull($claim->json('data.pickup.pickup_completed'));
        // FLOW-ORD_CLAIM-03: the code is spent the moment it is used
        $this->assertNull($appointment->fresh()->appoint_qr);
        $this->assertNotNull(
            CustNotif::where('cust_id', $owner->cust_id)->where('custnotif_msg', 'like', '%has been claimed%')->first()
        );
        $this->assertNotNull(
            EmpNotif::where('emp_id', $employee->emp_id)->where('empnotif_msg', 'like', '%claimed via QR scan%')->first()
        );

        // REQ-APC-01: the appointment code is gone, and the receipt reference
        // behind it refuses the same way
        $this->json('POST', '/api/tracking/scan', ['code' => 'APPT-SCAN01'], $this->headers($employee))
            ->assertStatus(404);
        $this->json('POST', '/api/tracking/scan', ['code' => 'PAY-SCAN01'], $this->headers($employee))
            ->assertStatus(409)
            ->assertJson(['message' => 'Order has already been claimed and its QR code can no longer be scanned']);

        // REQ-APC-02: the parcel QR belongs to the owning customer only
        $this->json('POST', '/api/tracking/scan', ['code' => 'QR-DEL-SCAN01'], $this->headers($stranger))
            ->assertStatus(403)
            ->assertJson(['message' => 'Only the owning customer can verify delivery QR codes']);
        $this->json('POST', '/api/tracking/scan', ['code' => 'QR-DEL-SCAN01'], $this->headers($employee))
            ->assertStatus(403)
            ->assertJson(['message' => 'Only the owning customer can verify delivery QR codes']);

        // The owner scan stamps the delivery receipt and marks the order done
        $this->json('POST', '/api/tracking/scan', ['code' => 'QR-DEL-SCAN01'], $this->headers($owner))
            ->assertStatus(200)
            ->assertJson(['message' => 'Order received successfully']);

        $deliveryOrder->refresh();
        $this->assertSame('received', $deliveryOrder->ord_status);
        // FLOW-ORD_CLAIM-08: the receipt stamp is `deliver_end`
        $this->assertNotNull($delivery->fresh()->deliver_end);
        $this->assertNotNull(
            CustNotif::where('cust_id', $owner->cust_id)->where('custnotif_msg', 'like', '%received successfully%')->first()
        );

        // Re-scanning the finished delivery is refused too
        $this->json('POST', '/api/tracking/scan', ['code' => 'QR-DEL-SCAN01'], $this->headers($owner))
            ->assertStatus(409)
            ->assertJson(['message' => 'Order has already been received and its QR code can no longer be scanned']);

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
        // D1: system-wide values are super-admin only
        $super     = $this->makeEmployee(['emp_type' => 'SUPER ADMIN']);
        $admin     = $this->makeEmployee(['emp_type' => 'ADMIN']);
        $date      = now()->addDays(4)->format('Y-m-d');

        // Built-in defaults before anything has been stored
        $this->json('GET', '/api/settings/display', [], $this->headers($super))
            ->assertStatus(200)
            ->assertJson(['data' => [
                'store_name'         => 'Tindahan ni Isko',
                'operating_hours'    => '08:00 - 18:00',
                'max_claiming_slots' => 10,
                'maintenance_mode'   => false,
            ]]);

        // An ordinary administrator may not touch the system-wide document
        $this->json('PUT', '/api/settings/update', [
            'settings' => ['store_name' => 'Not Allowed'],
        ], $this->headers($admin))
            ->assertStatus(403)
            ->assertJson(['message' => 'Only super admin employees may perform this action']);
        $this->assertSame('Tindahan ni Isko', Setting::getValue('store_name'));

        // Update persists every submitted key
        $this->json('PUT', '/api/settings/update', [
            'settings' => [
                'store_name'          => 'Isko Central Store',
                'max_claiming_slots'  => 7,
                'maintenance_mode'    => true,
                // The slot calendar caps the configured CLAIM capacity at 5
                // (business rule 12), so 3 is a visible change from the 5
                // the grid opens with.
                'pickup_slot_capacity'=> 3,
            ],
        ], $this->headers($super))
            ->assertStatus(200)
            ->assertJson(['data' => [
                'store_name'         => 'Isko Central Store',
                'max_claiming_slots' => 7,
                'maintenance_mode'   => true,
            ]]);

        // A separate, later request still sees the stored values
        $this->json('GET', '/api/settings/display', [], $this->headers($super))
            ->assertStatus(200)
            ->assertJson(['data' => [
                'store_name'      => 'Isko Central Store',
                'operating_hours' => '08:00 - 18:00',
            ]]);
        $this->assertSame('Isko Central Store', Setting::getValue('store_name'));
        $this->assertTrue((bool) Setting::getValue('maintenance_mode'));
        $this->assertSame(3, (int) Setting::getValue('pickup_slot_capacity'));

        // The slot calendar reads the persisted capacity (3, not the 5 default)
        $slots = $this->json('GET', '/api/appoint/slots', ['date' => $date], $this->headers($super))
            ->assertStatus(200)
            ->json('data.slots');
        $claim = $this->slotFor($slots, 'CLAIM', $date . ' 08:00');
        $this->assertSame(3, $claim['capacity']);
        // Business rule 12: a slot never holds more than one visit
        $this->assertSame(1, $this->slotFor($slots, 'VISIT', $date . ' 08:00')['capacity']);
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
        $cartOrder = $this->makeOrder($customer, ['ord_status' => 'processing']);
        $this->json('POST', '/api/reviews/create', [
            'ord_id'     => $cartOrder->ord_id,
            'ord_rating' => 5,
            'ord_review' => 'Nice lanyard',
        ], $this->headers($customer))
            ->assertStatus(403)
            ->assertJson(['message' => 'You may only review products you have already purchased']);

        // A genuinely purchased order (items -> bag -> prodvar)
        $paidOrder = $this->makePurchasedOrder($customer, $product);

        // Only the purchasing customer may review their order
        $this->json('POST', '/api/reviews/create', [
            'ord_id'     => $paidOrder->ord_id,
            'ord_rating' => 5,
        ], $this->headers($stranger))
            ->assertStatus(403)
            ->assertJson(['message' => 'You may only review your own orders']);

        // The submission is stored as pending (REQ-APC-01 approval flow)
        $this->json('POST', '/api/reviews/create', [
            'ord_id'     => $paidOrder->ord_id,
            'prod_id'    => $product->prod_id,
            'ord_rating' => 4,
            'ord_review' => 'Solid quality',
        ], $this->headers($customer))
            ->assertStatus(201)
            ->assertJson(['data' => ['status' => 'pending', 'rating' => 4, 'message' => 'Solid quality']]);

        $review = Review::where('cust_id', $customer->cust_id)
            ->where('prod_id', $product->prod_id)
            ->first();
        $this->assertNotNull($review);
        // The rating travels inside rev_msg as a leading "<rating>|" token
        $this->assertSame('4|Solid quality', $review->rev_msg);
        $this->assertNull($review->rev_approved);
        // Reviews are their own rows: the order is never rewritten
        $this->assertNull($paidOrder->fresh()->ord_review);

        // One review per customer per product (edits go through
        // PUT /reviews/update, and the handle may be any order of theirs)
        $this->json('POST', '/api/reviews/create', [
            'ord_id'     => $paidOrder->ord_id,
            'ord_rating' => 5,
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJson(['message' => 'You have already reviewed this product. Please edit your existing review instead.']);

        // One rating / feedback entry per product across all of the customer's orders
        $secondOrder = $this->makePurchasedOrder($customer, $product);
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
            ->assertJson(['data' => ['status' => 'approved']]);
        $this->assertNotNull($review->fresh()->rev_approved);
        $this->assertSame('4|Solid quality', $review->fresh()->rev_msg);

        $approved = $this->json('GET', '/api/reviews/display', ['prod_id' => $product->prod_id])
            ->assertStatus(200)
            ->json('data');
        $this->assertCount(1, $approved);
        $this->assertSame('Solid quality', $approved[0]['message']);   // token decoded
        $this->assertSame(4, $approved[0]['rating']);
        $this->assertSame('approved', $approved[0]['status']);

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

    public function test_profile_order_and_appointment_scope_contracts()
    {
        $customer = $this->makeCustomer();
        $other = $this->makeCustomer();

        // A profile save may only ever touch the caller's own row
        $this->putJson('/api/accounts/update', [
            'account_type' => 'customer',
            'user_id' => $other->cust_id,
            'cust_nickname' => 'Not Allowed',
        ], $this->headers($customer))->assertStatus(403);

        $this->putJson('/api/accounts/update', [
            'account_type' => 'customer',
            'user_id' => $customer->cust_id,
            'cust_email' => 'not-an-email',
        ], $this->headers($customer))->assertStatus(422);

        // REQ-CUST_PROF-01: cust_email / cust_type are never written from a
        // profile save, so an email round-trip saves cleanly and a changed
        // one is simply dropped rather than 409-ing.
        $this->putJson('/api/accounts/update', [
            'account_type' => 'customer',
            'user_id' => $customer->cust_id,
            'cust_email' => 'someone.else@example.com',
        ], $this->headers($customer))->assertStatus(422);

        // Ordinary profile changes remain available
        $this->putJson('/api/accounts/update', [
            'account_type' => 'customer',
            'user_id' => $customer->cust_id,
            'cust_nickname' => 'Updated Nickname',
        ], $this->headers($customer))->assertStatus(200);
        $customer->refresh();
        $this->assertSame('Updated', $customer->cust_givname);
        $this->assertSame('Nickname', $customer->cust_surname);

        // The live SCHEMA carries no cust_username column, so a login-only
        // save has nothing to write (system-new SCHEMA / mapCustomerProfile)
        $this->putJson('/api/accounts/update', [
            'account_type' => 'customer',
            'user_id' => $customer->cust_id,
            'cust_username' => 'new-username',
        ], $this->headers($customer))
            ->assertStatus(422)
            ->assertJson(['message' => 'No updatable fields were supplied.']);

        // A fulfilled order may be parked on a return request, which staff
        // then finalize (FLOW-ORD_LIST-04/05)
        $claimed = $this->makeOrder($customer, ['ord_status' => 'claimed']);
        // A non-walk-in order owns a fulfillment row (D12 / REQ-MANAGE_PRE-01)
        Pickup::create(['ord_id' => $claimed->ord_id, 'pickup_created' => now()]);
        $this->putJson('/api/orders/update', [
            'ord_id' => $claimed->ord_id,
            'ord_status' => 'RETURN REQUESTED',
        ], $this->headers($customer))->assertStatus(200);
        $this->assertSame('to cancel', $claimed->fresh()->ord_status);

        $admin = $this->makeEmployee(['emp_type' => 'ADMIN']);
        $this->putJson('/api/orders/update', [
            'ord_id' => $claimed->ord_id,
            'ord_status' => 'RETURNED',
        ], $this->headers($admin))->assertStatus(200);
        $this->assertSame('returned', $claimed->fresh()->ord_status);

        Visit::create([
            'cust_id' => $customer->cust_id,
            'appoint_type' => 'VISIT',
            'appoint_status' => 'upcoming',
            'appoint_qr' => 'SCOPE-' . uniqid(),
            'appoint_start' => now()->addDay(),
            'appoint_end' => now()->addDay()->addMinutes(10),
            'appoint_created' => now(),
        ]);

        // FLOW-MANAGE_APP-01: the master appointment book is an administrator
        // view - ordinary staff get a real 403, never a silent empty list
        $staff = $this->makeEmployee(['emp_type' => 'STAFF']);
        $this->getJson('/api/appoint/display?scope=master', $this->headers($staff))
            ->assertStatus(403)
            ->assertJson(['message' => 'Administrator access is required to view all appointments.']);
        $this->getJson('/api/appoint/display?scope=master', $this->headers($admin))
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');

        // REQ-SC-01: a customer only ever sees their own bookings
        $this->getJson('/api/appoint/display', $this->headers($other))
            ->assertStatus(200)
            ->assertJsonCount(0, 'data');
        $this->getJson('/api/appoint/display', $this->headers($customer))
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');
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
        // The live table carries no cust_nickname column at all: the shared
        // account persists its name in cust_givname, and OrdersAPI::walkInPayload()
        // re-exports it under the legacy `cust_nickname` alias (spec section 6)
        // - which the assertJson() above already pins down.
        $this->assertSame('Walk-in', $walkIn->cust_givname);
        $this->assertEquals($walkIn->cust_id, $checkout->json('data.order.cust_id'));

        $order = Order::find($ordId);

        // FLOW-WALKIN: a counter sale is handed over immediately, so the order
        // lands in the spec's "claimed" state (system-new FLOW-ORD_CLAIM-04
        // vocabulary: processing -> to claim -> claimed). "TO CLAIM" is the
        // queue a RESERVED pickup order waits in, which a walk-in never enters.
        $this->assertSame('claimed', $order->ord_status);

        // The tender is persisted on the order itself: live ORDERS carries
        // pay_reference / pay_received / pay_change (system-new SCHEMA) and
        // OrdersAPI reads the sale's payment from those columns - a payment row
        // belongs to the parcel / customer-checkout path, not the register.
        $this->assertStringStartsWith('POS-CASH-', (string) $order->pay_reference);
        $this->assertEquals(1000, (float) $order->pay_received);
        $this->assertEquals(550, (float) $order->pay_change);

        // Stock truth is the variation: the live `product` table has no
        // prod_qty column at all, so 8 - 3 is read back from prodvar.
        $this->assertEquals(5, (int) Prodvar::where('prod_id', $product->prod_id)->value('prodvar_stock'));

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
