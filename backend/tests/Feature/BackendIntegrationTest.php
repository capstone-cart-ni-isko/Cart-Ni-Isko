<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Product;
use App\Models\Wishlist;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\WithFaker;
use Illuminate\Support\Facades\Schema;

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

    /**
     * FLOW-CUST_SIGNUP-02: the canonical account type is "BUeño" itself, so
     * that exact spelling - accent included - has to clear validation and
     * land on the row. The byte-wise letter strip it used to get collapsed it
     * to "buo", which the validator refused with a 422.
     */
    public function test_signup_accepts_the_canonical_bueno_account_type()
    {
        $response = $this->postJson('/api/auth/cust_signup', [
            'phone'        => '0999' . rand(1000000, 9999999),
            'password'     => 'Password123!',
            'givname'      => 'Isko',
            'surname'      => 'Bueno' . rand(100, 999),
            'email'        => 'bueno_' . rand(1000, 9999) . '@bicol-u.edu.ph',
            'type'         => 'BUeño',
            'cust_categ'   => 'student',
            'cust_college' => 'College of Engineering and Technology',
            'cust_dept'    => 'BS Information Technology',
        ]);

        $response->assertStatus(201)->assertJson(['success' => true]);

        $customer = Customer::find($response->json('data.cust_id'));
        $this->assertSame('BUeño', $customer->cust_type);
    }

    /**
     * DOMAIN 17 against the REAL system-new.docx table shape.
     *
     * The suite normally runs on the pre-migration fixture, so the live
     * columns (cust_givname / cust_surname / cust_categ / cust_backup_code)
     * - and every NOT NULL constraint they carry - are never exercised.
     * This test swaps in the exact live shape (verified read-only against
     * information_schema: 35 columns, cust_backup_code NOT NULL DEFAULT '/')
     * and pushes a signup through it, because an insert that violates one of
     * those constraints comes back as a 500 on the real database.
     *
     * RefreshDatabase runs the whole test in one transaction and SQLite DDL
     * is transactional, so the fixture table is restored on rollback.
     */
    public function test_signup_persists_to_the_live_system_new_customer_table()
    {
        $this->recreateCustomerTableAsLiveSchema();

        // FLOW-CUST_SIGNUP-03: a BUeño carries cust_type / cust_categ /
        // cust_college / cust_dept onto the row.
        $buenoEmail = 'live_' . rand(1000, 9999) . '@bicol-u.edu.ph';
        $bueno = $this->postJson('/api/auth/cust_signup', [
            'phone'        => '0917' . rand(1000000, 9999999),
            'password'     => 'Password123!',
            'givname'      => 'Isko',
            'surname'      => 'Live' . rand(100, 999),
            'email'        => $buenoEmail,
            'type'         => 'BUeño',
            'cust_categ'   => 'student',
            'cust_college' => 'College of Engineering and Technology',
            'cust_dept'    => 'BS Information Technology',
        ]);

        $bueno->assertStatus(201)->assertJson(['success' => true]);
        $this->assertTrue((bool) $bueno->json('data.requires_otp'));
        $this->assertNull($bueno->json('data.token'), 'Signup must not open a session.');

        $buenoRow = Customer::find($bueno->json('data.cust_id'));
        $this->assertSame('BUeño', $buenoRow->cust_type);
        $this->assertSame('student', $buenoRow->cust_categ);
        $this->assertSame('College of Engineering and Technology', $buenoRow->cust_college);
        $this->assertSame('BS Information Technology', $buenoRow->cust_dept);
        $this->assertSame($buenoEmail, $buenoRow->cust_email);
        $this->assertSame('Isko', $buenoRow->cust_givname);
        // The live column is NOT NULL with default "/": the signup must write
        // the marker explicitly instead of an aborting NULL (SQLSTATE 23502).
        $this->assertSame('/', $buenoRow->cust_backup_code);
        // FLOW-CUST_SIGNUP-05: created but NOT finalized.
        $this->assertNull($buenoRow->cust_login_active);

        // REQ-CUST_SIGNUP-04: the six-digit code reaches the account inbox
        // and clearing it is what finalizes the registration.
        $otp = $this->inboxCodeFor((int) $buenoRow->cust_id);
        $verify = $this->postJson('/api/otp/challenge/verify', [
            'purpose'   => 'signup',
            'challenge' => $bueno->json('data.challenge'),
            'code'      => $otp,
        ]);
        $verify->assertStatus(200)->assertJson(['success' => true]);
        $this->assertNotEmpty($verify->json('data.token'));

        // FLOW-CUST_SIGNUP-04: a guest carries no university affiliation.
        $guest = $this->postJson('/api/auth/cust_signup', [
            'phone'    => '0918' . rand(1000000, 9999999),
            'password' => 'Password123!',
            'givname'  => 'Bisita',
            'surname'  => 'Tubod' . rand(100, 999),
            'email'    => 'guest_' . rand(1000, 9999) . '@example.com',
            'type'     => 'guest',
        ]);

        $guest->assertStatus(201)->assertJson(['success' => true]);

        $guestRow = Customer::find($guest->json('data.cust_id'));
        $this->assertSame('guest', $guestRow->cust_type);
        $this->assertNull($guestRow->cust_categ, 'A guest owes no cust_categ.');
        $this->assertNull($guestRow->cust_college, 'A guest owes no cust_college.');
        $this->assertNull($guestRow->cust_dept, 'A guest owes no cust_dept.');
        $this->assertSame('/', $guestRow->cust_backup_code);

        // FLOW-CUST_SIGNUP-06: the email address may not be registered.
        $duplicateEmail = $this->postJson('/api/auth/cust_signup', [
            'phone'        => '0919' . rand(1000000, 9999999),
            'password'     => 'Password123!',
            'givname'      => 'Tulis',
            'surname'      => 'Iskoso' . rand(100, 999),
            'email'        => $buenoEmail,
            'type'         => 'BUeño',
            'cust_categ'   => 'student',
            'cust_college' => 'College of Engineering and Technology',
            'cust_dept'    => 'BS Information Technology',
        ]);
        $duplicateEmail->assertStatus(409);

        // FLOW-CUST_SIGNUP-07: the phone has to hold the 10-to-11 digit
        // format the frontend enforces as well (the format runner answers
        // with 400, the same status every other format failure uses).
        $badPhone = $this->postJson('/api/auth/cust_signup', [
            'phone'    => '091234567', // nine digits
            'password' => 'Password123!',
            'givname'  => 'Bali',
            'surname'  => 'Aso' . rand(100, 999),
            'email'    => 'badphone_' . rand(1000, 9999) . '@example.com',
            'type'     => 'guest',
        ]);
        $badPhone->assertStatus(400)
                 ->assertJson(['success' => false]);
        $this->assertStringContainsString('10 to 11 digits', $badPhone->json('message'));

        // Cleanup (rolled back anyway, but keeps the fixture rows tidy).
        Customer::where('cust_id', $buenoRow->cust_id)->delete();
        Customer::where('cust_id', $guestRow->cust_id)->delete();
    }

    /**
     * Rebuilds `customer` with the live system-new.docx shape (read-only
     * inspection of information_schema: 35 columns), so the signup insert is
     * held to the exact NOT NULL / UNIQUE rules of the real database.
     */
    private function recreateCustomerTableAsLiveSchema(): void
    {
        Schema::drop('customer');

        Schema::create('customer', function (Blueprint $table) {
            $table->bigInteger('cust_id')->primary(); // no sequence on the live table - IdAllocator assigns it
            $table->timestampTz('cust_created')->useCurrent();
            $table->timestamp('cust_deleted')->nullable();
            $table->timestamp('cust_suspended')->nullable();
            $table->string('cust_password');
            $table->string('cust_givname');
            $table->string('cust_surname');
            $table->string('cust_email')->nullable()->unique('customer_cust_email_key');
            $table->string('cust_phone')->unique('customer_cust_phone_key');
            $table->string('cust_callcode')->default('+63');
            $table->string('cust_pronoun')->default('they/them');
            $table->string('cust_type')->default('guest');
            $table->string('cust_categ')->nullable()->default('student');
            $table->string('cust_college')->nullable();
            $table->string('cust_dept')->nullable();
            $table->string('cust_address')->nullable();
            $table->date('cust_bday')->nullable();
            $table->string('cust_avatar')->nullable();
            $table->string('cust_backup_phone')->nullable();
            $table->string('cust_backup_email')->nullable();
            $table->string('cust_backup_ques')->nullable();
            $table->string('cust_backup_answer')->nullable();
            $table->string('cust_backup_code')->default('/'); // NOT NULL on the live table
            $table->boolean('cust_darkmode')->default(false);
            $table->string('cust_login_active')->nullable();
            $table->timestamp('cust_login_failed')->nullable();
            $table->timestamp('cust_last_logout')->nullable();
            $table->integer('cust_notif_appointremind')->default(10);
            $table->boolean('cust_notif_email')->default(false);
            $table->boolean('cust_notif_prod')->default(false);
            $table->integer('cust_appoint')->default(0);
            $table->integer('cust_orders')->default(0);
            $table->integer('cust_bag')->default(0);
            $table->integer('cust_wishlist')->default(0);
            $table->integer('cust_unread')->default(0);
        });
    }
}
