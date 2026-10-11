<?php

namespace Tests\Feature;

use App\Models\Bag;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Item;
use App\Models\Order;
use App\Models\Product;
use App\Models\Prodvar;
use App\Models\Review;
use App\Support\IdAllocator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * DOMAIN 9 / 10 (INVENTORY), DOMAIN 11 (WALK-IN ORDERS) and DOMAIN 13
 * (REVIEWS) - the three domains the integration pass rewired.
 *
 * A product can variate along SEVERAL axes at the same time - a shirt can be
 * (cream, medium) or (black, metallic) - so ONE `prodvar` row is one full
 * combination and `prodvar_options` carries the {axis: value} pairs behind it.
 * These tests pin the whole chain down:
 *
 *   - a combination can be added, edited and retired on its own, without the
 *     bag rows of the customers holding it being orphaned (the old full-set
 *     replace path did exactly that, so variation editing was unusable);
 *   - the register rings up the combination that was named, and refuses one
 *     that does not exist instead of silently decrementing the main row;
 *   - the customer catalog resolves (colour, material) as well as
 *     (colour, size), because a bag line that lands on the wrong variation is
 *     a stock and pricing error, not a cosmetic one;
 *   - a deleted review leaves the customer free to write another one.
 */
class InventoryVariationIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private array $tokens = [];

    private function headers($model): array
    {
        $this->app['auth']->forgetGuards();

        $key = get_class($model) . ':' . $model->getKey();
        if (! isset($this->tokens[$key])) {
            $this->tokens[$key] = \App\Support\ApiToken::issue($model);
        }

        return ['Authorization' => 'Bearer ' . $this->tokens[$key]];
    }

    private function makeEmployee(array $attributes = []): Employee
    {
        $this->seq++;

        $data = [
            'emp_created'   => now(),
            'emp_password'  => app('hash')->make('Password123!'),
            'emp_surname'   => 'Admin' . $this->seq,
            'emp_givname'   => 'Tester',
            'emp_midname'   => '',
            'emp_suffix'    => '',
            'emp_studnum'   => 'STU-' . $this->seq,
            'emp_pronoun'   => 'they/them',
            'emp_birthday'  => '2000-01-01',
            'emp_brgy'      => 'Sagpon',
            'emp_city'      => 'Legazpi',
            'emp_province'  => 'Albay',
            'emp_country'   => '',
            'emp_callcode'  => '+63',
            'emp_phone'     => '09' . str_pad((string) (600000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'emp_email'     => 'admin' . $this->seq . uniqid() . '@bicol-u.edu.ph',
            'emp_type'      => 'ADMIN',
            'emp_instore'   => 0,
        ] + $attributes;

        // `emp_categ` is what EnsureRole and notifyEmployeesByType read.
        $data['emp_categ'] = $data['emp_type'] ?? 'ADMIN';

        return Employee::forceCreate(array_merge($data, $attributes));
    }

    private function makeCustomer(): Customer
    {
        $this->seq++;

        return Customer::create([
            'cust_created'  => now(),
            'cust_password' => app('hash')->make('Password123!'),
            'cust_nickname' => 'Buyer' . $this->seq,
            'cust_phone'    => '0917' . str_pad((string) $this->seq, 7, '0', STR_PAD_LEFT),
            'cust_email'    => 'buyer' . $this->seq . '@example.com',
        ]);
    }

    private function makeProduct(array $attributes = []): Product
    {
        $this->seq++;

        return Product::create(array_merge([
            'prod_created' => now(),
            'prod_tag'     => 'TAG' . $this->seq . strtoupper(substr(md5(uniqid()), 0, 6)),
            'prod_name'    => 'Shirt ' . $this->seq . ' ' . uniqid(),
            'prod_categ'   => 'Shirts',
            'prod_price'   => 450.00,
            'prod_desc'    => 'Test shirt',
        ], $attributes));
    }

    private function makeVariation(Product $product, array $attributes = []): Prodvar
    {
        return Prodvar::create(array_merge([
            'prod_id'         => $product->prod_id,
            'prodvar_name'    => 'Variation',
            'prodvar_stock'   => 0,
            'prodvar_created' => now(),
        ], $attributes));
    }

    /** Two combinations of a shirt: (cream, medium) and (cream, large). */
    private function shirt(): Product
    {
        $product = $this->makeProduct();
        $this->makeVariation($product, [
            'prodvar_name'  => 'Cream / Medium',
            'prodvar_stock' => 6,
            'prodvar_main'  => true,
            'prodvar_options' => '{"Color":"Cream","Size":"Medium"}',
        ]);
        $this->makeVariation($product, [
            'prodvar_name'  => 'Cream / Large',
            'prodvar_stock' => 2,
            'prodvar_options' => '{"Color":"Cream","Size":"Large"}',
        ]);

        return $product;
    }

    // ==========================================
    // DOMAIN 9 / 10 - INVENTORY & VARIATIONS
    // ==========================================

    public function test_a_product_can_variate_along_several_axes_at_once()
    {
        $admin   = $this->makeEmployee();
        $added = $this->json('POST', '/api/products/add', [
            'prod_name'  => 'Council Tee',
            'prod_categ' => 'Shirts',
            'prod_price' => 350,
            'variations' => [
                [
                    'prodvar_name'  => 'Cream / Medium',
                    'prodvar_stock' => 5,
                    'prodvar_options' => ['Color' => 'Cream', 'Size' => 'Medium'],
                ],
                [
                    'prodvar_name'  => 'Black / Metallic',
                    'prodvar_stock' => 3,
                    'prodvar_markup' => 50,
                    'prodvar_options' => ['Color' => 'Black', 'Material' => 'Metallic'],
                ],
            ],
        ], $this->headers($admin));

        $added->assertStatus(201);

        $prodId = $added->json('data.prod_id');
        $this->assertNotNull($prodId);

        $rows = Prodvar::where('prod_id', $prodId)->orderBy('prodvar_id')->get();
        $this->assertCount(2, $rows);

        // The combinations survive as their own rows, with their own options.
        $this->assertSame('{"Color":"Cream","Size":"Medium"}', $rows[0]->prodvar_options);
        $this->assertSame('{"Color":"Black","Material":"Metallic"}', $rows[1]->prodvar_options);

        // The payload reports the axes the product varies along, so every
        // surface can render as many facets as the product really has.
        $payload = $added->json('data');
        $this->assertEqualsCanonicalizing(['Color', 'Size', 'Material'], $payload['option_axes']);
        $this->assertSame('Cream / Medium', $payload['variations'][0]['option_label']);
        $this->assertSame(['Color' => 'Cream', 'Size' => 'Medium'], $payload['variations'][0]['options']);

        // The legacy size / colour aliases are axis-aware rather than listing
        // every combination as both a size and a colour.
        $this->assertEqualsCanonicalizing(['Cream', 'Black'], array_column($payload['prod_colors'], 'name'));
    }

    public function test_the_same_combination_cannot_be_minted_twice_for_one_product()
    {
        $admin   = $this->makeEmployee();

        $this->json('POST', '/api/products/add', [
            'prod_name'  => 'Duplicate Tee',
            'prod_price' => 300,
            'variations' => [
                ['prodvar_stock' => 2, 'prodvar_options' => ['Color' => 'Cream', 'Size' => 'Medium']],
                ['prodvar_stock' => 3, 'prodvar_options' => ['color' => 'CREAM', 'size' => 'medium']],
            ],
        ], $this->headers($admin))
            ->assertStatus(409)
            ->assertJson(['success' => false]);

        $this->assertSame(0, Product::where('prod_name', 'Duplicate Tee')->count());
    }

    public function test_a_single_combination_can_be_edited_without_retiring_the_others()
    {
        $admin   = $this->makeEmployee();
        $product = $this->shirt();

        $medium = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Medium')->first();
        $largeId = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Large')->value('prodvar_id');

        $updated = $this->json('PUT', '/api/products/update', [
            'prod_id' => $product->prod_id,
            'variant' => [
                'prodvar_id'     => $medium->prodvar_id,
                'prodvar_stock'  => 12,
                'prodvar_markup' => 25,
            ],
        ], $this->headers($admin));

        $updated->assertStatus(200);

        $medium->refresh();
        $this->assertSame(12, (int) $medium->prodvar_stock);
        $this->assertEquals(25.0, (float) $medium->prodvar_markup);

        // The other combination - and its prodvar_id - is untouched, so every
        // bag row and every prodsales row hanging off it survives the edit.
        $this->assertSame($largeId, (int) Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Large')->value('prodvar_id'));
        $this->assertSame(2, (int) Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Large')->value('prodvar_stock'));
    }

    public function test_a_combination_can_be_added_to_a_product_that_already_exists()
    {
        $admin   = $this->makeEmployee();
        $product = $this->shirt();

        $added = $this->json('PUT', '/api/products/update', [
            'prod_id' => $product->prod_id,
            'variant' => [
                'prodvar_name'  => 'Cream / Small',
                'prodvar_stock' => 4,
                'prodvar_options' => ['Color' => 'Cream', 'Size' => 'Small'],
            ],
        ], $this->headers($admin));

        $added->assertStatus(200)
            ->assertJson(['message' => 'Variation "Cream / Small" added to the product']);

        $small = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Small')->first();
        $this->assertNotNull($small);
        $this->assertSame('{"Color":"Cream","Size":"Small"}', $small->prodvar_options);

        // Editing an existing variation onto a combination another row already
        // carries is refused rather than splitting that combination's stock.
        $this->json('PUT', '/api/products/update', [
            'prod_id' => $product->prod_id,
            'variant' => [
                'prodvar_id'      => $small->prodvar_id,
                'prodvar_options' => ['Color' => 'Cream', 'Size' => 'Medium'],
            ],
        ], $this->headers($admin))
            ->assertStatus(409);

        $this->assertSame(1, (int) Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Medium')->count());
    }

    public function test_a_combination_held_in_a_customer_bag_is_disabled_not_deleted()
    {
        $admin     = $this->makeEmployee();
        $customer  = $this->makeCustomer();
        $product   = $this->shirt();

        $medium = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Medium')->first();

        Bag::create([
            'bag_id'      => IdAllocator::next('bag', 'bag_id'),
            'cust_id'     => $customer->getKey(),
            'prodvar_id'  => $medium->prodvar_id,
            'bag_qty'     => 1,
            'bag_amount'  => 450,
            'bag_placed'  => DB::raw('false'),
            'bag_created' => now(),
        ]);

        // REQ-CW-02 / REQ-BAG-01: the row a customer holds must not vanish from
        // the bag, so it is retired as a disable instead of a delete.
        $this->json('PUT', '/api/products/update', [
            'prod_id' => $product->prod_id,
            'variant' => ['prodvar_id' => $medium->prodvar_id, 'remove' => true],
        ], $this->headers($admin))
            ->assertStatus(200)
            ->assertJson(['success' => true]);

        $medium->refresh();
        $this->assertNull($medium->prodvar_deleted);
        $this->assertNotNull($medium->prodvar_disabled);
    }

    public function test_an_unreferenced_combination_is_removed_and_the_last_one_is_kept()
    {
        $admin   = $this->makeEmployee();
        $product = $this->shirt();

        $large = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Large')->first();

        $this->json('PUT', '/api/products/update', [
            'prod_id' => $product->prod_id,
            'variant' => ['prodvar_id' => $large->prodvar_id, 'remove' => true],
        ], $this->headers($admin))->assertStatus(200);

        $large->refresh();
        $this->assertNotNull($large->prodvar_deleted);

        // A product needs at least one variation: the last row is refused.
        $medium = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Medium')->first();

        $this->json('PUT', '/api/products/update', [
            'prod_id' => $product->prod_id,
            'variant' => ['prodvar_id' => $medium->prodvar_id, 'remove' => true],
        ], $this->headers($admin))
            ->assertStatus(422)
            ->assertJson(['message' => 'A product needs at least one variation. Edit this one instead of removing it.']);
    }

    public function test_bulk_variation_edits_preserve_the_ids_the_bags_point_at()
    {
        $admin   = $this->makeEmployee();
        $product = $this->shirt();

        $mediumId = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Medium')->value('prodvar_id');

        // A full reconciliation may legitimately rename every row - the old
        // implementation soft-deleted each one and minted a replacement, which
        // orphaned every bag row and detached the product's sales history.
        $this->json('PUT', '/api/products/update', [
            'prod_id' => $product->prod_id,
            'variations' => [
                [
                    'prodvar_name'  => 'Cream / Medium',
                    'prodvar_stock' => 7,
                    'prodvar_options' => ['Color' => 'Cream', 'Size' => 'Medium'],
                ],
                [
                    'prodvar_name'  => 'Cream / Small',
                    'prodvar_stock' => 9,
                    'prodvar_options' => ['Color' => 'Cream', 'Size' => 'Small'],
                ],
            ],
        ], $this->headers($admin))->assertStatus(200);

        $this->assertSame($mediumId, (int) Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Medium')->value('prodvar_id'));
        $this->assertSame(7, (int) Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Medium')->value('prodvar_stock'));

        // The combination that left the set is retired.
        $this->assertNotNull(Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Large')->whereNotNull('prodvar_deleted')->first());
    }

    // ==========================================
    // DOMAIN 11 - WALK-IN ORDERS
    // ==========================================

    public function test_the_register_rings_up_the_combination_it_was_named()
    {
        $admin   = $this->makeEmployee();
        $product = $this->shirt();

        $large = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Large')->first();

        $rung = $this->json('POST', '/api/pos/add', [
            'prod_id'  => $product->prod_id,
            'item_qty' => 2,
            'prodvar_id' => $large->prodvar_id,
        ], $this->headers($admin));

        $rung->assertStatus(201);
        $this->assertSame($large->prodvar_id, $rung->json('data.item.prodvar_id'));

        // A label that names no live variation is refused with the combinations
        // that do exist. Falling back to the main row used to decrement the
        // wrong stock bucket and print the wrong combination on the receipt.
        // A label that names no live variation is refused with the combinations
        // that do exist. Falling back to the main row used to decrement the
        // wrong stock bucket and print the wrong combination on the receipt.
        $refused = $this->json('POST', '/api/pos/add', [
            'prod_id'   => $product->prod_id,
            'variant'   => 'Neon / Enormous',
            'item_qty'  => 1,
        ], $this->headers($admin));
        $refused->assertStatus(422)
            ->assertJson(['success' => false]);

        // The combinations the product DOES have travel with the refusal, so the
        // cashier can pick one instead of being told "no".
        $choices = $refused->json('available');
        $this->assertCount(2, $choices);
        $this->assertSame('Cream / Medium', $choices[0]['label']);

        $medium = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Medium')->first();
        $this->assertSame(6, (int) $medium->fresh()->prodvar_stock);
    }

    public function test_the_register_resolves_a_combination_from_its_options()
    {
        $admin   = $this->makeEmployee();
        $product = $this->shirt();

        $large = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Large')->first();

        $rung = $this->json('POST', '/api/pos/add', [
            'prod_id'        => $product->prod_id,
            'item_qty'       => 1,
            'variant_options' => ['Color' => 'Cream', 'Size' => 'Large'],
        ], $this->headers($admin));

        $rung->assertStatus(201);
        $this->assertSame($large->prodvar_id, $rung->json('data.item.prodvar_id'));
        $this->assertSame('Cream / Large', $rung->json('data.item.prodvar_label'));
    }

    // ==========================================
    // DOMAIN 13 - REVIEWS
    // ==========================================

    public function test_a_deleted_review_leaves_the_customer_free_to_review_again()
    {
        $customer = $this->makeCustomer();
        $admin    = $this->makeEmployee();
        $product  = $this->makeProduct();

        $medium = $this->makeVariation($product, [
            'prodvar_name'  => 'Standard',
            'prodvar_stock' => 5,
            'prodvar_main'  => true,
        ]);

        $order = Order::create([
            'cust_id'     => $customer->getKey(),
            'ord_created' => now(),
            'ord_status'  => 'claimed',
            'ord_amount'  => 450,
        ]);
        $bag = Bag::create([
            'bag_id'      => IdAllocator::next('bag', 'bag_id'),
            'cust_id'     => $customer->getKey(),
            'prodvar_id'  => $medium->prodvar_id,
            'bag_qty'     => 1,
            'bag_amount'  => 450,
            'bag_placed'  => DB::raw('true'),
            'bag_created' => now(),
        ]);
        Item::create(['ord_id' => $order->ord_id, 'bag_id' => $bag->bag_id]);

        $this->json('POST', '/api/reviews/create', [
            'ord_id'     => $order->ord_id,
            'prod_id'    => $product->prod_id,
            'rating'     => 5,
            'message'    => 'Great shirt',
        ], $this->headers($customer))->assertStatus(201);

        $review = Review::where('prod_id', $product->prod_id)->first();
        $this->assertNotNull($review);

        // An employee removes it: REQ-MANAGE_REV-03 keeps the row for audit but
        // it must not silence the customer for good.
        $this->json('DELETE', '/api/reviews/delete', [
            'rev_id' => $review->rev_id,
        ], $this->headers($admin))->assertStatus(200);

        $this->json('POST', '/api/reviews/create', [
            'ord_id'  => $order->ord_id,
            'prod_id' => $product->prod_id,
            'rating'  => 4,
            'message' => 'Still great',
        ], $this->headers($customer))->assertStatus(201);

        $reviews = Review::where('prod_id', $product->prod_id)
            ->whereRaw("rev_msg NOT LIKE '[DELETED]%'")
            ->get();
        $this->assertCount(1, $reviews);
        $this->assertSame(4, $reviews->first()->rating());

        // Moderating a deleted row is answered as gone rather than rewriting
        // the audit record.
        $this->json('POST', '/api/reviews/moderate', [
            'rev_id'  => $review->rev_id,
            'approve' => true,
        ], $this->headers($admin))->assertStatus(404);
    }

    public function test_a_customer_only_sees_approved_reviews_of_a_multi_axis_product()
    {
        $customer = $this->makeCustomer();
        $product  = $this->shirt();

        $medium = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Medium')->first();

        $order = Order::create([
            'cust_id'     => $customer->getKey(),
            'ord_created' => now(),
            'ord_status'  => 'claimed',
        ]);
        $bag = Bag::create([
            'bag_id'      => IdAllocator::next('bag', 'bag_id'),
            'cust_id'     => $customer->getKey(),
            'prodvar_id'  => $medium->prodvar_id,
            'bag_qty'     => 1,
            'bag_amount'  => 450,
            'bag_placed'  => DB::raw('true'),
            'bag_created' => now(),
        ]);
        Item::create(['ord_id' => $order->ord_id, 'bag_id' => $bag->bag_id]);

        $this->json('POST', '/api/reviews/create', [
            'ord_id'  => $order->ord_id,
            'prod_id' => $product->prod_id,
            'rating'  => 4,
            'message' => 'Fits well',
        ], $this->headers($customer))->assertStatus(201);

        // REQ-MANAGE_REV-02: a pending review never reaches the customer wall.
        $this->json('GET', '/api/reviews/display', ['prod_id' => $product->prod_id])
            ->assertStatus(200)
            ->assertJson(['data' => []]);
    }

    // ==========================================
    // THE WHOLE INVENTORY WORKFLOW, END TO END
    // ==========================================

    /**
     * The pass the inventory domain was asked for, in one run: add a product
     * that variates along two axes at the same time, modify one of its
     * combinations, disable another, and then unlist the whole product.
     */
    public function test_add_edit_disable_a_multi_axis_product_from_the_inventory()
    {
        $admin = $this->makeEmployee();

        // 1. FLOW-ADD_PROD-02/03: a shirt that variates by colour AND size.
        $added = $this->json('POST', '/api/products/add', [
            'prod_name'  => 'Council Tee',
            'prod_categ' => 'Shirts',
            'prod_price' => 350,
            'prod_desc'  => 'Official BU USC shirt',
            'variations' => [
                ['prodvar_stock' => 5, 'prodvar_options' => ['Color' => 'Cream', 'Size' => 'Small']],
                ['prodvar_stock' => 6, 'prodvar_options' => ['Color' => 'Cream', 'Size' => 'Medium']],
                ['prodvar_stock' => 2, 'prodvar_options' => ['Color' => 'Black', 'Size' => 'Metallic', 'Material' => 'Metallic']],
            ],
        ], $this->headers($admin))->assertStatus(201);

        $prodId = (int) $added->json('data.prod_id');
        $this->assertSame(13, (int) $added->json('data.prod_qty'));
        $this->assertEqualsCanonicalizing(
            ['Color', 'Size', 'Material'],
            $added->json('data.option_axes')
        );

        // FLOW-ADD_PROD-06: a new product is active, so it reaches the catalog.
        $catalog = $this->json('GET', '/api/products/filter', ['status' => 'active'])
            ->assertStatus(200)->json('data');
        $this->assertTrue(collect($catalog)->contains(fn ($row) => (int) $row['prod_id'] === $prodId));

        // 2. FLOW-MANAGE_INV-05: modify the details of ONE combination.
        $medium = Prodvar::where('prod_id', $prodId)
            ->whereRaw("prodvar_options = ?", ['{"Color":"Cream","Size":"Medium"}'])->first();

        $this->json('PUT', '/api/products/update', [
            'prod_id' => $prodId,
            'variant' => [
                'prodvar_id'     => $medium->prodvar_id,
                'prodvar_stock'  => 20,
                'prodvar_markup' => 15,
            ],
        ], $this->headers($admin))->assertStatus(200);

        $medium->refresh();
        $this->assertSame(20, (int) $medium->prodvar_stock);
        $this->assertEquals(15.0, (float) $medium->prodvar_markup);

        // 3. Disable one combination: it can no longer be ordered.
        $this->json('PUT', '/api/products/update', [
            'prod_id' => $prodId,
            'variant' => ['prodvar_id' => $medium->prodvar_id, 'prodvar_disabled' => true],
        ], $this->headers($admin))->assertStatus(200);

        $medium->refresh();
        $this->assertNotNull($medium->prodvar_disabled);

        // The register refuses to ring up a disabled combination.
        $this->json('POST', '/api/pos/add', [
            'prod_id'    => $prodId,
            'prodvar_id' => $medium->prodvar_id,
            'item_qty'   => 1,
        ], $this->headers($admin))->assertStatus(400);

        // 4. FLOW-MANAGE_INV-07: unlisting the product hides it from customers
        //    the same moment it lands (REQ-MANAGE_INV-02).
        $this->json('POST', '/api/products/unlist', ['prod_id' => $prodId], $this->headers($admin))
            ->assertStatus(200);

        $after = $this->json('GET', '/api/products/filter', ['status' => 'active'])
            ->assertStatus(200)->json('data');
        $this->assertFalse(collect($after)->contains(fn ($row) => (int) $row['prod_id'] === $prodId));

        // The employee-side inventory still sees it, and can relist it.
        $disabled = $this->json('GET', '/api/products/filter', ['status' => 'disabled'])
            ->assertStatus(200)->json('data');
        $this->assertTrue(collect($disabled)->contains(fn ($row) => (int) $row['prod_id'] === $prodId));

        $this->json('POST', '/api/products/sell', ['prod_id' => $prodId], $this->headers($admin))
            ->assertStatus(200);

        $relisted = $this->json('GET', '/api/products/filter', ['status' => 'active'])
            ->assertStatus(200)->json('data');
        $this->assertTrue(collect($relisted)->contains(fn ($row) => (int) $row['prod_id'] === $prodId));
    }

    // ==========================================
    // THE PAYLOAD SHAPES THE ADMIN UI ACTUALLY SENDS
    // ==========================================

    /**
     * FLOW-ADD_PROD-02/03, as the "Use axes" editor posts it: one row per
     * combination with a BLANK name (the label is derived from the axes) and a
     * stock of zero. `ProductsAPI::parseVariations` promises to derive the
     * label and to accept zero, so the client never has to invent a name.
     */
    public function test_a_product_can_be_added_from_the_axis_matrix_payload()
    {
        $admin = $this->makeEmployee();

        $added = $this->json('POST', '/api/products/add', [
            'prod_name'  => 'Council Tee',
            'prod_categ' => 'Shirts',
            'prod_price' => 350,
            'prod_desc'  => '',
            'prod_qty'   => 0,
            'variations' => [
                [
                    'prodvar_name'  => '',
                    'prodvar_stock' => 0,
                    'prodvar_markup' => 0,
                    'prodvar_pic'   => '',
                    'prodvar_options' => ['Color' => 'Cream', 'Size' => 'Small'],
                ],
                [
                    'prodvar_name'  => '',
                    'prodvar_stock' => 0,
                    'prodvar_markup' => 0,
                    'prodvar_pic'   => '',
                    'prodvar_options' => ['Color' => 'Cream', 'Size' => 'Medium'],
                ],
                [
                    'prodvar_name'  => '',
                    'prodvar_stock' => 0,
                    'prodvar_markup' => 0,
                    'prodvar_pic'   => '',
                    'prodvar_options' => ['Color' => 'Black', 'Material' => 'Metallic'],
                ],
            ],
        ], $this->headers($admin))->assertStatus(201);

        $prodId = (int) $added->json('data.prod_id');
        $rows = Prodvar::where('prod_id', $prodId)->orderBy('prodvar_id')->get();
        $this->assertCount(3, $rows);

        // Every row is named after its combination, and every row is stocked.
        $this->assertSame('Cream / Small', $rows[0]->prodvar_name);
        $this->assertSame('Cream / Medium', $rows[1]->prodvar_name);
        $this->assertSame('Black / Metallic', $rows[2]->prodvar_name);
        foreach ($rows as $row) {
            $this->assertSame(0, (int) $row->prodvar_stock);
        }

        // The product is active, so it reaches the catalog.
        $catalog = $this->json('GET', '/api/products/filter', ['status' => 'active'])
            ->assertStatus(200)->json('data');
        $this->assertTrue(collect($catalog)->contains(fn ($row) => (int) $row['prod_id'] === $prodId));
    }

    /**
     * FLOW-MANAGE_INV-01, as the product-detail page posts it: the drawer's
     * Enable / Disable switch sends `prodvar_disabled` as a bare boolean and
     * nothing else, so a re-enable has to clear the stamp and a disable has to
     * set it.
     */
    public function test_a_combination_can_be_disabled_and_reenabled_on_its_own()
    {
        $admin   = $this->makeEmployee();
        $product = $this->shirt();

        $medium = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Medium')->first();
        $large = Prodvar::where('prod_id', $product->prod_id)
            ->where('prodvar_name', 'Cream / Large')->first();

        // Disable
        $this->json('PUT', '/api/products/update', [
            'prod_id' => $product->prod_id,
            'variant' => ['prodvar_id' => $medium->prodvar_id, 'prodvar_disabled' => true],
        ], $this->headers($admin))->assertStatus(200);
        $medium->refresh();
        $this->assertNotNull($medium->prodvar_disabled);

        // The other combination is untouched, and stays sellable.
        $large->refresh();
        $this->assertNull($large->prodvar_disabled);
        $this->json('POST', '/api/pos/add', [
            'prod_id'    => $product->prod_id,
            'prodvar_id' => $large->prodvar_id,
            'item_qty'   => 1,
        ], $this->headers($admin))->assertStatus(201);

        // Re-enable. `prodvar_disabled` is a boolean field, and the drawer
        // sends `false` to bring a combination back: the API must read it as a
        // boolean (filled() is true for every bool in Laravel 11+, so the
        // stamp used to be re-set instead of cleared).
        $this->json('PUT', '/api/products/update', [
            'prod_id' => $product->prod_id,
            'variant' => ['prodvar_id' => $medium->prodvar_id, 'prodvar_disabled' => false],
        ], $this->headers($admin))->assertStatus(200);
        $medium->refresh();
        $this->assertNull($medium->prodvar_disabled);

        // A disabled combination can no longer be rung up at the register.
        $this->json('PUT', '/api/products/update', [
            'prod_id' => $product->prod_id,
            'variant' => ['prodvar_id' => $large->prodvar_id, 'prodvar_disabled' => true],
        ], $this->headers($admin))->assertStatus(200);
        $this->json('POST', '/api/pos/add', [
            'prod_id'    => $product->prod_id,
            'prodvar_id' => $large->prodvar_id,
            'item_qty'   => 1,
        ], $this->headers($admin))->assertStatus(400);
    }
}
