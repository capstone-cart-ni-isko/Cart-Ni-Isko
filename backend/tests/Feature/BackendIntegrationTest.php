<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Product;
use App\Models\Wishlist;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\WithFaker;

class BackendIntegrationTest extends TestCase
{
    use WithFaker, RefreshDatabase;

    public function test_auth_product_and_wishlist_integration_flow()
    {
        $uniquePhone = '0999' . rand(1000000, 9999999);
        $uniqueEmail = 'emp_' . rand(1000, 9999) . '@bicol-u.edu.ph';
        $password = 'Password123!';

        // 1. CUSTOMER SIGNUP (public route, issues a Sanctum bearer token)
        $signupResponse = $this->postJson('/api/auth/cust_signup', [
            'phone' => $uniquePhone,
            'password' => $password,
            'nickname' => 'IskoTester',
            'pronoun' => 'he/him',
            'birthday' => '2001-05-15',
            'brgy' => 'Sagpon',
            'city' => 'Legazpi',
            'province' => 'Albay',
            'callcode' => '+63',
            'email' => 'isko_' . rand(1000, 9999) . '@example.com',
            'type' => 'Student',
            'college' => 'College of Engineering and Technology'
        ]);

        $signupResponse->assertStatus(201)
                       ->assertJson(['success' => true]);
        $this->assertNotEmpty($signupResponse->json('data.token'));
        $this->assertStringContainsString('|', $signupResponse->json('data.token'));

        $customerData = $signupResponse->json('data');
        $custId = $customerData['cust_id'];

        // 2. CUSTOMER LOGIN (returns its own bearer token)
        $loginResponse = $this->postJson('/api/auth/cust_login', [
            'phone' => $uniquePhone,
            'password' => $password
        ]);

        $loginResponse->assertStatus(200)
                      ->assertJson(['success' => true]);
        $this->assertNotEmpty($loginResponse->json('data.token'));

        $custToken = $loginResponse->json('data.token');
        $authHeader = ['Authorization' => 'Bearer ' . $custToken];

        // 3. EMPLOYEE SIGNUP (super-admin only, issues a temporary password) & LOGIN
        $superAdmin = Employee::create([
            'emp_created' => now(),
            'emp_password' => 'unused-password-hash',
            'emp_surname' => 'Super',
            'emp_givname' => 'Admin',
            'emp_pronoun' => 'they/them',
            'emp_birthday' => '2000-01-01',
            'emp_brgy' => 'Sagpon',
            'emp_city' => 'Legazpi',
            'emp_province' => 'Albay',
            'emp_phone' => '0917' . rand(1000000, 9999999),
            'emp_email' => 'superadmin_' . rand(1000, 9999) . '@bicol-u.edu.ph',
            'emp_type' => 'SUPER ADMIN',
        ]);
        $adminHeader = [
            'Authorization' => 'Bearer ' . $superAdmin->createToken('test')->plainTextToken,
        ];

        $empSignup = $this->postJson('/api/auth/emp_signup', [
            'email' => $uniqueEmail,
            'phone' => '0998' . rand(1000000, 9999999),
            'surname' => 'Dela Cruz',
            'givname' => 'Juan',
            'studnum' => '2023-12345',
            'college' => 'College of Engineering and Technology',
            'program' => 'BS Information Technology',
            'year' => 3,
            'bloc' => 'A',
            'type' => 'STAFF',
        ], $adminHeader);
        $empSignup->assertStatus(201);
        $temporaryPassword = $empSignup->json('data.temporary_password');
        $this->assertNotEmpty($temporaryPassword);

        $empLogin = $this->postJson('/api/auth/emp_login', [
            'email' => $uniqueEmail,
            'password' => $temporaryPassword
        ]);
        $empLogin->assertStatus(200);
        $this->assertNotEmpty($empLogin->json('data.token'));

        // 4. PROTECTED ROUTES REJECT REQUESTS WITHOUT A TOKEN
        // (forgetGuards: the sanctum guard caches the super admin resolved
        // during emp_signup, which would otherwise authorise this request)
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/products/add', [])->assertStatus(401);
        $this->json('GET', '/api/wishlist/display', ['cust_id' => $custId])->assertStatus(401);

        // 5. PRODUCT CATALOG - ADD PRODUCT (super-admin bearer token)
        $productTag = 'ITEM_' . rand(10000, 99999);
        $productName = 'BU Lanyard ' . rand(100, 999);
        $productPrice = 150.00;

        $addProductResponse = $this->postJson('/api/products/add', [
            'prod_name' => $productName,
            'prod_tag' => $productTag,
            'prod_categ' => 'ACCESSORIES',
            'prod_price' => $productPrice,
            'prod_qty' => 50,
            'prod_desc' => 'Official BU Student Lanyard'
        ], $adminHeader);

        $addProductResponse->assertStatus(201)
                           ->assertJson(['success' => true]);

        $productData = $addProductResponse->json('data');
        $prodId = $productData['prod_id'];

        // PRODUCT SEARCH, FILTER, SORT & VIEW ARE PUBLIC (guest catalog browsing)
        $searchResponse = $this->json('GET', '/api/products/search', ['q' => $productName]);
        $searchResponse->assertStatus(200)
                       ->assertJson(['success' => true]);

        $filterResponse = $this->json('GET', '/api/products/filter', ['category' => 'ACCESSORIES']);
        $filterResponse->assertStatus(200)
                       ->assertJson(['success' => true]);

        $this->json('GET', '/api/products/sort', ['sort_by' => 'name'])
             ->assertStatus(200)
             ->assertJson(['success' => true]);

        $this->json('GET', '/api/products/view', ['prod_tag' => $productTag])
             ->assertStatus(200)
             ->assertJson(['success' => true]);

        // 5. WISHLIST DATA FLOW - ADD TO WISHLIST
        $this->app['auth']->forgetGuards();
        $addWishlistResponse = $this->postJson('/api/wishlist/add', [
            'cust_id' => $custId,
            'prod_id' => $prodId,
            'item_qty' => 2
        ], $authHeader);

        $addWishlistResponse->assertStatus(201)
                            ->assertJson(['success' => true]);

        // VERIFY SUPABASE DB WISHLIST STATE
        $wishlistItem = Wishlist::where('cust_id', $custId)->where('prod_id', $prodId)->first();
        $this->assertNotNull($wishlistItem);
        $this->assertNotNull($wishlistItem->wish_created);

        $customerInDb = Customer::find($custId);
        $this->assertEquals(1, $customerInDb->cust_wishlist);

        // DISPLAY WISHLIST
        $displayWishlist = $this->json('GET', '/api/wishlist/display', ['cust_id' => $custId], $authHeader);
        $displayWishlist->assertStatus(200)
                        ->assertJson(['success' => true]);

        // UPDATE WISHLIST ITEM
        $updateWishlist = $this->putJson('/api/wishlist/update', [
            'cust_id' => $custId,
            'prod_id' => $prodId,
            'item_qty' => 5,
            'item_amount' => 750.00
        ], $authHeader);
        $updateWishlist->assertStatus(200);

        // TRANSFER WISHLIST TO ORDER
        $transferResponse = $this->postJson('/api/wishlist/to_order', [
            'cust_id' => $custId,
            'prod_id' => $prodId,
            'item_qty' => 5
        ], $authHeader);
        // The first transfer creates the customer's single cart order.
        $transferResponse->assertStatus(201);
        $this->assertDatabaseCount('orders', 1);

        // Wishlist and cart are independent; transferring must not remove the saved item.
        $customerAfterTransfer = Customer::find($custId);
        $this->assertEquals(1, $customerAfterTransfer->cust_wishlist);
        $this->assertEquals(1, $customerAfterTransfer->cust_cart);
        $this->assertDatabaseHas('wishlist', [
            'cust_id' => $custId,
            'prod_id' => $prodId,
        ]);

        // REMOVE FROM WISHLIST (CLEANUP CHECK)
        $removeResponse = $this->json('DELETE', '/api/wishlist/remove', [
            'cust_id' => $custId,
            'prod_id' => $prodId
        ], $authHeader);
        $removeResponse->assertStatus(200);

        // CLEANUP CREATED TEST DATA
        Wishlist::where('cust_id', $custId)->delete();
        Product::where('prod_id', $prodId)->delete();
        Customer::where('cust_id', $custId)->delete();
        Employee::where('emp_email', $uniqueEmail)->delete();
    }
}
