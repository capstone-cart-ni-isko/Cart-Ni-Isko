<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\CustNotif;
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
        $custEmail = 'isko_' . rand(1000, 9999) . '@bicol-u.edu.ph';
        $password = 'Password123!';

        // 1. CUSTOMER SIGNUP (public route). FLOW-CUST_SIGNUP-05: the row is
        //    created but NOT finalized - no token comes back, only the signed
        //    challenge that carries the phone OTP.
        $signupResponse = $this->postJson('/api/auth/cust_signup', [
            'phone' => $uniquePhone,
            'password' => $password,
            'givname' => 'Isko',
            'surname' => 'Tester' . rand(100, 999),
            'pronoun' => 'he/him',
            'bday' => '2001-05-15',
            'brgy' => 'Sagpon',
            'city' => 'Legazpi',
            'province' => 'Albay',
            'callcode' => '+63',
            'email' => $custEmail,
            'type' => 'Student',
            'cust_categ' => 'student',
            'cust_college' => 'College of Engineering and Technology',
            'cust_dept' => 'BS Information Technology',
        ]);

        $signupResponse->assertStatus(201)
                       ->assertJson(['success' => true]);
        $this->assertTrue((bool) $signupResponse->json('data.requires_otp'));
        $this->assertNotEmpty($signupResponse->json('data.challenge'));
        $this->assertNull($signupResponse->json('data.token'), 'Signup must not open a session.');

        $customerData = $signupResponse->json('data');
        $custId = $customerData['cust_id'];
        $challenge = $customerData['challenge'];

        // 2. PHONE OTP (REQ-CUST_SIGNUP-04): the six-digit code is delivered
        //    to the account's own notification inbox, never to the signup
        //    answer, and clearing it is what finalizes the registration.
        $otpCode = $this->inboxCodeFor($custId);

        $verifyResponse = $this->postJson('/api/otp/challenge/verify', [
            'purpose' => 'signup',
            'challenge' => $challenge,
            'code' => $otpCode,
        ]);
        $verifyResponse->assertStatus(200)
                       ->assertJson(['success' => true]);
        $this->assertNotEmpty($verifyResponse->json('data.token'));

        // 3. CUSTOMER LOGIN (returns its own bearer token)
        $loginResponse = $this->postJson('/api/auth/cust_login', [
            'email' => $custEmail,
            'password' => $password
        ]);

        $loginResponse->assertStatus(200)
                      ->assertJson(['success' => true]);
        $this->assertNotEmpty($loginResponse->json('data.token'));

        $custToken = $loginResponse->json('data.token');
        $this->assertStringStartsWith('cni1.', $custToken);
        $authHeader = ['Authorization' => 'Bearer ' . $custToken];

        // 3. EMPLOYEE SIGNUP (super-admin only, issues a temporary password) & LOGIN
        //    forceCreate: the legacy fixture drops the columns the model does
        //    not list as fillable, and emp_birthday is NOT NULL there.
        $superAdmin = Employee::forceCreate([
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
        $adminToken = \App\Support\ApiToken::issue($superAdmin);
        // auth:api resolves the account from the signed bearer (ApiToken),
        // not from a stored Sanctum token.
        $this->assertNotNull(
            \App\Support\ApiToken::parse($adminToken),
            'The super-admin bearer must resolve to an account.'
        );
        $adminHeader = [
            'Authorization' => 'Bearer ' . $adminToken,
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
        if ($empSignup->status() !== 201) {
            $this->fail('emp_signup failed: ' . json_encode($empSignup->json()));
        }
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
        //    forgetGuards: the RequestGuard above cached the "no token"
        //    answer from the two 401 checks, so a fresh one is needed before
        //    a request that DOES carry a bearer.
        $this->app['auth']->forgetGuards();
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
        // FLOW-WISHLIST-06: the transfer lands in the cart (one live bag line
        // for the variation), it does not build an orders row.
        $transferResponse->assertStatus(201);
        $this->assertDatabaseCount('bag', 1);
        $this->assertDatabaseHas('bag', [
            'cust_id' => $custId,
            'bag_placed' => false,
        ]);

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

    /**
     * REQ-CUST_SIGNUP-04: the six-digit code only ever travels through the
     * account's own notification inbox - the signup answer carries the
     * challenge, never the code - so the test reads it from where the
     * customer would: the newest custnotif row of that account.
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
}
