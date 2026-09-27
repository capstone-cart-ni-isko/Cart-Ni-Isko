<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\CustLog;
use App\Models\Customer;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Walk-in guard on the order cancel / return path (REQ-POS-02 / REQ-ALR-03).
 *
 * A walk-in is any customer whose phone is 0000000000. Those records have no
 * account to return to, so a cancel or return request is only accepted while
 * an open VISIT appointment backs it. Rejections answer 403 with the
 * ALR_WALK_IN_NO_VISIT code and are written to custlog.
 *
 * Runs on phpunit's sqlite :memory: database — no Supabase row is touched.
 */
class WalkInGuardTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;
    private array $tokens = [];

    // ==========================================
    // FIXTURE HELPERS
    // ==========================================

    private function headers($model): array
    {
        // The sanctum guard caches the resolved user for the life of the
        // application instance, and feature tests reuse that instance, so the
        // guards are dropped to let every request re-authenticate its token.
        $this->app['auth']->forgetGuards();

        $key = get_class($model) . ':' . $model->getKey();
        if (! isset($this->tokens[$key])) {
            $this->tokens[$key] = $model->createToken('test')->plainTextToken;
        }

        return ['Authorization' => 'Bearer ' . $this->tokens[$key]];
    }

    /** A walk-in record: REQ-POS-01 keys them off cust_phone 0000000000. */
    private function makeWalkIn(): Customer
    {
        $this->seq++;

        return Customer::create([
            'cust_created'  => now(),
            'cust_password' => Hash::make('Password123!'),
            'cust_nickname' => 'Walk In ' . $this->seq,
            'cust_pronoun'  => 'they/them',
            'cust_birthday' => '2001-01-01',
            'cust_brgy'     => 'Sagpon',
            'cust_city'     => 'Legazpi',
            'cust_province' => 'Albay',
            'cust_country'  => '',
            'cust_callcode' => '+63',
            'cust_phone'    => '0000000000',
            'cust_email'    => 'walkin' . $this->seq . uniqid() . '@example.com',
            'cust_type'     => 'Student',
            'cust_cart'     => 0,
            'cust_orders'   => 0,
            'cust_appoints' => 0,
        ]);
    }

    private function makeOrder(Customer $customer, string $status = 'TO PROCESS'): Order
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

    /** An appointment; pass $closed to simulate a finished one. */
    private function makeAppointment(
        Customer $customer,
        string $type = 'VISIT',
        bool $closed = false
    ): Appointment {
        return Appointment::create([
            'cust_id'         => $customer->getKey(),
            'appoint_created' => now(),
            'appoint_closed'  => $closed ? now() : null,
            'appoint_date'    => now()->addDays(2)->format('Y-m-d H:00'),
            'appoint_type'    => $type,
            'appoint_qr'      => 'APPT-' . strtoupper(substr(md5(uniqid()), 0, 12)),
            'appoint_desc'    => 'Test appointment',
        ]);
    }

    // ==========================================
    // ACCEPTED: AN OPEN VISIT APPOINTMENT BACKS THE REQUEST
    // ==========================================

    public function test_walk_in_with_an_open_visit_appointment_may_request_a_cancel()
    {
        $walkIn = $this->makeWalkIn();
        $this->makeAppointment($walkIn, 'VISIT');
        $order = $this->makeOrder($walkIn);

        $response = $this->putJson(
            '/api/orders/update',
            ['ord_id' => $order->getKey(), 'ord_status' => 'CANCEL REQUESTED'],
            $this->headers($walkIn)
        );

        $response->assertStatus(200)->assertJsonPath('success', true);
        $this->assertSame('CANCEL REQUESTED', $order->fresh()->ord_status);
        $this->assertDatabaseCount('custlog', 0);
    }

    public function test_walk_in_with_several_visit_appointments_may_request_a_cancel()
    {
        $walkIn = $this->makeWalkIn();
        // Two already finished and one still open: any open VISIT is enough
        $this->makeAppointment($walkIn, 'VISIT', true);
        $this->makeAppointment($walkIn, 'VISIT', true);
        $this->makeAppointment($walkIn, 'VISIT');
        $order = $this->makeOrder($walkIn);

        $this->putJson(
            '/api/orders/update',
            ['ord_id' => $order->getKey(), 'ord_status' => 'CANCEL REQUESTED'],
            $this->headers($walkIn)
        )->assertStatus(200);
    }

    // ==========================================
    // REJECTED: NO OPEN VISIT APPOINTMENT (REQ-ALR-03)
    // ==========================================

    public function test_walk_in_without_a_visit_appointment_is_rejected_with_403()
    {
        $walkIn = $this->makeWalkIn();
        $order = $this->makeOrder($walkIn);

        $response = $this->putJson(
            '/api/orders/update',
            ['ord_id' => $order->getKey(), 'ord_status' => 'CANCEL REQUESTED'],
            $this->headers($walkIn)
        );

        $response->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('code', 'ALR_WALK_IN_NO_VISIT');

        // REQ-ALR-03: a human-readable description and the time of the refusal
        $this->assertStringContainsString('VISIT', $response->json('error'));
        $this->assertStringContainsString('CANCEL REQUESTED', $response->json('error'));
        $this->assertNotEmpty($response->json('timestamp'));
        $this->assertSame('TO PROCESS', $order->fresh()->ord_status);
    }

    public function test_walk_in_return_request_without_a_visit_appointment_is_rejected()
    {
        $walkIn = $this->makeWalkIn();
        $order = $this->makeOrder($walkIn, 'CLAIMED');

        $response = $this->putJson(
            '/api/orders/update',
            ['ord_id' => $order->getKey(), 'ord_status' => 'RETURN REQUESTED'],
            $this->headers($walkIn)
        );

        $response->assertStatus(403)->assertJsonPath('code', 'ALR_WALK_IN_NO_VISIT');
        $this->assertStringContainsString('RETURN REQUESTED', $response->json('error'));
        $this->assertSame('CLAIMED', $order->fresh()->ord_status);
    }

    public function test_a_closed_visit_appointment_does_not_satisfy_the_guard()
    {
        $walkIn = $this->makeWalkIn();
        $this->makeAppointment($walkIn, 'VISIT', true);
        $order = $this->makeOrder($walkIn);

        $this->putJson(
            '/api/orders/update',
            ['ord_id' => $order->getKey(), 'ord_status' => 'CANCEL REQUESTED'],
            $this->headers($walkIn)
        )->assertStatus(403);
    }

    public function test_an_open_claim_appointment_does_not_satisfy_the_guard()
    {
        $walkIn = $this->makeWalkIn();
        $this->makeAppointment($walkIn, 'CLAIM');
        $order = $this->makeOrder($walkIn);

        $this->putJson(
            '/api/orders/update',
            ['ord_id' => $order->getKey(), 'ord_status' => 'CANCEL REQUESTED'],
            $this->headers($walkIn)
        )->assertStatus(403);
    }

    // ==========================================
    // AUDIT LOG (instruction 33, 85)
    // ==========================================

    public function test_every_rejected_walk_in_request_is_written_to_the_audit_log()
    {
        $walkIn = $this->makeWalkIn();
        $first = $this->makeOrder($walkIn);
        $second = $this->makeOrder($walkIn, 'CLAIMED');

        $this->putJson(
            '/api/orders/update',
            ['ord_id' => $first->getKey(), 'ord_status' => 'CANCEL REQUESTED'],
            $this->headers($walkIn)
        )->assertStatus(403);

        $this->putJson(
            '/api/orders/update',
            ['ord_id' => $second->getKey(), 'ord_status' => 'RETURN REQUESTED'],
            $this->headers($walkIn)
        )->assertStatus(403);

        $this->assertDatabaseCount('custlog', 2);

        $entry = CustLog::where('cust_id', $walkIn->getKey())->first();
        $this->assertSame('CANCEL REQUESTED', $entry->custlog_action);
        $this->assertStringContainsString('ALR_WALK_IN_NO_VISIT', $entry->custlog_desc);
        $this->assertStringContainsString($first->ord_tag, $entry->custlog_desc);
        $this->assertNotNull($entry->custlog_created);
    }

    // ==========================================
    // NON-WALK-IN CUSTOMERS ARE UNAFFECTED
    // ==========================================

    public function test_a_registered_customer_needs_no_visit_appointment()
    {
        $this->seq++;
        $customer = Customer::create([
            'cust_created'  => now(),
            'cust_password' => Hash::make('Password123!'),
            'cust_nickname' => 'Regular ' . $this->seq,
            'cust_pronoun'  => 'they/them',
            'cust_birthday' => '2001-01-01',
            'cust_brgy'     => 'Sagpon',
            'cust_city'     => 'Legazpi',
            'cust_province' => 'Albay',
            'cust_country'  => '',
            'cust_callcode' => '+63',
            'cust_phone'    => '09171234567',
            'cust_email'    => 'regular' . $this->seq . uniqid() . '@example.com',
            'cust_type'     => 'Student',
            'cust_cart'     => 0,
            'cust_orders'   => 0,
            'cust_appoints' => 0,
        ]);

        $order = $this->makeOrder($customer);

        $this->putJson(
            '/api/orders/update',
            ['ord_id' => $order->getKey(), 'ord_status' => 'CANCEL REQUESTED'],
            $this->headers($customer)
        )->assertStatus(200);

        $this->assertDatabaseCount('custlog', 0);
    }
}
