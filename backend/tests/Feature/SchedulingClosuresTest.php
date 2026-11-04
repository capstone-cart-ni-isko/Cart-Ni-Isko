<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustNotif;
use App\Models\Employee;
use App\Models\Visit;
use App\Support\SystemSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * IT evaluation follow-ups for scheduling: the store manager (admin) owns the
 * schedule settings, closed days are blacked out for booking, and a sudden
 * suspension can move a whole day's appointments in one action.
 */
class SchedulingClosuresTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private array $tokens = [];

    private function headers($model): array
    {
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
            'cust_phone'     => '09' . str_pad((string) (710000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'cust_email'     => 'sched' . $this->seq . uniqid() . '@example.com',
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

        return Employee::forceCreate([
            'emp_created'   => now(),
            'emp_password'  => Hash::make('Password123!'),
            'emp_surname'   => 'Dela Cruz',
            'emp_givname'   => 'Juan',
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
            'emp_phone'     => '09' . str_pad((string) (520000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'emp_email'     => 'sched' . $this->seq . uniqid() . '@bicol-u.edu.ph',
            'emp_type'      => $type,
            'emp_categ'     => $type,
            'emp_instore'   => 0,
        ]);
    }

    private function makeVisit(Customer $customer, string $start): Visit
    {
        return Visit::create([
            'cust_id'         => $customer->cust_id,
            'appoint_type'    => 'CLAIM',
            'appoint_status'  => 'upcoming',
            'appoint_qr'      => 'APPT-' . strtoupper(uniqid()),
            'appoint_start'   => $start,
            'appoint_end'     => \Illuminate\Support\Carbon::parse($start)->addMinutes(10),
            'appoint_created' => now(),
        ]);
    }

    public function test_admin_manages_schedule_settings_but_not_system_settings()
    {
        $admin = $this->makeEmployee('ADMIN');
        $staff = $this->makeEmployee('STAFF');
        $day = now()->addDays(5)->format('Y-m-d');

        $this->json('PUT', '/api/settings/update', [
            'settings' => [
                'pickup_slot_capacity' => 4,
                'closed_dates' => [['date' => $day, 'reason' => 'Typhoon suspension']],
            ],
        ], $this->headers($admin))->assertStatus(200);

        SystemSettings::flush();
        $this->assertSame(4, (int) SystemSettings::get('pickup_slot_capacity'));
        $this->assertSame('Typhoon suspension', SystemSettings::closedReason($day));

        // A non-scheduling key still needs the super admin
        $this->json('PUT', '/api/settings/update', [
            'settings' => ['store_name' => 'Nope', 'pickup_slot_capacity' => 3],
        ], $this->headers($admin))->assertStatus(403);

        // Staff below admin cannot change the schedule
        $this->json('PUT', '/api/settings/update', [
            'settings' => ['pickup_slot_capacity' => 2],
        ], $this->headers($staff))->assertStatus(403);

        // A malformed closed date is refused
        $this->json('PUT', '/api/settings/update', [
            'settings' => ['closed_dates' => [['date' => '2026-02-30', 'reason' => 'x']]],
        ], $this->headers($admin))->assertStatus(422);
    }

    public function test_closed_days_are_blacked_out_for_booking()
    {
        $customer = $this->makeCustomer();
        $day = now()->addDays(6)->format('Y-m-d');
        SystemSettings::set('closed_dates', [['date' => $day, 'reason' => 'Holiday']]);

        $this->getJson('/api/appoint/closed-dates', $this->headers($customer))
            ->assertStatus(200)
            ->assertJsonPath('data.0.date', $day);

        $slots = $this->json('GET', '/api/appoint/slots', ['date' => $day], $this->headers($customer))
            ->assertStatus(200)
            ->assertJsonPath('data.closed', true)
            ->json('data.slots');

        $this->assertNotEmpty($slots);
        $this->assertFalse(collect($slots)->contains('available', true));
    }

    public function test_bulk_reschedule_moves_a_suspended_days_appointments()
    {
        $admin = $this->makeEmployee('ADMIN');
        // Someone is in store, so the moved slots are staffed
        $admin->forceFill([Employee::availabilityColumn() => true])->save();
        $alice = $this->makeCustomer();
        $bob = $this->makeCustomer();

        $day = now()->addDays(3)->startOfDay();
        $target = $day->copy()->addDay();
        $a = $this->makeVisit($alice, $day->copy()->setTime(9, 0)->format('Y-m-d H:i:s'));
        $b = $this->makeVisit($bob, $day->copy()->setTime(14, 30)->format('Y-m-d H:i:s'));
        $oldQr = $a->appoint_qr;

        $this->postJson('/api/appoint/bulk-reschedule', [
            'date' => $day->format('Y-m-d'),
            'target_date' => $target->format('Y-m-d'),
            'reason' => 'Class suspension',
        ], $this->headers($admin))
            ->assertStatus(200)
            ->assertJsonCount(2, 'data.moved')
            ->assertJsonCount(0, 'data.unplaced');

        // Same time of day, on the new date, with a fresh claim QR
        $this->assertSame($target->format('Y-m-d') . ' 09:00', $a->fresh()->appoint_start->format('Y-m-d H:i'));
        $this->assertSame($target->format('Y-m-d') . ' 14:30', $b->fresh()->appoint_start->format('Y-m-d H:i'));
        $this->assertNotSame($oldQr, $a->fresh()->appoint_qr);

        // The suspended day is now closed and both customers were told why
        SystemSettings::flush();
        $this->assertSame('Class suspension', SystemSettings::closedReason($day));
        $this->assertTrue(CustNotif::where('cust_id', $alice->cust_id)
            ->where('custnotif_msg', 'like', '%Class suspension%')->exists());
        $this->assertTrue(CustNotif::where('cust_id', $bob->cust_id)
            ->where('custnotif_msg', 'like', '%Class suspension%')->exists());
    }

    public function test_bulk_reschedule_is_admin_only_and_needs_a_reason()
    {
        $staff = $this->makeEmployee('STAFF');
        $admin = $this->makeEmployee('ADMIN');
        $day = now()->addDays(3)->format('Y-m-d');

        $this->postJson('/api/appoint/bulk-reschedule', ['date' => $day, 'reason' => 'x'], $this->headers($staff))
            ->assertStatus(403);
        $this->postJson('/api/appoint/bulk-reschedule', ['date' => $day], $this->headers($admin))
            ->assertStatus(422);
    }
}
