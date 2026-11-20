<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Support\ApiToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Security review 2026-11-20: password recovery must not be possible from a
 * phone number alone, and the signed-out OTP inbox must not leak codes.
 */
class AccountRecoverySecurityTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

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
            'cust_phone'     => '09' . str_pad((string) (710000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'cust_email'     => 'recover' . $this->seq . uniqid() . '@example.com',
            'cust_type'      => 'Student',
            'cust_college'   => 'BUCE',
            'cust_wishlist'  => 0,
            'cust_cart'      => 0,
            'cust_orders'    => 0,
            'cust_appoints'  => 0,
        ], $attributes));
    }

    private function bearer(Customer $customer): array
    {
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer ' . ApiToken::issue($customer)];
    }

    public function test_recovery_with_only_a_phone_number_is_refused()
    {
        $customer = $this->makeCustomer();

        $this->postJson('/api/auth/recover_credentials', [
            'account_type' => 'customer',
            'identifier'   => $customer->cust_phone,
        ])->assertStatus(400);

        $this->postJson('/api/auth/recover_credentials', [
            'account_type'  => 'customer',
            'identifier'    => $customer->cust_phone,
            'recovery_code' => 'WRONG-CODE-0000',
        ])->assertStatus(422)->assertJsonPath('code', 'RECOVERY_MISMATCH');
    }

    public function test_unknown_accounts_get_the_same_answer_as_a_wrong_code()
    {
        $this->postJson('/api/auth/recover_credentials', [
            'account_type'  => 'customer',
            'identifier'    => '09999999999',
            'recovery_code' => 'ABCD-EFGH-JKLM',
        ])->assertStatus(422)->assertJsonPath('code', 'RECOVERY_MISMATCH');
    }

    public function test_a_saved_recovery_code_resets_the_password_once()
    {
        $customer = $this->makeCustomer();

        $this->postJson('/api/auth/recovery_code', ['current_password' => 'wrong'], $this->bearer($customer))
            ->assertStatus(422);

        $code = $this->postJson('/api/auth/recovery_code', ['current_password' => 'Password123!'], $this->bearer($customer))
            ->assertStatus(200)
            ->json('data.recovery_code');
        $this->assertMatchesRegularExpression('/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/', $code);
        $this->assertStringStartsWith('$2y$', (string) $customer->fresh()->cust_backup_code);

        $challenge = $this->postJson('/api/auth/recover_credentials', [
            'account_type'  => 'customer',
            'identifier'    => $customer->cust_phone,
            'recovery_code' => strtolower($code),
        ])->assertStatus(200)->json('data.challenge');

        $this->postJson('/api/auth/reset_credentials', [
            'challenge'                 => $challenge,
            'new_password'              => 'NewPassword456!',
            'new_password_confirmation' => 'NewPassword456!',
        ])->assertStatus(200);

        $this->assertTrue(Hash::check('NewPassword456!', (string) $customer->fresh()->cust_password));

        // Single use.
        $this->postJson('/api/auth/recover_credentials', [
            'account_type'  => 'customer',
            'identifier'    => $customer->cust_phone,
            'recovery_code' => $code,
        ])->assertStatus(422);
    }

    public function test_the_signed_out_inbox_never_returns_a_code_outside_demo_mode()
    {
        config(['otp.demo_mode' => false]);
        $customer = $this->makeCustomer();
        $challenge = ApiToken::challenge($customer, 'signup');

        $this->postJson('/api/otp/challenge/start', ['challenge' => $challenge, 'purpose' => 'signup'])
            ->assertStatus(200);

        $this->postJson('/api/otp/challenge/inbox', ['challenge' => $challenge, 'purpose' => 'signup'])
            ->assertStatus(200)
            ->assertJsonPath('data.code', null)
            ->assertJsonPath('data.notifications', []);
    }

    public function test_demo_mode_reveals_signup_codes_but_never_recovery_codes()
    {
        config(['otp.demo_mode' => true]);
        $customer = $this->makeCustomer();

        $signup = ApiToken::challenge($customer, 'signup');
        $this->postJson('/api/otp/challenge/start', ['challenge' => $signup, 'purpose' => 'signup'])
            ->assertStatus(200);
        $code = $this->postJson('/api/otp/challenge/inbox', ['challenge' => $signup, 'purpose' => 'signup'])
            ->assertStatus(200)
            ->json('data.code');
        $this->assertMatchesRegularExpression('/^\d{6}$/', (string) $code);

        $recovery = ApiToken::challenge($customer, 'recovery');
        $this->postJson('/api/otp/challenge/inbox', ['challenge' => $recovery, 'purpose' => 'recovery'])
            ->assertStatus(200)
            ->assertJsonPath('data.code', null);
    }

    public function test_a_stored_hash_cannot_be_used_as_the_password()
    {
        $customer = $this->makeCustomer();

        $this->postJson('/api/auth/cust_login', [
            'phone'    => $customer->cust_phone,
            'password' => (string) $customer->cust_password,
        ])->assertJsonPath('success', false);
    }

    public function test_secret_columns_are_not_serialised()
    {
        $customer = $this->makeCustomer([
            'cust_backup_code'   => Hash::make('X'),
            'cust_backup_answer' => 'secret',
        ]);

        $array = $customer->fresh()->toArray();
        $this->assertArrayNotHasKey('cust_backup_code', $array);
        $this->assertArrayNotHasKey('cust_backup_answer', $array);
        $this->assertArrayNotHasKey('cust_password', $array);
    }

    // ==========================================
    // BUG-05 / SEC-01 (user evaluation)
    // ==========================================

    private function signup(array $overrides = [])
    {
        return $this->postJson('/api/auth/cust_signup', array_merge([
            'phone'    => '09171234567',
            'password' => 'Password123!',
            'givname'  => 'Juan Carlos',
            'surname'  => 'Dela Cruz',
            'email'    => 'retry@example.com',
            'type'     => 'guest',
        ], $overrides));
    }

    public function test_an_unfinished_signup_does_not_lock_the_email()
    {
        $first = $this->signup()->assertStatus(201);

        // The person never entered the code and tries again, this time
        // with a different phone number.
        $second = $this->signup(['phone' => '09181234567'])->assertStatus(201);

        $this->assertSame($first->json('data.cust_id'), $second->json('data.cust_id'));
        $this->assertSame(1, Customer::where('cust_email', 'retry@example.com')->count());
        $this->assertSame('09181234567', Customer::where('cust_email', 'retry@example.com')->value('cust_phone'));
    }

    public function test_a_verified_account_still_blocks_a_duplicate_signup()
    {
        $this->makeCustomer(['cust_email' => 'taken@example.com']);

        $this->signup(['email' => 'taken@example.com'])->assertStatus(409);
    }

    public function test_signup_requires_a_philippine_mobile_number()
    {
        $this->signup(['phone' => '1234567890'])->assertStatus(400);
        $this->signup(['phone' => '0917123456'])->assertStatus(400);
        $this->signup(['phone' => '+63 917 123 4567'])->assertStatus(201);
    }
}
