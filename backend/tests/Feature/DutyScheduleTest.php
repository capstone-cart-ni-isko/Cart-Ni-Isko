<?php

namespace Tests\Feature;

use App\Models\DutyShift;
use App\Models\EmpNotif;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Dated duty shifts (REQ-SS-01/02/03) and the slot staffing they drive
 * (REQ-AB-03: CLAIM needs >= 1 employee on shift, VISIT needs >= 2).
 */
class DutyScheduleTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private array $tokens = [];

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function headers($model): array
    {
        $this->app['auth']->forgetGuards();

        $key = get_class($model) . ':' . $model->getKey();
        if (!isset($this->tokens[$key])) {
            $this->tokens[$key] = $model->createToken('test')->plainTextToken;
        }

        return ['Authorization' => 'Bearer ' . $this->tokens[$key]];
    }

    private function makeEmployee(string $type = 'STAFF'): Employee
    {
        $this->seq++;

        return Employee::create([
            'emp_created'  => now(),
            'emp_password' => Hash::make('Password123!'),
            'emp_surname'  => 'Tester',
            'emp_givname'  => 'Emp' . $this->seq,
            'emp_pronoun'  => 'they/them',
            'emp_birthday' => '2000-01-01',
            'emp_brgy'     => 'Sagpon',
            'emp_city'     => 'Legazpi',
            'emp_province' => 'Albay',
            'emp_country'  => '',
            'emp_callcode' => '+63',
            'emp_phone'    => '09' . str_pad((string) (600000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'emp_email'    => 'duty' . $this->seq . uniqid() . '@bicol-u.edu.ph',
            'emp_type'     => $type,
            'emp_instore'  => 0,
        ]);
    }

    private function assign(Employee $actor, Employee $target, string $date, string $start, string $end)
    {
        return $this->postJson('/api/duty/assign', [
            'emp_id'         => $target->emp_id,
            'shift_date'     => $date,
            'shift_start'    => $start,
            'shift_end'      => $end,
            'shift_type'     => 'Desk Duty',
            'shift_location' => 'Main Campus Org Room',
        ], $this->headers($actor));
    }

    private function slot(Employee $reader, string $date, string $type, string $time): array
    {
        $slots = $this->json('GET', '/api/appoint/slots', ['date' => $date], $this->headers($reader))
            ->assertStatus(200)
            ->json('data.slots');
        foreach ($slots as $slot) {
            if ($slot['type'] === $type && $slot['start'] === $date . ' ' . $time) return $slot;
        }
        $this->fail("Slot {$type} {$date} {$time} not found");
    }

    public function test_shifts_drive_slot_staffing_for_their_date_and_hours_only()
    {
        $admin = $this->makeEmployee('ADMIN');
        $maria = $this->makeEmployee();
        $juan = $this->makeEmployee();
        $date = now('Asia/Manila')->addDays(3)->format('Y-m-d');

        // Nobody scheduled: nothing is bookable
        $this->assertFalse($this->slot($admin, $date, 'CLAIM', '10:00')['available']);

        $this->assign($admin, $maria, $date, '10:00', '12:00')
            ->assertStatus(201)
            ->assertJsonPath('data.shift_type', 'DESK DUTY')
            ->assertJsonPath('data.shift_start', '10:00');

        // The assignee is told about a shift someone else gave them
        $this->assertTrue(EmpNotif::where('emp_id', $maria->emp_id)->where('empnotif_msg', 'like', 'You were assigned Desk Duty%')->exists());

        // CLAIM (needs 1) opens only inside the shift; VISIT (needs 2) stays closed
        $this->assertTrue($this->slot($admin, $date, 'CLAIM', '10:00')['available']);
        $this->assertTrue($this->slot($admin, $date, 'CLAIM', '11:30')['available']);
        $this->assertFalse($this->slot($admin, $date, 'CLAIM', '12:00')['available']);
        $this->assertFalse($this->slot($admin, $date, 'CLAIM', '09:30')['available']);
        $this->assertFalse($this->slot($admin, $date, 'VISIT', '10:00')['available']);

        // A second overlapping shift opens VISIT where both cover the block
        $this->assign($admin, $juan, $date, '11:00', '13:00')->assertStatus(201);
        $this->assertTrue($this->slot($admin, $date, 'VISIT', '11:00')['available']);
        $this->assertFalse($this->slot($admin, $date, 'VISIT', '10:30')['available']);

        // Another date is unaffected
        $other = now('Asia/Manila')->addDays(4)->format('Y-m-d');
        $this->assertFalse($this->slot($admin, $other, 'CLAIM', '10:00')['available']);

        // The day view lists both shifts in start order
        $this->json('GET', '/api/duty/display', ['date' => $date], $this->headers($admin))
            ->assertStatus(200)
            ->assertJsonCount(2, 'data.shifts')
            ->assertJsonPath('data.shifts.0.emp_id', $maria->emp_id)
            ->assertJsonPath('data.shifts.1.emp_id', $juan->emp_id);

        // Removing the shift closes its slots again
        $shiftId = DutyShift::where('emp_id', $maria->emp_id)->value('shift_id');
        $this->json('DELETE', '/api/duty/remove', ['shift_id' => $shiftId], $this->headers($admin))->assertStatus(200);
        $this->assertFalse($this->slot($admin, $date, 'CLAIM', '10:00')['available']);
    }

    public function test_shift_validation_rules()
    {
        $admin = $this->makeEmployee('ADMIN');
        $maria = $this->makeEmployee();
        $date = now('Asia/Manila')->addDays(2)->format('Y-m-d');

        $this->assign($admin, $maria, $date, '07:00', '09:00')->assertStatus(422);   // before store hours
        $this->assign($admin, $maria, $date, '17:00', '18:30')->assertStatus(422);   // after store hours
        $this->assign($admin, $maria, $date, '09:15', '10:00')->assertStatus(422);   // not a half-hour step
        $this->assign($admin, $maria, $date, '12:00', '10:00')->assertStatus(422);   // ends before it starts

        $this->assign($admin, $maria, $date, '08:00', '12:00')->assertStatus(201);
        $this->assign($admin, $maria, $date, '11:00', '14:00')
            ->assertStatus(409)
            ->assertJsonPath('message', $maria->emp_givname . ' Tester already has a shift during that time.');
        $this->assign($admin, $maria, $date, '12:00', '14:00')->assertStatus(201);   // back-to-back is fine
    }

    public function test_permissions_and_the_seven_am_lock()
    {
        // 9:00 AM store time: today's schedule is locked for everyone but super admins
        Carbon::setTestNow(Carbon::parse('2026-10-05 09:00', 'Asia/Manila'));

        $super = $this->makeEmployee('SUPER ADMIN');
        $admin = $this->makeEmployee('ADMIN');
        $maria = $this->makeEmployee();
        $juan = $this->makeEmployee();

        $today = '2026-10-05';
        $tomorrow = '2026-10-06';

        // Staff may schedule only themselves
        $this->assign($maria, $juan, $tomorrow, '08:00', '10:00')->assertStatus(403);
        $this->assign($maria, $maria, $tomorrow, '08:00', '10:00')->assertStatus(201);

        // After 7:00 AM, today is locked for staff and admins...
        $this->assign($maria, $maria, $today, '13:00', '15:00')->assertStatus(409);
        $this->assign($admin, $maria, $today, '13:00', '15:00')->assertStatus(409);

        // ...but not for the super admin (legacy "SUPER_ADMIN" spelling included)
        $this->assign($super, $maria, $today, '13:00', '15:00')->assertStatus(201);
        $legacy = $this->makeEmployee('SUPER_ADMIN');
        $this->assign($legacy, $juan, $today, '13:00', '15:00')->assertStatus(201);

        // The day view tells the UI whether it is locked for the reader
        $this->json('GET', '/api/duty/display', ['date' => $today], $this->headers($maria))
            ->assertJsonPath('data.locked', true);
        $this->json('GET', '/api/duty/display', ['date' => $today], $this->headers($super))
            ->assertJsonPath('data.locked', false);

        // Past dates are closed to everyone
        $this->assign($super, $maria, '2026-10-04', '08:00', '10:00')->assertStatus(409);

        // Before 7:00 AM, staff can still change today
        Carbon::setTestNow(Carbon::parse('2026-10-05 06:30', 'Asia/Manila'));
        $this->assign($maria, $maria, $today, '16:00', '18:00')->assertStatus(201);
    }
}
