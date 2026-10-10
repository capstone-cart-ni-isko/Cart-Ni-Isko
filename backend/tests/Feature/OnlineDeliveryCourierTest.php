<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Employee;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Payment;
use App\Models\Prodvar;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Rule 55 / REQ-CHECKOUT-03 / "LALAMOVE INTEGRATION SUGGESTIONS".
 *
 * A preorder - pickup or delivery - is settled ONLINE, at checkout. The
 * delivery fee is collected with the goods, and the courier is only booked
 * once the gateway says the money arrived.
 *
 * Both integrations are optional at the credential level and mandatory at the
 * behaviour level:
 *
 *   PAYMONGO_* unset  -> 503 PAYMENT_GATEWAY_UNAVAILABLE, bag untouched
 *   LALAMOVE_* unset  -> the store's own tier fee books the checkout, and
 *                        POST /delivery/book answers 503 instead of crashing
 *
 * Nothing here needs a live key: every HTTP call is faked, and the tests still
 * exercise the real request shapes (hosted checkout session, LalaMove v3
 * quotation/order, both webhooks).
 */
class OnlineDeliveryCourierTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;
    private array $tokens = [];

    // ==========================================
    // FIXTURES
    // ==========================================

    private function headers($model): array
    {
        $this->app['auth']->forgetGuards();

        $key = get_class($model) . ':' . $model->getKey();
        if (! isset($this->tokens[$key])) {
            $this->tokens[$key] = \App\Support\ApiToken::issue($model);
        }

        return ['Authorization' => 'Bearer ' . $this->tokens[$key]];
    }

    private function makeCustomer(array $attributes = []): Customer
    {
        $this->seq++;

        return Customer::create(array_merge([
            'cust_created'  => now(),
            'cust_password' => Hash::make('Password123!'),
            'cust_givname'  => 'Maria',
            'cust_surname'  => 'Santos' . $this->seq,
            'cust_phone'    => '09' . str_pad((string) (800000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'cust_email'    => 'courier' . $this->seq . uniqid() . '@example.com',
            'cust_callcode' => '+63',
            'cust_address'  => 'Bagumbayan, Legazpi City, Albay',
            'cust_type'     => 'Student',
            'cust_orders'   => 0,
            'cust_bag'      => 0,
            'cust_cart'     => 0,
        ], $attributes));
    }

    private function makeEmployee(array $attributes = []): Employee
    {
        $this->seq++;

        $data = array_merge([
            'emp_created'   => now(),
            'emp_password'  => Hash::make('Password123!'),
            'emp_surname'   => 'Reyes',
            'emp_givname'   => 'Ana',
            'emp_midname'   => '',
            'emp_suffix'    => '',
            'emp_studnum'   => '2023-' . (20000 + $this->seq),
            'emp_pronoun'   => 'they/them',
            'emp_birthday'  => '2000-01-01',
            'emp_brgy'      => 'Sagpon',
            'emp_city'      => 'Legazpi',
            'emp_province'  => 'Albay',
            'emp_country'   => '',
            'emp_callcode'  => '+63',
            'emp_phone'     => '09' . str_pad((string) (600000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'emp_email'     => 'courieremp' . $this->seq . uniqid() . '@bicol-u.edu.ph',
            'emp_type'      => 'STAFF',
            'emp_instore'   => 1,
        ], $attributes);

        $data['emp_categ'] = $data['emp_type'] ?? 'STAFF';

        return Employee::forceCreate($data);
    }

    private function makeProduct(array $attributes = []): Product
    {
        $this->seq++;

        $product = Product::create(array_merge([
            'prod_created'   => now(),
            'prod_tag'       => 'TAG' . $this->seq . strtoupper(substr(md5(uniqid()), 0, 6)),
            'prod_name'      => 'Courier Product ' . $this->seq,
            'prod_categ'     => 'ACCESSORIES',
            'prod_price'     => 250.00,
            'prod_qty'       => 10,
            'prod_desc'      => 'Test product',
            'prod_peakqty'   => 10,
            'prod_peaksold'  => 0,
            'prod_peakdate'  => now(),
            'prod_todayqty'  => 10,
            'prod_todaysold' => 0,
        ], $attributes));

        Prodvar::create([
            'prod_id'         => $product->prod_id,
            'prodvar_name'    => 'Default',
            'prodvar_stock'   => (int) $product->prod_qty,
            'prodvar_main'    => true,
            'prodvar_created' => now(),
        ]);

        return $product;
    }

    private function grantCheckoutOtp(Customer $customer): void
    {
        Cache::put('otp:ok:cust:' . (int) $customer->cust_id . ':checkout', true, now()->addMinutes(10));
    }

    /** A bag the customer can check out. */
    private function fillBag(Customer $customer, Product $product, int $qty = 1): void
    {
        $this->json('POST', '/api/cart/add', [
            'cust_id'  => $customer->cust_id,
            'prod_id'  => $product->prod_id,
            'item_qty' => $qty,
        ], $this->headers($customer))->assertStatus(201);
    }

    /**
     * Configure PayMongo the way production is configured, with the whole
     * gateway faked so no request ever leaves the process.
     */
    private function fakePayMongo(): string
    {
        $webhookSecret = 'whsec_' . str_repeat('b', 32);

        config([
            'services.paymongo.secret_key'     => 'sk_test_' . str_repeat('a', 32),
            'services.paymongo.public_key'     => 'pk_test_' . str_repeat('c', 32),
            'services.paymongo.webhook_secret' => $webhookSecret,
            'services.frontend_url'            => 'http://localhost:5173',
        ]);

        Http::fake([
            'api.paymongo.com/*' => Http::response([
                'data' => [
                    'id'         => 'cs_test_delivery',
                    'attributes' => [
                        'status'       => 'active',
                        'checkout_url' => 'https://checkout.paymongo.com/cs_test_delivery',
                        'livemode'     => false,
                    ],
                ],
            ], 200),
        ]);

        return $webhookSecret;
    }

    /** Configure LalaMove and fake its v3 API (quotation + order placement). */
    private function fakeLalamove(int $totalCents = 12000): void
    {
        config([
            'services.lalamove.api_key'    => 'test-api-key',
            'services.lalamove.api_secret' => 'test-api-secret',
            'services.lalamove.market'     => 'PH',
            'services.lalamove.environment'=> 'sandbox',
        ]);

        Http::fake([
            'rest.sandbox.lalamove.com/v3/quotations' => Http::response([
                'data' => [
                    'quotationId'    => 'quote-001',
                    'serviceType'    => 'MOTORCYCLE',
                    'expiresAt'      => now()->addMinutes(5)->toIso8601String(),
                    'distance'       => ['value' => 4200, 'unit' => 'm'],
                    'priceBreakdown' => ['total' => $totalCents / 100, 'currency' => 'PHP'],
                    'stops'          => [
                        ['stopId' => 'stop-pickup'],
                        ['stopId' => 'stop-dropoff'],
                    ],
                ],
            ], 200),
            'rest.sandbox.lalamove.com/v3/orders' => Http::response([
                'data' => [
                    'orderId'   => '107900701184',
                    'status'    => 'ASSIGNING_DRIVER',
                    'shareLink' => 'https://share.lalamove.com/107900701184',
                    'priceBreakdown' => ['total' => $totalCents / 100, 'currency' => 'PHP'],
                ],
            ], 200),
            'rest.sandbox.lalamove.com/v3/orders/*' => Http::response([
                'data' => [
                    'orderId'   => '107900701184',
                    'status'    => 'ON_GOING',
                    'shareLink' => 'https://share.lalamove.com/107900701184',
                ],
            ], 200),
        ]);
    }

    /** Drop every gateway key so the "not configured" branches are exercised. */
    private function unconfigureGateways(): void
    {
        config([
            'services.paymongo.secret_key' => null,
            'services.paymongo.public_key' => null,
            'services.paymongo.webhook_secret' => null,
            'services.lalamove.api_key'    => null,
            'services.lalamove.api_secret' => null,
        ]);
    }

    /** LalaMove keys off, PayMongo left exactly as `fakePayMongo()` set it. */
    private function unconfigureCourier(): void
    {
        config([
            'services.lalamove.api_key'    => null,
            'services.lalamove.api_secret' => null,
        ]);
    }

    /**
     * The signed `Paymongo-Signature` header: `t=<ts>,v1=<hmac>` over
     * `"{timestamp}.{raw_body}"`.
     */
    private function payMongoSignature(string $rawBody, string $secret, ?int $timestamp = null): string
    {
        $t  = $timestamp ?? time();
        $v1 = hash_hmac('sha256', $t . '.' . $rawBody, $secret);

        return 't=' . $t . ',v1=' . $v1;
    }

    /** Place a paid-or-pending delivery order and return [order, checkout]. */
    private function checkoutDelivery(Customer $customer, Product $product, array $overrides = [])
    {
        $this->fillBag($customer, $product, 2);
        $this->grantCheckoutOtp($customer);

        $response = $this->json('POST', '/api/checkout/payment/intent', array_merge([
            'gateway'         => 'paymongo',
            'dispatch_type'   => 'delivery',
            'speed'           => 'standard',
            'deliver_address' => 'Bagumbayan, Legazpi City, Albay',
            'deliver_lat'     => '13.1391',
            'deliver_lng'     => '123.7438',
            'deliver_notes'   => 'Leave at the gate.',
        ], $overrides), $this->headers($customer))->assertStatus(201);

        $order = Order::where('cust_id', $customer->cust_id)->firstOrFail();

        return [$order, $response];
    }

    // ==========================================
    // RULE 55 - ONLINE ONLY
    // ==========================================

    public function test_checkout_refuses_cash_for_a_preorder()
    {
        $customer = $this->makeCustomer();
        $product  = $this->makeProduct();
        $this->unconfigureGateways();

        $this->fillBag($customer, $product, 1);
        $this->grantCheckoutOtp($customer);

        $this->json('POST', '/api/checkout/payment', [
            'pay_given'       => 100000,
            'dispatch_type'   => 'delivery',
            'deliver_address' => 'Bagumbayan, Legazpi City, Albay',
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJsonPath('code', 'ONLINE_PAYMENT_REQUIRED');

        // The refusal left the bag and the tables exactly as they were.
        $this->assertSame(0, Order::count());
        $this->assertSame(0, Delivery::count());
        $this->assertSame(0, Payment::count());
        $this->assertEquals(1, (int) $customer->fresh()->cust_cart);
    }

    public function test_an_unconfigured_gateway_refuses_the_checkout_and_keeps_the_bag()
    {
        $customer = $this->makeCustomer();
        $product  = $this->makeProduct();
        $this->unconfigureGateways();

        $this->fillBag($customer, $product, 3);

        $this->grantCheckoutOtp($customer);
        $this->json('POST', '/api/checkout/payment/intent', [
            'gateway'         => 'paymongo',
            'dispatch_type'   => 'delivery',
            'deliver_address' => 'Bagumbayan, Legazpi City, Albay',
        ], $this->headers($customer))
            ->assertStatus(503)
            ->assertJsonPath('code', 'PAYMENT_GATEWAY_UNAVAILABLE');

        $this->assertSame(0, Order::count());
        $this->assertSame(0, Delivery::count());
        $this->assertSame(0, Payment::count());
        // The customer's bag is still theirs - nothing was reserved or lost.
        $this->assertEquals(10, (int) Prodvar::first()->prodvar_stock);
        $this->assertEquals(1, (int) $customer->fresh()->cust_cart);
    }

    // ==========================================
    // DELIVERY FEE (rule 55: paid online, with the goods)
    // ==========================================

    public function test_a_delivery_without_a_courier_still_charges_the_store_fee()
    {
        $customer = $this->makeCustomer();
        $product  = $this->makeProduct();
        $this->fakePayMongo();
        $this->unconfigureCourier();   // LalaMove keys off, PayMongo on

        [$order, $checkout] = $this->checkoutDelivery($customer, $product);

        $delivery = Delivery::where('ord_id', $order->ord_id)->firstOrFail();
        $this->assertSame('STANDARD', $delivery->deliver_service);
        $this->assertSame('sandbox', $delivery->deliver_env ?? 'sandbox');
        // 2 x 250 goods + 50 standard tier = 550
        $this->assertEquals(550.0, (float) $order->ord_amount);
        $this->assertEquals(50.0, (float) $delivery->deliver_fee_charged);

        // The customer is told the courier is not booked yet, and the fee is
        // exposed on the payload so the PWA and the admin both see one number.
        $this->assertEquals(50.0, (float) $checkout->json('data.order.deliver_fee_charged'));
        $this->assertSame('at_checkout', $checkout->json('data.order.ord_ship_policy'));
        $this->assertFalse($checkout->json('data.order.courier.booked'));

        // The recipient / coordinates the courier will need are already stored.
        $this->assertSame('13.1391', (string) $delivery->deliver_lat);
        $this->assertSame('123.7438', (string) $delivery->deliver_lng);
        $this->assertNotEmpty($delivery->deliver_recipient);
        $this->assertSame('Leave at the gate.', $delivery->deliver_notes);
    }

    public function test_a_live_courier_quote_replaces_the_store_fee()
    {
        $customer = $this->makeCustomer();
        $product  = $this->makeProduct();
        $this->fakePayMongo();
        $this->fakeLalamove(12000);   // PHP 120.00 quoted

        [$order] = $this->checkoutDelivery($customer, $product);

        $delivery = Delivery::where('ord_id', $order->ord_id)->firstOrFail();
        // 2 x 250 goods + 120 quoted = 620 - the courier price, not the table.
        $this->assertEquals(620.0, (float) $order->ord_amount);
        $this->assertEquals(120.0, (float) $delivery->deliver_fee_charged);
    }

    // ==========================================
    // THE COURIER IS BOOKED ONCE THE MONEY ARRIVES
    // ==========================================

    public function test_the_webhook_marks_the_order_paid_and_books_the_courier()
    {
        $customer = $this->makeCustomer();
        $product  = $this->makeProduct();
        $secret   = $this->fakePayMongo();
        $this->fakeLalamove();

        [$order] = $this->checkoutDelivery($customer, $product);
        $this->assertSame(0.0, (float) $order->fresh()->pay_received);
        $this->assertFalse(Delivery::where('ord_id', $order->ord_id)->firstOrFail()->isBooked());

        $raw = json_encode([
            'data' => [
                'id'         => 'evt_delivery_paid',
                'type'       => 'checkout_session.payment.paid',
                'attributes' => [
                    'reference_number' => 'order:' . $order->ord_id,
                    'status'           => 'paid',
                ],
            ],
        ], JSON_UNESCAPED_SLASHES);

        $this->withHeaders([
            'Content-Type'       => 'application/json',
            'Paymongo-Signature' => $this->payMongoSignature($raw, $secret),
        ])->postJson('/api/checkout/payment/webhook', json_decode($raw, true))
            ->assertStatus(200);

        $order->refresh();
        $delivery = Delivery::where('ord_id', $order->ord_id)->firstOrFail();

        $this->assertEquals((float) $order->ord_amount, (float) $order->pay_received);
        $this->assertTrue($delivery->isBooked());
        // The LalaMove order id and its tracking URL ride inside the one
        // column the live schema already has.
        $this->assertSame('107900701184', $delivery->courierOrderId());
        $this->assertSame('https://share.lalamove.com/107900701184', $delivery->shareUrl());
        $this->assertSame('ASSIGNING_DRIVER', $delivery->courier()['status']);
        $this->assertNotNull($delivery->deliver_placed);

        // The status poll answers the same truth to a browser that came back
        // from PayMongo before the webhook landed, and never double-settles.
        $this->json('POST', '/api/checkout/payment/status', ['ord_id' => $order->ord_id], $this->headers($customer))
            ->assertStatus(200)
            ->assertJsonPath('data.paid', true);
        $this->assertEquals((float) $order->ord_amount, (float) $order->fresh()->pay_received);
        $this->assertSame(1, Payment::count());
    }

    public function test_the_courier_webhook_moves_the_order_along_the_track()
    {
        $customer = $this->makeCustomer();
        $product  = $this->makeProduct();
        $secret   = $this->fakePayMongo();
        $this->fakeLalamove();

        [$order] = $this->checkoutDelivery($customer, $product);

        $raw = json_encode([
            'data' => [
                'id'         => 'evt_delivery_paid',
                'type'       => 'checkout_session.payment.paid',
                'attributes' => ['reference_number' => 'order:' . $order->ord_id, 'status' => 'paid'],
            ],
        ], JSON_UNESCAPED_SLASHES);

        $this->withHeaders([
            'Content-Type'       => 'application/json',
            'Paymongo-Signature' => $this->payMongoSignature($raw, $secret),
        ])->postJson('/api/checkout/payment/webhook', json_decode($raw, true))->assertStatus(200);

        // LalaMove pushes a status change - no bearer token exists for a
        // courier, so the route is public and the handler is idempotent.
        $this->withHeaders(['Content-Type' => 'application/json'])
            ->postJson('/api/delivery/webhook', [
                'orderId' => '107900701184',
                'status'  => 'PICKED_UP',
                'message' => 'ORDER_STATUS_CHANGED',
            ])->assertStatus(200);

        $delivery = Delivery::where('ord_id', $order->ord_id)->firstOrFail();
        $this->assertSame('PICKED_UP', $delivery->courier()['status']);
        $this->assertSame('delivering', $order->fresh()->ord_status);
        $this->assertNotNull($delivery->deliver_pickedup);

        // The same event again must not re-announce or move anything.
        $this->withHeaders(['Content-Type' => 'application/json'])
            ->postJson('/api/delivery/webhook', [
                'orderId' => '107900701184',
                'status'  => 'PICKED_UP',
            ])->assertStatus(200);
        $this->assertSame('delivering', $order->fresh()->ord_status);

        // Arrived: the customer still confirms by scanning the parcel QR.
        $this->withHeaders(['Content-Type' => 'application/json'])
            ->postJson('/api/delivery/webhook', [
                'orderId' => '107900701184',
                'status'  => 'COMPLETED',
            ])->assertStatus(200);

        $delivery->refresh();
        $this->assertSame('to receive', $order->fresh()->ord_status);
        $this->assertNotNull($delivery->deliver_completed);
        $this->assertNotNull($delivery->deliver_end);
    }

    public function test_a_courier_that_cannot_take_it_frees_the_row_for_a_rebooking()
    {
        $customer = $this->makeCustomer();
        $product  = $this->makeProduct();
        $secret   = $this->fakePayMongo();
        $this->fakeLalamove();

        [$order] = $this->checkoutDelivery($customer, $product);

        $raw = json_encode([
            'data' => [
                'id'         => 'evt_delivery_paid',
                'type'       => 'checkout_session.payment.paid',
                'attributes' => ['reference_number' => 'order:' . $order->ord_id, 'status' => 'paid'],
            ],
        ], JSON_UNESCAPED_SLASHES);

        $this->withHeaders([
            'Content-Type'       => 'application/json',
            'Paymongo-Signature' => $this->payMongoSignature($raw, $secret),
        ])->postJson('/api/checkout/payment/webhook', json_decode($raw, true))->assertStatus(200);

        $this->assertTrue(Delivery::where('ord_id', $order->ord_id)->firstOrFail()->isBooked());

        $this->withHeaders(['Content-Type' => 'application/json'])
            ->postJson('/api/delivery/webhook', [
                'orderId' => '107900701184',
                'status'  => 'CANCELED',
            ])->assertStatus(200);

        // The money stays paid; only the booking is released so staff can
        // book another driver from the Deliveries screen.
        $delivery = Delivery::where('ord_id', $order->ord_id)->firstOrFail();
        $this->assertFalse($delivery->isBooked());
        $this->assertEquals((float) $order->fresh()->ord_amount, (float) $order->fresh()->pay_received);
        $this->assertSame('CANCELED', $delivery->courier()['status']);
    }

    // ==========================================
    // STAFF DISPATCH
    // ==========================================

    public function test_dispatch_endpoints_are_staff_only_and_safe_without_a_courier()
    {
        $customer = $this->makeCustomer();
        $staff    = $this->makeEmployee(['emp_type' => 'STAFF']);
        $product  = $this->makeProduct();
        $secret   = $this->fakePayMongo();
        $this->unconfigureCourier();

        [$order] = $this->checkoutDelivery($customer, $product);

        // A customer may not dispatch couriers.
        $this->json('POST', '/api/delivery/book', ['ord_id' => $order->ord_id], $this->headers($customer))
            ->assertStatus(403);

        // Money first, courier second: an unpaid order is refused outright.
        $this->json('POST', '/api/delivery/book', ['ord_id' => $order->ord_id], $this->headers($staff))
            ->assertStatus(409)
            ->assertJsonPath('success', false);

        $raw = json_encode([
            'data' => [
                'id'         => 'evt_paid_no_courier',
                'type'       => 'checkout_session.payment.paid',
                'attributes' => ['reference_number' => 'order:' . $order->ord_id, 'status' => 'paid'],
            ],
        ], JSON_UNESCAPED_SLASHES);

        $this->withHeaders([
            'Content-Type'       => 'application/json',
            'Paymongo-Signature' => $this->payMongoSignature($raw, $secret),
        ])->postJson('/api/checkout/payment/webhook', json_decode($raw, true))->assertStatus(200);

        // Paid, but LalaMove has no keys: the staff gets a clear 503, not a
        // stack trace, and the order is untouched.
        $this->json('POST', '/api/delivery/book', ['ord_id' => $order->ord_id], $this->headers($staff))
            ->assertStatus(503)
            ->assertJsonPath('success', false);

        $this->json('POST', '/api/delivery/cancel', ['ord_id' => $order->ord_id], $this->headers($staff))
            ->assertStatus(409)
            ->assertJsonPath('success', false);

        // The delivery row the admin screen reads carries the courier
        // envelope and says plainly that the courier is not configured.
        $delivery = Delivery::where('ord_id', $order->ord_id)->firstOrFail();
        $this->assertFalse($delivery->isBooked());
        $this->assertNull($delivery->courierOrderId());

        // `deliver_id` is accepted as an alias for the dispatch screen.
        $this->json('POST', '/api/delivery/book', ['deliver_id' => $delivery->deliver_id], $this->headers($staff))
            ->assertStatus(503);
    }

    public function test_staff_can_book_and_cancel_the_courier()
    {
        $customer = $this->makeCustomer();
        $staff    = $this->makeEmployee(['emp_type' => 'STAFF']);
        $product  = $this->makeProduct();
        $secret   = $this->fakePayMongo();
        $this->fakeLalamove();

        [$order] = $this->checkoutDelivery($customer, $product);

        $raw = json_encode([
            'data' => [
                'id'         => 'evt_delivery_paid',
                'type'       => 'checkout_session.payment.paid',
                'attributes' => ['reference_number' => 'order:' . $order->ord_id, 'status' => 'paid'],
            ],
        ], JSON_UNESCAPED_SLASHES);

        $this->withHeaders([
            'Content-Type'       => 'application/json',
            'Paymongo-Signature' => $this->payMongoSignature($raw, $secret),
        ])->postJson('/api/checkout/payment/webhook', json_decode($raw, true))->assertStatus(200);

        // Booking an order that is already booked says so instead of
        // double-charging the wallet.
        $this->json('POST', '/api/delivery/book', ['ord_id' => $order->ord_id], $this->headers($staff))
            ->assertStatus(200)
            ->assertJsonPath('data.booked', true);

        $cancel = $this->json('POST', '/api/delivery/cancel', ['ord_id' => $order->ord_id], $this->headers($staff));
        $cancel->assertStatus(200)->assertJsonPath('data.booked', false);

        $delivery = Delivery::where('ord_id', $order->ord_id)->firstOrFail();
        $this->assertFalse($delivery->isBooked());
        $this->assertSame('CANCELED', $delivery->courier()['status']);
    }

    public function test_an_unpaid_order_never_gets_a_courier()
    {
        $customer = $this->makeCustomer();
        $staff    = $this->makeEmployee(['emp_type' => 'STAFF']);
        $product  = $this->makeProduct();
        $this->fakePayMongo();
        $this->fakeLalamove();

        [$order] = $this->checkoutDelivery($customer, $product);
        $this->assertSame(0.0, (float) $order->fresh()->pay_received);

        $this->json('POST', '/api/delivery/book', ['ord_id' => $order->ord_id], $this->headers($staff))
            ->assertStatus(409);

        $this->assertFalse(Delivery::where('ord_id', $order->ord_id)->firstOrFail()->isBooked());
    }

    public function test_an_order_may_not_be_settled_by_a_strangers_status_poll()
    {
        $customer = $this->makeCustomer();
        $stranger = $this->makeCustomer();
        $product  = $this->makeProduct();
        $this->fakePayMongo();
        $this->fakeLalamove();

        [$order] = $this->checkoutDelivery($customer, $product);

        $this->json('POST', '/api/checkout/payment/status', ['ord_id' => $order->ord_id], $this->headers($stranger))
            ->assertStatus(404);
        $this->assertSame(0.0, (float) $order->fresh()->pay_received);
    }

    public function test_a_pickup_preorder_is_also_settled_online()
    {
        $customer = $this->makeCustomer();
        $product  = $this->makeProduct();
        $secret   = $this->fakePayMongo();
        $this->makeEmployee(['emp_type' => 'STAFF', 'emp_instore' => 1]);

        $this->fillBag($customer, $product, 1);
        $this->grantCheckoutOtp($customer);

        $this->json('POST', '/api/checkout/payment/intent', [
            'gateway'       => 'paymongo',
            'dispatch_type' => 'pickup',
            'appoint_start' => now()->addDays(3)->format('Y-m-d') . ' 10:00',
        ], $this->headers($customer))->assertStatus(201);

        $order = Order::where('cust_id', $customer->cust_id)->firstOrFail();
        $this->assertSame('pickup', $order->ord_claiming);
        // Pickup never carries a courier or a fee - the fee columns only exist
        // on the delivery row.
        $this->assertNull(Delivery::where('ord_id', $order->ord_id)->first());
        // ...and it is still paid online, not at the counter.
        $this->assertSame(0.0, (float) $order->pay_received);

        $raw = json_encode([
            'data' => [
                'id'         => 'evt_pickup_paid',
                'type'       => 'checkout_session.payment.paid',
                'attributes' => ['reference_number' => 'order:' . $order->ord_id, 'status' => 'paid'],
            ],
        ], JSON_UNESCAPED_SLASHES);

        $this->withHeaders([
            'Content-Type'       => 'application/json',
            'Paymongo-Signature' => $this->payMongoSignature($raw, $secret),
        ])->postJson('/api/checkout/payment/webhook', json_decode($raw, true))->assertStatus(200);

        $this->assertEquals((float) $order->fresh()->ord_amount, (float) $order->fresh()->pay_received);
    }

    public function test_an_unknown_gateway_event_is_acked_but_never_settles_an_order()
    {
        $customer = $this->makeCustomer();
        $product  = $this->makeProduct();
        $secret   = $this->fakePayMongo();
        $this->fakeLalamove();

        [$order] = $this->checkoutDelivery($customer, $product);

        // PayMongo retries for days on a 4xx, so an event this system does not
        // understand is acknowledged and ignored.
        $raw = json_encode([
            'data' => [
                'id'         => 'evt_unknown',
                'type'       => 'checkout_session.expired',
                'attributes' => ['reference_number' => 'order:' . $order->ord_id],
            ],
        ], JSON_UNESCAPED_SLASHES);

        $this->withHeaders([
            'Content-Type'       => 'application/json',
            'Paymongo-Signature' => $this->payMongoSignature($raw, $secret),
        ])->postJson('/api/checkout/payment/webhook', json_decode($raw, true))
            ->assertStatus(200);

        $this->assertSame(0.0, (float) $order->fresh()->pay_received);
        $this->assertFalse(Delivery::where('ord_id', $order->ord_id)->firstOrFail()->isBooked());
    }
}
