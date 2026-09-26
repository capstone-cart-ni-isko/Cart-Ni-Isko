<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\DutyShift;
use App\Models\EmpNotif;
use App\Models\Employee;
use App\Models\Setting;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Duty shift API (REQ-SS-01 / REQ-SS-02 / REQ-SS-03).
 *
 * These tests run on phpunit's sqlite :memory: database, so no row in the
 * Supabase database is read or written from here. duty_shift has no status
 * column, so every status asserted here is the value the API derives.
 */
class ShiftApiTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        // duty_shift exists in Supabase but has no Laravel migration, so the
        // sqlite test database needs the same structure. This stub only ever
        // runs under phpunit: the column list is copied verbatim from the live
        // table and the guarded migration convention is deliberately not used
        // (G6a — no schema migration). The Supabase table is never touched.
        if (! Schema::hasTable('duty_shift')) {
            Schema::create('duty_shift', function (Blueprint $table) {
                $table->bigIncrements('shift_id');
                $table->unsignedBigInteger('emp_id');
                $table->date('shift_date');
                $table->string('shift_start');
                $table->string('shift_end');
                $table->string('shift_type')->default('DESK DUTY');
                $table->string('shift_location')->nullable();
                $table->timestamp('shift_created')->useCurrent();
                $table->unsignedBigInteger('created_by')->nullable();

                $table->foreign('emp_id')->references('emp_id')->on('employee')->cascadeOnDelete();
                $table->index(['shift_date', 'emp_id']);
            });
        }
    }

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
            'emp_callcode' => '+63',
            'emp_phone'    => '09' . str_pad((string) (500000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'emp_email'    => 'emp' . $this->seq . uniqid() . '@bicol-u.edu.ph',
            'emp_type'     => 'STAFF',
            'emp_instore'  => 1,
        ], $attributes));
    }

    private function makeSuperAdmin(): Employee
    {
        return $this->makeEmployee(['emp_type' => 'SUPER ADMIN']);
    }

    private function makeShift(Employee $employee, array $attributes = []): DutyShift
    {
        return DutyShift::create(array_merge([
            'emp_id'         => $employee->getKey(),
            'shift_date'     => now()->addDay()->format('Y-m-d'),
            'shift_start'    => '08:00',
            'shift_end'      => '18:00',
            'shift_type'     => 'DESK DUTY',
            'shift_location' => 'Main Counter',
            'shift_created'  => now(),
            'created_by'     => null,
        ], $attributes));
    }

    /** POST /shifts body for one block. */
    private function shiftPayload(Employee $employee, array $overrides = []): array
    {
        return array_merge([
            'emp_id'         => $employee->getKey(),
            'shift_date'     => now()->addDay()->format('Y-m-d'),
            'shift_start'    => '08:00',
            'shift_end'      => '18:00',
            'shift_type'     => 'DESK DUTY',
            'shift_location' => 'Main Counter',
        ], $overrides);
    }

    // ==========================================
    // CREATION (instructions 61-62)
    // ==========================================

    public function test_create_shift_accepts_valid_data_and_derives_its_status()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();

        $response = $this->postJson('/api/shifts', $this->shiftPayload($officer), $this->headers($admin));

        $response->assertStatus(201)->assertJsonPath('success', true);
        $this->assertSame('SCHEDULED', $response->json('data.status'));
        $this->assertSame($officer->getKey(), $response->json('data.emp_id'));
        $this->assertNotEmpty($response->json('data.employee_name'));
        $this->assertNotEmpty($response->json('data.shift_created'));

        // Exactly one block row now exists for that employee
        $this->assertDatabaseCount('duty_shift', 1);
        $this->assertDatabaseHas('duty_shift', ['emp_id' => $officer->getKey()]);
    }

    public function test_create_shift_rejects_missing_fields_with_400()
    {
        $admin = $this->makeSuperAdmin();

        $this->postJson('/api/shifts', ['emp_id' => $admin->getKey()], $this->headers($admin))
            ->assertStatus(400)
            ->assertJsonPath('success', false);

        $this->assertDatabaseCount('duty_shift', 0);
    }

    public function test_create_shift_rejects_invalid_data_with_400()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();

        $cases = [
            'unknown employee'     => $this->shiftPayload($officer, ['emp_id' => 999999]),
            'bad date format'      => $this->shiftPayload($officer, ['shift_date' => '25-09-2026']),
            'bad time format'      => $this->shiftPayload($officer, ['shift_start' => '8 AM']),
            'end before start'     => $this->shiftPayload($officer, ['shift_start' => '18:00', 'shift_end' => '08:00']),
            'unknown status'       => $this->shiftPayload($officer, ['status' => 'NONSENSE']),
            'non numeric emp_id'   => $this->shiftPayload($officer, ['emp_id' => 'abc']),
        ];

        foreach ($cases as $label => $payload) {
            $this->postJson('/api/shifts', $payload, $this->headers($admin))
                ->assertStatus(400, $label . ' should be rejected');
        }

        $this->assertDatabaseCount('duty_shift', 0);
    }

    // ==========================================
    // UPDATE (instructions 63-64)
    // ==========================================

    public function test_update_shift_amends_the_stored_row()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();
        $shift = $this->makeShift($officer);

        $response = $this->putJson(
            '/api/shifts/' . $shift->shift_id,
            ['shift_start' => '09:30', 'shift_end' => '17:30', 'shift_location' => 'Org Room'],
            $this->headers($admin)
        );

        $response->assertStatus(200)->assertJsonPath('success', true);
        $this->assertDatabaseHas('duty_shift', [
            'shift_id'       => $shift->shift_id,
            'shift_start'    => '09:30',
            'shift_end'      => '17:30',
            'shift_location' => 'Org Room',
        ]);
    }

    public function test_update_shift_rejects_invalid_data_with_400()
    {
        $admin = $this->makeSuperAdmin();
        $shift = $this->makeShift($this->makeEmployee());

        $this->putJson('/api/shifts/' . $shift->shift_id, ['shift_start' => '9 AM'], $this->headers($admin))
            ->assertStatus(400);
        $this->putJson('/api/shifts/' . $shift->shift_id, ['shift_end' => '07:00'], $this->headers($admin))
            ->assertStatus(400);
        $this->putJson('/api/shifts/' . $shift->shift_id, ['emp_id' => 999999], $this->headers($admin))
            ->assertStatus(400);

        $this->assertDatabaseHas('duty_shift', [
            'shift_id'    => $shift->shift_id,
            'shift_start' => '08:00',
        ]);
    }

    public function test_update_unknown_shift_returns_404()
    {
        $admin = $this->makeSuperAdmin();

        $this->putJson('/api/shifts/424242', ['shift_start' => '09:00'], $this->headers($admin))
            ->assertStatus(404);
    }

    // ==========================================
    // CANCELLATION (instruction 65)
    // ==========================================

    public function test_cancel_shift_removes_the_row()
    {
        $admin = $this->makeSuperAdmin();
        $shift = $this->makeShift($this->makeEmployee());

        $this->deleteJson('/api/shifts/' . $shift->shift_id, [], $this->headers($admin))
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertDatabaseCount('duty_shift', 0);
    }

    public function test_cancel_unknown_shift_returns_404()
    {
        $admin = $this->makeSuperAdmin();

        $this->deleteJson('/api/shifts/424242', [], $this->headers($admin))
            ->assertStatus(404);
    }

    // ==========================================
    // LISTING + FILTERS (instructions 66-67, 12)
    // ==========================================

    public function test_list_shifts_filtered_by_employee_returns_only_that_employee()
    {
        $admin = $this->makeSuperAdmin();
        $mine = $this->makeEmployee();
        $other = $this->makeEmployee();
        $this->makeShift($mine);
        $this->makeShift($mine, ['shift_start' => '18:00', 'shift_end' => '20:00']);
        $this->makeShift($other);

        $response = $this->getJson('/api/shifts?emp_id=' . $mine->getKey(), $this->headers($admin));

        $response->assertStatus(200);
        $this->assertCount(2, $response->json('data'));
        foreach ($response->json('data') as $row) {
            $this->assertSame($mine->getKey(), $row['emp_id']);
        }
    }

    public function test_list_shifts_filtered_by_date_range_returns_only_that_range()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();
        $inside = $this->makeShift($officer, ['shift_date' => '2026-10-05']);
        $this->makeShift($officer, ['shift_date' => '2026-11-20']);
        $this->makeShift($officer, ['shift_date' => '2026-12-02']);

        $response = $this->getJson(
            '/api/shifts?date_from=2026-10-01&date_to=2026-10-31',
            $this->headers($admin)
        );

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertSame($inside->shift_date, $response->json('data.0.shift_date'));
    }

    public function test_list_shifts_filtered_by_single_date_and_status()
    {
        $admin = $this->makeSuperAdmin();
        $onDuty = $this->makeEmployee();
        $offDuty = $this->makeEmployee(['emp_instore' => 0]);
        $this->makeShift($onDuty, ['shift_date' => '2026-10-05']);
        $this->makeShift($offDuty, ['shift_date' => '2026-10-05']);

        $byDate = $this->getJson('/api/shifts?date=2026-10-05', $this->headers($admin));
        $byDate->assertStatus(200);
        $this->assertCount(2, $byDate->json('data'));

        // The off-duty assignee puts its block in PENDING REPLACEMENT (REQ-SS-03)
        $byStatus = $this->getJson('/api/shifts?status=PENDING REPLACEMENT', $this->headers($admin));
        $byStatus->assertStatus(200)->assertJsonPath('data.0.emp_id', $offDuty->getKey());
    }

    public function test_derived_status_tracks_the_shift_window()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();
        $today = now()->format('Y-m-d');

        $this->makeShift($officer, ['shift_date' => $today, 'shift_start' => '00:00', 'shift_end' => '23:59']);
        $this->makeShift($officer, ['shift_date' => $today, 'shift_start' => '20:00', 'shift_end' => '23:59']);
        $this->makeShift($officer, ['shift_date' => '2020-01-01', 'shift_start' => '08:00', 'shift_end' => '18:00']);

        $statuses = array_column(
            $this->getJson('/api/shifts?date=' . $today, $this->headers($admin))->json('data'),
            'status'
        );
        $this->assertContains('ACTIVE', $statuses);
        $this->assertContains('SCHEDULED', $statuses);

        $this->getJson('/api/shifts?date=2020-01-01', $this->headers($admin))
            ->assertJsonPath('data.0.status', 'COMPLETED');
    }

    // ==========================================
    // REQ-SS-02 DEADLINE (instructions 68-69)
    // ==========================================

    public function test_staff_availability_change_is_blocked_after_the_block_start()
    {
        // A non-super-admin: the route lets an admin through, and the REQ-SS-02
        // deadline is what stops this write.
        $admin = $this->makeEmployee(['emp_type' => 'ADMIN']);
        Carbon::setTestNow(Carbon::parse('2026-10-05 10:00:00'));

        // The block is already running, so the deadline has passed
        $shift = $this->makeShift($admin, [
            'shift_date'  => '2026-10-05',
            'shift_start' => '09:00',
            'shift_end'   => '18:00',
        ]);

        $response = $this->putJson(
            '/api/shifts/' . $shift->shift_id,
            ['emp_instore' => false],
            $this->headers($admin)
        );

        $response->assertStatus(403);
        $response->assertJsonPath('code', 'ALR_AVAIL_AFTER_BLOCK_START');
        $this->assertSame(1, (int) $admin->fresh()->emp_instore);

        Carbon::setTestNow();
    }

    public function test_staff_availability_change_is_allowed_before_the_block_start()
    {
        $admin = $this->makeEmployee(['emp_type' => 'ADMIN']);
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:30:00'));

        $shift = $this->makeShift($admin, [
            'shift_date'  => '2026-10-05',
            'shift_start' => '09:00',
            'shift_end'   => '18:00',
        ]);

        $this->putJson(
            '/api/shifts/' . $shift->shift_id,
            ['emp_instore' => false],
            $this->headers($admin)
        )->assertStatus(200);

        $this->assertSame(0, (int) $admin->fresh()->emp_instore);

        Carbon::setTestNow();
    }

    public function test_super_admin_may_override_availability_after_the_block_start()
    {
        $superAdmin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee(['emp_type' => 'STAFF']);
        Carbon::setTestNow(Carbon::parse('2026-10-05 10:00:00'));

        $shift = $this->makeShift($officer, [
            'shift_date'  => '2026-10-05',
            'shift_start' => '09:00',
            'shift_end'   => '18:00',
        ]);

        $this->putJson(
            '/api/shifts/' . $shift->shift_id,
            ['emp_instore' => false],
            $this->headers($superAdmin)
        )->assertStatus(200);

        $this->assertSame(0, (int) $officer->fresh()->emp_instore);

        Carbon::setTestNow();
    }

    // ==========================================
    // REQ-SS-03 PENDING REPLACEMENT (instructions 70-71)
    // ==========================================

    public function test_availability_change_marks_the_block_pending_replacement_and_alerts_super_admins()
    {
        $superAdmin = $this->makeSuperAdmin();
        $otherSuperAdmin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee(['emp_instore' => 1, 'emp_type' => 'ADMIN']);
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:30:00'));

        $shift = $this->makeShift($officer, [
            'shift_date'  => '2026-10-05',
            'shift_start' => '09:00',
            'shift_end'   => '18:00',
        ]);

        $this->putJson(
            '/api/shifts/' . $shift->shift_id,
            ['emp_instore' => false],
            $this->headers($superAdmin)
        )->assertStatus(200);

        // The block now reads as PENDING REPLACEMENT without any status column
        $this->getJson('/api/shifts?status=PENDING REPLACEMENT', $this->headers($superAdmin))
            ->assertJsonPath('data.0.shift_id', $shift->shift_id);

        // Every super admin is alerted, naming the block, employee and time
        $alert = EmpNotif::where('empnotif_msg', 'like', '%block #' . $shift->shift_id . '%')->first();
        $this->assertNotNull($alert, 'The super admin alert was not created.');
        $this->assertStringContainsString('PENDING REPLACEMENT', $alert->empnotif_msg);
        $this->assertStringContainsString('Juan Dela Cruz', $alert->empnotif_msg);
        $this->assertStringContainsString('2026-10-05 07:30:00', $alert->empnotif_msg);

        // Every super admin is alerted exactly once, and nobody else is. The
        // assertion counts the super admins present rather than a fixed number,
        // so the seeded super admin (super@super.com, from seed_super_admin)
        // is covered too.
        $superAdminIds = Employee::where('emp_type', 'SUPER ADMIN')->pluck('emp_id');
        $alerts = EmpNotif::where('empnotif_msg', 'like', '%block #' . $shift->shift_id . '%');

        $this->assertCount($superAdminIds->count(), $alerts->get());
        $this->assertTrue($alerts->get()->contains('emp_id', $superAdmin->getKey()));
        $this->assertTrue($alerts->get()->contains('emp_id', $otherSuperAdmin->getKey()));
        $this->assertFalse($alerts->get()->contains('emp_id', $officer->getKey()));

        Carbon::setTestNow();
    }

    public function test_slot_state_reports_pending_replacements()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee(['emp_instore' => 0]);
        $this->makeShift($officer);
        $this->makeShift($officer, ['shift_start' => '18:00', 'shift_end' => '20:00']);

        $response = $this->getJson(
            '/api/appoint/slots?date=' . now()->addDay()->format('Y-m-d'),
            $this->headers($admin)
        );
        $response->assertStatus(200);

        $slots = $response->json('data.slots');
        $this->assertNotEmpty($slots);
        foreach ($slots as $slot) {
            // Both blocks lost their assignee, so both read as needing cover
            $this->assertSame(2, $slot['pending_replacements']);
        }
    }

    // ==========================================
    // RBAC + INVENTORY (instructions 60, 72, 75, 76, 78, 79)
    // ==========================================

    public function test_plain_staff_cannot_write_shifts()
    {
        $staff = $this->makeEmployee(['emp_type' => 'STAFF']);
        $shift = $this->makeShift($this->makeEmployee());

        $this->postJson('/api/shifts', $this->shiftPayload($staff), $this->headers($staff))->assertStatus(403);
        $this->putJson('/api/shifts/' . $shift->shift_id, ['shift_type' => 'EVENT PREP'], $this->headers($staff))->assertStatus(403);
        $this->deleteJson('/api/shifts/' . $shift->shift_id, [], $this->headers($staff))->assertStatus(403);

        $this->assertDatabaseHas('duty_shift', ['shift_id' => $shift->shift_id]);
    }

    public function test_ten_shift_operations_leave_no_unintended_rows()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();
        $headers = $this->headers($admin);

        $shiftId = $this->postJson('/api/shifts', $this->shiftPayload($officer), $headers)->json('data.shift_id');

        for ($index = 0; $index < 4; $index++) {
            $this->putJson('/api/shifts/' . $shiftId, ['shift_location' => 'Room ' . $index], $headers)->assertStatus(200);
        }
        for ($index = 0; $index < 4; $index++) {
            $this->postJson('/api/shifts', $this->shiftPayload($officer, ['shift_start' => '19:00', 'shift_end' => '20:00']), $headers)->assertStatus(201);
        }
        $this->deleteJson('/api/shifts/' . $shiftId, [], $headers)->assertStatus(200);

        // 1 created + 4 more created - 1 cancelled = 4 blocks, and nothing else
        $this->assertDatabaseCount('duty_shift', 4);
        $this->assertDatabaseMissing('duty_shift', ['shift_id' => $shiftId]);
        $this->assertDatabaseCount('customer', 0);
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('appointment', 0);
    }

    public function test_shift_api_responses_stay_under_one_second()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();
        $this->makeShift($officer);
        $headers = $this->headers($admin);

        $calls = [
            fn () => $this->getJson('/api/shifts', $headers),
            fn () => $this->getJson('/api/shifts?date=' . now()->addDay()->format('Y-m-d'), $headers),
            fn () => $this->postJson('/api/shifts', $this->shiftPayload($officer), $headers),
        ];

        foreach ($calls as $index => $call) {
            $started = microtime(true);
            $call()->assertStatus($index === 2 ? 201 : 200);
            $this->assertLessThan(1.0, microtime(true) - $started, 'Call ' . $index . ' took over a second.');
        }
    }

    public function test_two_admins_can_update_different_shifts_without_race_conditions()
    {
        $adminOne = $this->makeSuperAdmin();
        $adminTwo = $this->makeSuperAdmin();
        $shiftOne = $this->makeShift($this->makeEmployee());
        $shiftTwo = $this->makeShift($this->makeEmployee());

        $this->putJson('/api/shifts/' . $shiftOne->shift_id, ['shift_location' => 'Counter A'], $this->headers($adminOne))->assertStatus(200);
        $this->putJson('/api/shifts/' . $shiftTwo->shift_id, ['shift_location' => 'Counter B'], $this->headers($adminTwo))->assertStatus(200);

        $this->assertDatabaseHas('duty_shift', ['shift_id' => $shiftOne->shift_id, 'shift_location' => 'Counter A']);
        $this->assertDatabaseHas('duty_shift', ['shift_id' => $shiftTwo->shift_id, 'shift_location' => 'Counter B']);
    }

    // ==========================================
    // REQ-SS-01 ACADEMIC PERIOD TRIGGER (instructions 12-13)
    // ==========================================

    public function test_academic_period_start_key_is_served_from_the_code_default()
    {
        $admin = $this->makeSuperAdmin();

        // The default sits in the future on purpose: the academic-period job is
        // a bulk write over live employee rows, so it must stay dormant until a
        // real term is configured.
        $this->getJson('/api/settings/display', $this->headers($admin))
            ->assertStatus(200)
            ->assertJsonPath('data.academic_period_start', '2027-08-02');

        // Reading the default must never add a row to the settings table
        $this->assertDatabaseCount('settings', 0);
        $this->assertSame('2027-08-02', Setting::getValue('academic_period_start', '2027-08-02'));
    }
}
