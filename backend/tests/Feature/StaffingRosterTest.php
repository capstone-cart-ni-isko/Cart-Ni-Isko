<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\DutyShift;
use App\Models\EmpLog;
use App\Models\EmpNotif;
use App\Models\Employee;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/*
    REQ-AB-03 / REQ-SS-03 staffing rules on top of the duty_shift schedule:
    per-block headcounts, the one-time shortage notice, and the PENDING
    REPLACEMENT alert raised when a shift loses its assignee.
*/
class StaffingRosterTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;
    private array $tokens = [];

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ==========================================
    // FIXTURE HELPERS
    // ==========================================

    private function headers($model): array
    {
        $this->app['auth']->forgetGuards();

        $key = get_class($model) . ':' . $model->getKey();
        if (! isset($this->tokens[$key])) {
            $this->tokens[$key] = $model->createToken('test')->plainTextToken;
        }

        return ['Authorization' => 'Bearer ' . $this->tokens[$key]];
    }

    private function makeEmployee(array $attributes = []): Employee
    {
        $this->seq++;

        return Employee::create(array_merge([
            'emp_created'  => now(),
            'emp_password' => Hash::make('Password123!'),
            'emp_surname'  => 'Dela Cruz',
            'emp_givname'  => 'Juan',
            'emp_pronoun'  => 'they/them',
            'emp_birthday' => '2000-01-01',
            'emp_brgy'     => 'Sagpon',
            'emp_city'     => 'Legazpi',
            'emp_province' => 'Albay',
            'emp_country'  => '',
            'emp_email'    => 'officer' . $this->seq . '@bicol-u.edu.ph',
            'emp_callcode' => '+63',
            // Offset past the seeded super admin, whose phone is unique too.
            'emp_phone'    => '+639' . str_pad((string) ($this->seq + 500), 9, '0', STR_PAD_LEFT),
            'emp_type'     => 'STAFF',
            'emp_instore'  => 1,
        ], $attributes));
    }

    private function makeSuperAdmin(): Employee
    {
        return $this->makeEmployee(['emp_type' => 'SUPER ADMIN']);
    }

    private function makeCustomer(): Customer
    {
        $this->seq++;

        return Customer::create([
            'cust_created'   => now(),
            'cust_password'  => Hash::make('Password123!'),
            'cust_nickname'  => 'Ana' . $this->seq,
            'cust_pronoun'   => 'they/them',
            'cust_birthday'  => '2001-05-05',
            'cust_brgy'      => 'Sagpon',
            'cust_city'      => 'Legazpi',
            'cust_province'  => 'Albay',
            'cust_country'   => 'PH',
            'cust_callcode'  => '+63',
            'cust_phone'     => '09' . str_pad((string) (700000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'cust_email'     => 'ana' . $this->seq . '@bicol-u.edu.ph',
            'cust_type'      => 'Student',
            'cust_college'   => 'BUCE',
            'cust_wishlist'  => 0,
            'cust_cart'      => 0,
            'cust_orders'    => 0,
            'cust_appoints'  => 0,
        ]);
    }

    private function makeShift(Employee $employee, array $attributes = []): DutyShift
    {
        return DutyShift::create(array_merge([
            'emp_id'         => $employee->getKey(),
            'shift_date'     => now()->format('Y-m-d'),
            'shift_start'    => '08:00',
            'shift_end'      => '18:00',
            'shift_type'     => 'DESK DUTY',
            'shift_location' => 'Main Counter',
            'shift_created'  => now(),
            'created_by'     => null,
        ], $attributes));
    }

    private function makeAppointment(Customer $customer, string $type, string $date, string $time): Appointment
    {
        return Appointment::create([
            'cust_id'      => $customer->getKey(),
            'appoint_type' => $type,
            'appoint_date' => Carbon::parse($date . ' ' . $time),
            'appoint_qr'   => 'QR' . str_pad((string) ++$this->seq, 10, '0', STR_PAD_LEFT),
        ]);
    }

    private function removeShift(Employee $actor, DutyShift $shift)
    {
        return $this->json('DELETE', '/api/duty/remove', ['shift_id' => $shift->shift_id], $this->headers($actor));
    }

    // ==========================================
    // REQ-AB-03 / REQ-SS-03 PER-BLOCK HEADCOUNT
    // ==========================================

    public function test_a_block_is_only_staffed_by_the_employees_on_shift_for_it()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $admin = $this->makeSuperAdmin();

        // Two officers, but only one of them is on shift after 11:00.
        $this->makeShift($this->makeEmployee(), ['shift_start' => '08:00', 'shift_end' => '11:00']);
        $this->makeShift($this->makeEmployee(), ['shift_start' => '08:00', 'shift_end' => '18:00']);

        $slots = $this->getJson('/api/appoint/slots?date=2026-10-05', $this->headers($admin))
            ->assertStatus(200)
            ->json('data.slots');

        $this->assertSame(2, $this->slotAt($slots, '08:00', 'VISIT')['staff']);
        $this->assertSame(1, $this->slotAt($slots, '11:00', 'VISIT')['staff']);

        // REQ-AB-03: a visit needs two, so the thin block closes while the
        // fully covered one stays bookable.
        $this->assertTrue($this->slotAt($slots, '08:00', 'VISIT')['available']);
        $this->assertFalse($this->slotAt($slots, '11:00', 'VISIT')['available']);
        $this->assertSame(
            'Not enough in-store employees available (minimum 2 required)',
            $this->slotAt($slots, '11:00', 'VISIT')['reason']
        );
    }

    public function test_a_booking_is_refused_when_its_own_block_is_understaffed()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $customer = $this->makeCustomer();

        // One officer, on shift only in the afternoon.
        $this->makeShift($this->makeEmployee(), ['shift_start' => '13:00', 'shift_end' => '18:00']);

        $this->json('POST', '/api/appoint/create', [
            'cust_id'      => $customer->getKey(),
            'appoint_date' => '2026-10-05 09:00',
            'appoint_type' => 'VISIT',
        ], $this->headers($customer))
            ->assertStatus(409)
            ->assertJsonPath('message', 'Not enough in-store employees available (minimum 2 required)');
    }

    // ==========================================
    // REQ-AB-04 SHORTAGE NOTICES, ONCE ONLY
    // ==========================================

    public function test_a_shortage_notice_is_sent_once_per_booking()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $admin = $this->makeSuperAdmin();
        $customer = $this->makeCustomer();

        $appointment = $this->makeAppointment($customer, 'VISIT', '2026-10-05', '09:00');
        $first = $this->makeShift($this->makeEmployee());
        $second = $this->makeShift($this->makeEmployee());

        // Both removals leave the visit understaffed; the notice must not double up.
        $this->removeShift($admin, $first)->assertStatus(200);
        $this->removeShift($admin, $second)->assertStatus(200);

        $notices = CustNotif::where('cust_id', $customer->getKey())
            ->where('custnotif_msg', 'like', '%appointment #' . $appointment->appoint_id . '%')
            ->get();

        $this->assertCount(1, $notices);
        $this->assertStringContainsString('Reason: staff shortage', $notices->first()->custnotif_msg);
    }

    public function test_a_well_staffed_booking_sends_no_shortage_notice()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $admin = $this->makeSuperAdmin();
        $customer = $this->makeCustomer();

        // A CLAIM needs one employee on shift, so losing one of two keeps the
        // block staffed and the customer hears nothing.
        $this->makeAppointment($customer, 'CLAIM', '2026-10-05', '09:00');
        $first = $this->makeShift($this->makeEmployee());
        $this->makeShift($this->makeEmployee());

        $this->removeShift($admin, $first)->assertStatus(200);

        $this->assertSame(0, CustNotif::where('custnotif_msg', 'like', '%Reason: staff shortage%')->count());
        $this->assertSame(0, EmpNotif::where('empnotif_msg', 'like', '%PENDING REPLACEMENT%')->count());
    }

    // ==========================================
    // REQ-SS-03 PENDING REPLACEMENT
    // ==========================================

    public function test_removing_a_needed_shift_alerts_super_admins_of_a_pending_replacement()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $admin = $this->makeSuperAdmin();
        $customer = $this->makeCustomer();

        $this->makeAppointment($customer, 'CLAIM', '2026-10-05', '09:00');
        $shift = $this->makeShift($this->makeEmployee());

        $this->removeShift($admin, $shift)->assertStatus(200);

        $alert = EmpNotif::where('emp_id', $admin->getKey())
            ->where('empnotif_msg', 'like', '%PENDING REPLACEMENT%')
            ->first();

        $this->assertNotNull($alert);
        $this->assertStringContainsString('shift #' . $shift->shift_id, $alert->empnotif_msg);
        $this->assertStringContainsString('1 open booking(s)', $alert->empnotif_msg);
    }

    public function test_disabling_an_employee_flags_their_shift_as_pending_replacement()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $admin = $this->makeSuperAdmin();
        $customer = $this->makeCustomer();
        $officer = $this->makeEmployee();

        $this->makeAppointment($customer, 'CLAIM', '2026-10-05', '09:00');
        $this->makeShift($officer);

        $this->postJson('/api/accounts/disable', [
            'user_id'      => $officer->getKey(),
            'account_type' => 'employee',
            'reason'       => 'Left the org',
        ], $this->headers($admin))->assertStatus(200);

        $shifts = $this->getJson('/api/duty/display?date=2026-10-05', $this->headers($admin))
            ->assertStatus(200)
            ->json('data.shifts');

        $this->assertTrue($shifts[0]['pending_replacement']);
        $this->assertSame(1, DutyShift::pendingReplacements());
        $this->assertSame(
            1,
            EmpNotif::where('emp_id', $admin->getKey())->where('empnotif_msg', 'like', '%PENDING REPLACEMENT%')->count()
        );
    }

    public function test_an_active_employees_shift_is_not_pending_replacement()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $admin = $this->makeSuperAdmin();
        $this->makeShift($this->makeEmployee());

        $shifts = $this->getJson('/api/duty/display?date=2026-10-05', $this->headers($admin))
            ->assertStatus(200)
            ->json('data.shifts');

        $this->assertFalse($shifts[0]['pending_replacement']);
        $this->assertSame(0, DutyShift::pendingReplacements());
    }

    // ==========================================
    // REQ-UM-04 REGISTRATION LOG
    // ==========================================

    public function test_employee_registration_is_logged_with_the_responsible_admin()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $superAdmin = $this->makeSuperAdmin();

        $response = $this->postJson('/api/auth/emp_signup', [
            'email'    => 'new.officer@bicol-u.edu.ph',
            'phone'    => '09981234567',
            'surname'  => 'Bautista',
            'givname'  => 'Rhea',
            'studnum'  => '2026-0001',
            'college'  => 'College of Engineering and Technology',
            'program'  => 'BS Information Technology',
            'year'     => 3,
            'bloc'     => 'A',
            'type'     => 'STAFF',
        ], $this->headers($superAdmin))->assertStatus(201);

        $newId = $response->json('data.emp_id');

        $log = EmpLog::where('emp_id', $newId)->first();

        $this->assertNotNull($log, 'REQ-UM-04: registrations must be logged.');
        $this->assertSame('REGISTER', $log->emplog_action);
        $this->assertStringContainsString('Rhea Bautista', $log->emplog_desc);
        $this->assertStringContainsString('super admin ' . $superAdmin->getKey(), $log->emplog_desc);
        $this->assertNotNull($log->emplog_created);
    }

    // ==========================================
    // HELPERS
    // ==========================================

    private function slotAt(array $slots, string $time, string $type): array
    {
        foreach ($slots as $slot) {
            if ($slot['type'] === $type && substr($slot['start'], 11) === $time) {
                return $slot;
            }
        }

        $this->fail('No ' . $type . ' slot at ' . $time);
    }
}
