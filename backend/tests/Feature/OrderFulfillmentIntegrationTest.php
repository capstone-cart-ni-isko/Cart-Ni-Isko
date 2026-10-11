<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\Order;
use App\Models\Pickup;
use App\Models\Product;
use App\Models\Prodvar;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Feature tests for the order endpoints the admin dashboard relies on: staff
 * order listings with fulfillment data, read-cache invalidation, legacy
 * super admin spellings, and the customer cancellation request flow
 * (FLOW-ORD_LIST-04..07).
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
        // Re-authenticate every request so a test can switch identities.
        $this->app['auth']->forgetGuards();

        $key = get_class($model) . ':' . $model->getKey();
        if (!isset($this->tokens[$key])) {
            $this->tokens[$key] = \App\Support\ApiToken::issue($model);
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

        // emp_type is not mass assignable and EnsureRole reads emp_categ, so
        // both are written past mass assignment (see SrsRequirementsTest).
        return Employee::forceCreate([
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
            'emp_categ'     => $type,
            'emp_instore'   => 0,
        ]);
    }

    private function makeProduct(): Product
    {
        $this->seq++;

        $product = Product::create([
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
        ]);

        // Live products always own their main variation
        Prodvar::create([
            'prod_id'         => $product->prod_id,
            'prodvar_name'    => 'Default',
            'prodvar_stock'   => 10,
            'prodvar_main'    => true,
            'prodvar_created' => now(),
        ]);

        return $product;
    }

    /** A preorder (not a walk-in): it owns a pickup fulfillment row. */
    private function makePickupOrder(Customer $customer, string $status = 'processing'): Order
    {
        $order = Order::create([
            'cust_id'       => $customer->getKey(),
            'ord_created'   => now(),
            'ord_completed' => null,
            'ord_tag'       => 'ORD-' . strtoupper(substr(md5(uniqid()), 0, 8)),
            'ord_status'    => $status,
            'ord_rating'    => 0,
            'ord_review'    => null,
        ]);
        Pickup::create(['ord_id' => $order->ord_id, 'pickup_created' => now()]);

        return $order;
    }

    // ==========================================
    // STAFF ORDER LISTINGS
    // ==========================================

    public function test_staff_can_list_every_order_with_fulfillment_data()
    {
        $staff = $this->makeEmployee();
        $alice = $this->makeCustomer();
        $bob = $this->makeCustomer();

        $aliceOrder = $this->makePickupOrder($alice);
        $this->makePickupOrder($bob);

        $rows = collect(
            $this->json('GET', '/api/cart/display', [], $this->headers($staff))
                ->assertStatus(200)
                ->json('data')
        );

        // Staff see every customer's orders, each carrying its fulfillment row
        $this->assertTrue($rows->contains('ord_id', $aliceOrder->ord_id));
        $this->assertGreaterThanOrEqual(2, $rows->pluck('cust_id')->unique()->count());
        $this->assertNotNull($rows->firstWhere('ord_id', $aliceOrder->ord_id)['pickup']);

        // Customers still only see their own orders
        $own = $this->json('GET', '/api/cart/display', [], $this->headers($bob))
            ->assertStatus(200)
            ->json('data');
        $this->assertNotEmpty($own);
        $this->assertSame([(int) $bob->cust_id], collect($own)->pluck('cust_id')->map(fn ($id) => (int) $id)->unique()->values()->all());
    }

    // ==========================================
    // READ CACHE INVALIDATION
    // ==========================================

    public function test_writes_invalidate_cached_reads_on_the_database_cache_store()
    {
        // The dev/prod store; Cache::increment on a missing key is a no-op here
        config(['cache.default' => 'database']);

        $admin = $this->makeEmployee('ADMIN');
        $product = $this->makeProduct();

        $this->json('GET', '/api/products/view', ['prod_id' => $product->prod_id])
            ->assertStatus(200)
            ->assertJsonPath('data.prod_desc', 'Test product');

        $this->putJson('/api/products/update', [
            'prod_id'   => $product->prod_id,
            'prod_desc' => 'Updated description',
        ], $this->headers($admin))->assertStatus(200);

        $this->app['auth']->forgetGuards();
        $this->json('GET', '/api/products/view', ['prod_id' => $product->prod_id])
            ->assertStatus(200)
            ->assertJsonPath('data.prod_desc', 'Updated description');
    }

    // ==========================================
    // SUPER ADMIN TYPE SPELLINGS
    // ==========================================

    public function test_legacy_super_admin_spelling_keeps_super_admin_rights()
    {
        $legacy = $this->makeEmployee('SUPER_ADMIN');
        $admin = $this->makeEmployee('ADMIN');

        // The access log is super-admin only (role:super_admin)
        $this->json('GET', '/api/access/logs', [], $this->headers($legacy))->assertStatus(200);
        $this->json('GET', '/api/access/logs', [], $this->headers($admin))->assertStatus(403);
    }

    // ==========================================
    // CANCELLATION REQUESTS (FLOW-ORD_LIST-04..07)
    // ==========================================

    public function test_cancel_requests_can_be_approved_or_rejected_by_admins()
    {
        $admin = $this->makeEmployee('ADMIN');
        $customer = $this->makeCustomer();

        // Approve: processing -> to cancel -> cancelled
        $approved = $this->makePickupOrder($customer);
        $this->putJson('/api/orders/update', ['ord_id' => $approved->ord_id, 'ord_status' => 'CANCEL REQUESTED'], $this->headers($customer))
            ->assertStatus(200);
        $this->assertSame('to cancel', $approved->fresh()->ord_status);
        $this->putJson('/api/orders/update', ['ord_id' => $approved->ord_id, 'ord_status' => 'cancelled'], $this->headers($admin))
            ->assertStatus(200);
        $this->assertSame('cancelled', $approved->fresh()->ord_status);

        // Reject: back to processing (FLOW-ORD_LIST-07)
        $rejected = $this->makePickupOrder($customer);
        $this->putJson('/api/orders/update', ['ord_id' => $rejected->ord_id, 'ord_status' => 'CANCEL REQUESTED'], $this->headers($customer))
            ->assertStatus(200);
        $this->putJson('/api/orders/update', ['ord_id' => $rejected->ord_id, 'ord_status' => 'processing'], $this->headers($admin))
            ->assertStatus(200);
        $this->assertSame('processing', $rejected->fresh()->ord_status);

        // Staff below admin cannot decide requests
        $staff = $this->makeEmployee();
        $pending = $this->makePickupOrder($customer);
        $this->putJson('/api/orders/update', ['ord_id' => $pending->ord_id, 'ord_status' => 'CANCEL REQUESTED'], $this->headers($customer))
            ->assertStatus(200);
        $this->putJson('/api/orders/update', ['ord_id' => $pending->ord_id, 'ord_status' => 'cancelled'], $this->headers($staff))
            ->assertStatus(403);
    }

    public function test_only_processing_orders_can_be_cancelled_and_returns_are_refused()
    {
        $customer = $this->makeCustomer();

        // Cancellation is asked only while the order is processing
        $toClaim = $this->makePickupOrder($customer, 'to claim');
        $this->putJson('/api/orders/update', ['ord_id' => $toClaim->ord_id, 'ord_status' => 'CANCEL REQUESTED'], $this->headers($customer))
            ->assertStatus(403);
        $this->assertSame('to claim', $toClaim->fresh()->ord_status);

        // system-new has no return flow: a claimed order stays claimed
        $claimed = $this->makePickupOrder($customer, 'claimed');
        $this->putJson('/api/orders/update', ['ord_id' => $claimed->ord_id, 'ord_status' => 'RETURN REQUESTED'], $this->headers($customer))
            ->assertStatus(403);
        $this->assertSame('claimed', $claimed->fresh()->ord_status);
    }
}
