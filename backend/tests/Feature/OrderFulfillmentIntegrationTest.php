<?php

namespace Tests\Feature;

use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Feature tests for the order endpoints the frontend relies on: staff order
 * listings with fulfillment data, delivery tracking lookups, and the
 * customer cancel/return request approval flow.
 */
class OrderFulfillmentIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private array $tokens = [];

    // ==========================================
    // FIXTURE HELPERS
    // ==========================================

    private function headers($model): array
    {
        // Sanctum caches the resolved user per app instance; drop it so each
        // request authenticates its own bearer token.
        $this->app['auth']->forgetGuards();

        $key = get_class($model) . ':' . $model->getKey();
        if (!isset($this->tokens[$key])) {
            $this->tokens[$key] = $model->createToken('test')->plainTextToken;
        }

        return ['Authorization' => 'Bearer ' . $this->tokens[$key]];
    }

    private function makeCustomer(): Customer
    {
        $this->seq++;

        return Customer::create([
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
        ]);
    }

    private function makeEmployee(string $type = 'STAFF'): Employee
    {
        $this->seq++;

        return Employee::create([
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
            'emp_type'      => $type,
            'emp_instore'   => 0,
        ]);
    }

    private function makeProduct(): Product
    {
        $this->seq++;

        return Product::create([
            'prod_created'   => now(),
            'prod_tag'       => 'TAG' . $this->seq . strtoupper(substr(md5(uniqid()), 0, 6)),
            'prod_name'      => 'Product ' . $this->seq . ' ' . uniqid(),
            'prod_categ'     => 'ACCESSORIES',
            'prod_price'     => 150.00,
            'prod_qty'       => 50,
            'prod_desc'      => 'Test product',
            'prod_peakqty'   => 50,
            'prod_peaksold'  => 0,
            'prod_peakdate'  => now(),
            'prod_todayqty'  => 50,
            'prod_todaysold' => 0,
        ]);
    }

    private function makeOrder(Customer $customer, string $status): Order
    {
        return Order::create([
            'cust_id'       => $customer->getKey(),
            'ord_created'   => now(),
            'ord_completed' => null,
            'ord_tag'       => 'ORD-' . strtoupper(substr(md5(uniqid()), 0, 8)),
            'ord_status'    => $status,
            'ord_rating'    => 0,
            'ord_review'    => null,
        ]);
    }

    /** Cart order paid through the delivery modality; returns the ord_id. */
    private function checkoutDelivery(Customer $customer, Product $product): int
    {
        $ordId = $this->postJson('/api/cart/add', [
            'cust_id' => $customer->getKey(),
            'items'   => [['prod_id' => $product->prod_id, 'item_qty' => 2]],
        ], $this->headers($customer))
            ->assertStatus(201)
            ->json('data.order.ord_id');

        $this->postJson('/api/checkout/payment', [
            'ord_id'          => $ordId,
            'dispatch_type'   => 'delivery',
            'speed'           => 'standard',
            'deliver_address' => 'Sagpon, Legazpi, Albay',
            'pay_given'       => 350,
        ], $this->headers($customer))
            ->assertStatus(201)
            ->assertJsonPath('data.order.ord_status', 'TO RECEIVE');

        return (int) $ordId;
    }

    // ==========================================
    // STAFF ORDER LISTINGS
    // ==========================================

    public function test_staff_can_list_every_order_with_fulfillment_data()
    {
        $staff = $this->makeEmployee();
        $alice = $this->makeCustomer();
        $bob = $this->makeCustomer();
        $product = $this->makeProduct();

        $deliveryOrdId = $this->checkoutDelivery($alice, $product);
        $this->makeOrder($bob, 'TO PROCESS');

        // Open cart rows stay out of the staff listing
        $this->postJson('/api/cart/add', [
            'cust_id' => $bob->getKey(),
            'prod_id' => $product->prod_id,
        ], $this->headers($bob))->assertStatus(201);

        $rows = $this->json('GET', '/api/cart/display', ['exclude_prefix' => 'CART-'], $this->headers($staff))
            ->assertStatus(200)
            ->json('data');

        $this->assertCount(2, $rows);
        $delivery = collect($rows)->firstWhere('ord_id', $deliveryOrdId);
        $this->assertNotNull($delivery['parcel']);
        $this->assertNull($delivery['pickup']);
        $this->assertSame('Sagpon, Legazpi, Albay', $delivery['parcel']['delivery']['deliver_address']);
        $this->assertNotEmpty($delivery['parcel']['delivery']['deliver_qr']);

        // cust_id narrows the staff listing
        $this->json('GET', '/api/cart/display', ['cust_id' => $bob->getKey(), 'exclude_prefix' => 'CART-'], $this->headers($staff))
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');

        // Search and sort are open to staff too
        $this->json('GET', '/api/cart/search', ['q' => 'TO RECEIVE'], $this->headers($staff))
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');
        $this->json('GET', '/api/cart/sort', ['sort_by' => 'id', 'order' => 'asc'], $this->headers($staff))
            ->assertStatus(200)
            ->assertJsonCount(3, 'data');

        // Customers still only see their own orders
        $this->json('GET', '/api/cart/display', [], $this->headers($bob))
            ->assertStatus(200)
            ->assertJsonCount(2, 'data');
    }

    // ==========================================
    // DELIVERY TRACKING
    // ==========================================

    public function test_delivery_track_lookup_returns_the_parcel_qr()
    {
        $customer = $this->makeCustomer();
        $ordId = $this->checkoutDelivery($customer, $this->makeProduct());

        $response = $this->postJson('/api/tracking/create', [
            'ord_id'     => $ordId,
            'track_type' => 'delivery',
        ], $this->headers($customer))->assertStatus(200);

        $this->assertSame('DELIVERY', $response->json('data.track_type'));
        $this->assertSame($response->json('data.delivery.deliver_qr'), $response->json('data.qr_code'));
        $this->assertNotEmpty($response->json('data.qr_code'));
    }

    // ==========================================
    // CANCEL / RETURN REQUESTS
    // ==========================================

    public function test_cancel_requests_can_be_approved_or_declined_by_admins()
    {
        $admin = $this->makeEmployee('ADMIN');
        $customer = $this->makeCustomer();

        // Approve: TO CLAIM -> CANCEL REQUESTED -> CANCELLED
        $approved = $this->makeOrder($customer, 'TO CLAIM');
        $this->putJson('/api/orders/update', ['ord_id' => $approved->ord_id, 'ord_status' => 'CANCEL REQUESTED'], $this->headers($customer))
            ->assertStatus(200);
        $this->putJson('/api/orders/update', ['ord_id' => $approved->ord_id, 'ord_status' => 'CANCELLED'], $this->headers($admin))
            ->assertStatus(200)
            ->assertJsonPath('data.ord_status', 'CANCELLED');

        // Decline: back to the active state, and the customer is told why
        $declined = $this->makeOrder($customer, 'TO CLAIM');
        $this->putJson('/api/orders/update', ['ord_id' => $declined->ord_id, 'ord_status' => 'CANCEL REQUESTED'], $this->headers($customer))
            ->assertStatus(200);
        $this->putJson('/api/orders/update', ['ord_id' => $declined->ord_id, 'ord_status' => 'TO CLAIM'], $this->headers($admin))
            ->assertStatus(200)
            ->assertJsonPath('data.ord_status', 'TO CLAIM');

        $this->assertTrue(
            CustNotif::where('cust_id', $customer->getKey())
                ->where('custnotif_msg', 'like', '%cancellation request for order ' . $declined->ord_tag . ' was declined%')
                ->exists()
        );

        // Staff below admin cannot decide requests
        $staff = $this->makeEmployee();
        $pending = $this->makeOrder($customer, 'TO PROCESS');
        $this->putJson('/api/orders/update', ['ord_id' => $pending->ord_id, 'ord_status' => 'CANCEL REQUESTED'], $this->headers($customer))
            ->assertStatus(200);
        $this->putJson('/api/orders/update', ['ord_id' => $pending->ord_id, 'ord_status' => 'CANCELLED'], $this->headers($staff))
            ->assertStatus(403);
    }

    public function test_return_requests_are_limited_to_claimed_orders()
    {
        $admin = $this->makeEmployee('ADMIN');
        $customer = $this->makeCustomer();

        // Only claimed orders can be returned
        $active = $this->makeOrder($customer, 'TO RECEIVE');
        $this->putJson('/api/orders/update', ['ord_id' => $active->ord_id, 'ord_status' => 'RETURN REQUESTED'], $this->headers($customer))
            ->assertStatus(403);

        // Approve: CLAIMED -> RETURN REQUESTED -> RETURNED
        $returned = $this->makeOrder($customer, 'CLAIMED');
        $this->putJson('/api/orders/update', ['ord_id' => $returned->ord_id, 'ord_status' => 'RETURN REQUESTED'], $this->headers($customer))
            ->assertStatus(200);
        $this->putJson('/api/orders/update', ['ord_id' => $returned->ord_id, 'ord_status' => 'RETURNED'], $this->headers($admin))
            ->assertStatus(200)
            ->assertJsonPath('data.ord_status', 'RETURNED');

        // Decline: back to CLAIMED with the original completion stamp kept
        $kept = $this->makeOrder($customer, 'CLAIMED');
        $kept->update(['ord_completed' => '2026-01-01 10:00:00']);
        $this->putJson('/api/orders/update', ['ord_id' => $kept->ord_id, 'ord_status' => 'RETURN REQUESTED'], $this->headers($customer))
            ->assertStatus(200);
        $this->putJson('/api/orders/update', ['ord_id' => $kept->ord_id, 'ord_status' => 'CLAIMED'], $this->headers($admin))
            ->assertStatus(200);

        $this->assertStringStartsWith('2026-01-01 10:00', (string) $kept->fresh()->ord_completed);
    }
}
