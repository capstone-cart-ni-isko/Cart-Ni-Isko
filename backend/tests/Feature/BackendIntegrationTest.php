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

        // 1. CUSTOMER SIGNUP
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
            'type' => 'Student'
        ]);

        $signupResponse->assertStatus(201)
                       ->assertJson(['success' => true]);

        $customerData = $signupResponse->json('data');
        $custId = $customerData['cust_id'];

        // 2. CUSTOMER LOGIN
        $loginResponse = $this->postJson('/api/auth/cust_login', [
            'phone' => $uniquePhone,
            'password' => $password
        ]);

        $loginResponse->assertStatus(200)
                      ->assertJson(['success' => true]);

        // 3. EMPLOYEE SIGNUP & LOGIN
        $empSignup = $this->postJson('/api/auth/emp_signup', [
            'email' => $uniqueEmail,
            'phone' => '0998' . rand(1000000, 9999999),
            'password' => $password,
            'surname' => 'Dela Cruz',
            'givname' => 'Juan',
            'studnum' => '2023-12345',
            'type' => 'Staff'
        ]);
        $empSignup->assertStatus(201);

        $empLogin = $this->postJson('/api/auth/emp_login', [
            'email' => $uniqueEmail,
            'password' => $password
        ]);
        $empLogin->assertStatus(200);

        // 4. PRODUCT CATALOG - ADD PRODUCT
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
        ]);

        $addProductResponse->assertStatus(201)
                           ->assertJson(['success' => true]);

        $productData = $addProductResponse->json('data');
        $prodId = $productData['prod_id'];

        // PRODUCT SEARCH & FILTER
        $searchResponse = $this->getJson('/api/products/search?q=' . urlencode($productName));
        $searchResponse->assertStatus(200)
                       ->assertJson(['success' => true]);

        $filterResponse = $this->getJson('/api/products/filter?category=ACCESSORIES');
        $filterResponse->assertStatus(200)
                       ->assertJson(['success' => true]);

        // 5. WISHLIST DATA FLOW - ADD TO WISHLIST
        $addWishlistResponse = $this->postJson('/api/wishlist/add', [
            'cust_id' => $custId,
            'prod_id' => $prodId,
            'item_qty' => 2
        ]);

        $addWishlistResponse->assertStatus(201)
                            ->assertJson(['success' => true]);

        // VERIFY SUPABASE DB WISHLIST STATE
        $wishlistItem = Wishlist::where('cust_id', $custId)->where('prod_id', $prodId)->first();
        $this->assertNotNull($wishlistItem);
        $this->assertNotNull($wishlistItem->wish_created);

        $customerInDb = Customer::find($custId);
        $this->assertEquals(1, $customerInDb->cust_wishlist);

        // DISPLAY WISHLIST
        $displayWishlist = $this->json('GET', '/api/wishlist/display', ['cust_id' => $custId]);
        $displayWishlist->assertStatus(200)
                        ->assertJson(['success' => true]);

        // UPDATE WISHLIST ITEM
        $updateWishlist = $this->putJson('/api/wishlist/update', [
            'cust_id' => $custId,
            'prod_id' => $prodId,
            'item_qty' => 5,
            'item_amount' => 750.00
        ]);
        $updateWishlist->assertStatus(200);

        // TRANSFER WISHLIST TO ORDER
        $transferResponse = $this->postJson('/api/wishlist/to_order', [
            'cust_id' => $custId,
            'prod_id' => $prodId,
            'item_qty' => 5
        ]);
        $transferResponse->assertStatus(200);

        $customerAfterTransfer = Customer::find($custId);
        $this->assertEquals(0, $customerAfterTransfer->cust_wishlist);
        $this->assertEquals(1, $customerAfterTransfer->cust_cart);

        // REMOVE FROM WISHLIST (CLEANUP CHECK)
        $removeResponse = $this->json('DELETE', '/api/wishlist/remove', [
            'cust_id' => $custId,
            'prod_id' => $prodId
        ]);
        $removeResponse->assertStatus(200);

        // CLEANUP CREATED TEST DATA
        Wishlist::where('cust_id', $custId)->delete();
        Product::where('prod_id', $prodId)->delete();
        Customer::where('cust_id', $custId)->delete();
        Employee::where('emp_email', $uniqueEmail)->delete();
    }
}
