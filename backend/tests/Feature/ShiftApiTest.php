<?php

namespace Tests\Feature;

use App\Models\EmpNotif;
use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Setting;
use App\Http\Controllers\AppointmentsAPI;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Duty shift API (REQ-EMP_SCHED / system-new rule 38).
 *
 * These tests run on phpunit's sqlite :memory: database, so no row in the
 * Supabase database is read or written from here. `schedules` stores one
 * timestamp pair per block (system-new DOMAIN 7) instead of the retired
 * duty_shift date + time columns, and it has no status column, so every
 * status asserted here is the value the API derives.
 */
class ShiftApiTest extends TestCase
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
        // The sanctum guard caches the resolved user for the life of the
        // application instance, and feature tests reuse that instance, so the
        // guards are dropped to let every request re-authenticate its token.
        $this->app['auth']->forgetGuards();

        $key = get_class($model) . ':' . $model->getKey();
        if (! isset($this->tokens[$key])) {
            // The api guard is the signed `cni_token` bearer (ApiToken), so the
            // test mints one the same way login does instead of a Sanctum
            // personal access token, which the guard no longer accepts.
            $this->tokens[$key] = \App\Support\ApiToken::issue($model);
        }

        return ['Authorization' => 'Bearer ' . $this->tokens[$key]];
    }

    private function makeEmployee(array $attributes = []): Employee
    {
        $this->seq++;

        // emp_type is a legacy fixture column and is deliberately absent from
        // the model's fillable list (the live table spells it emp_categ), so
        // the fixture writes it past mass assignment. Both spellings are kept
        // in step: EnsureRole reads either, notifyEmployeesByType reads
        // emp_categ first and falls back to emp_type.
        $data = array_merge([
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
        ], $attributes);

        $data['emp_categ'] = $data['emp_type'] ?? 'STAFF';

        return Employee::forceCreate($data);
    }

    private function makeSuperAdmin(): Employee
    {
        return $this->makeEmployee(['emp_type' => 'SUPER ADMIN']);
    }

    /**
     * One duty block. `schedules` keeps the window as a start/end timestamp
     * pair, so the API's `shift_date` + `shift_start` / `shift_end` fields are
     * folded into it here exactly as SystemAPI::windowStart()/windowEnd() do.
     * `shift_type` / `shift_location` are validated but have no column to
     * live on, so they are never stored.
     */
    private function makeShift(Employee $employee, array $attributes = []): Schedule
    {
        $date = $attributes['shift_date'] ?? now()->addDay()->format('Y-m-d');
        $start = $attributes['shift_start'] ?? '08:00';
        $end   = $attributes['shift_end'] ?? '18:00';

        unset(
            $attributes['shift_date'],
            $attributes['shift_start'],
            $attributes['shift_end'],
            $attributes['shift_type'],
            $attributes['shift_location']
        );

        return Schedule::create(array_merge([
            'emp_id'           => $employee->getKey(),
            'sched_time_start' => Carbon::parse($date . ' ' . $start),
            'sched_time_end'   => Carbon::parse($date . ' ' . $end),
            'sched_created'    => now(),
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
        $this->assertDatabaseCount('schedules', 1);
        $this->assertDatabaseHas('schedules', ['emp_id' => $officer->getKey()]);
    }

    public function test_create_shift_rejects_missing_fields_with_400()
    {
        $admin = $this->makeSuperAdmin();

        $this->postJson('/api/shifts', ['emp_id' => $admin->getKey()], $this->headers($admin))
            ->assertStatus(400)
            ->assertJsonPath('success', false);

        $this->assertDatabaseCount('schedules', 0);
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

        $this->assertDatabaseCount('schedules', 0);
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
            '/api/shifts/' . $shift->sched_id,
            ['shift_start' => '09:30', 'shift_end' => '17:30', 'shift_location' => 'Org Room'],
            $this->headers($admin)
        );

        $response->assertStatus(200)->assertJsonPath('success', true);

        // The window is stored as one timestamp pair, so it is read back
        // through the model rather than as two string columns.
        $shift->refresh();
        $this->assertSame('09:30', $shift->sched_time_start->format('H:i'));
        $this->assertSame('17:30', $shift->sched_time_end->format('H:i'));

        // shift_location is accepted and validated, but `schedules` has no
        // column for it, so the API reports null instead of storing it.
        $this->assertNull($response->json('data.shift_location'));
    }

    public function test_update_shift_rejects_invalid_data_with_400()
    {
        $admin = $this->makeSuperAdmin();
        $shift = $this->makeShift($this->makeEmployee());

        $this->putJson('/api/shifts/' . $shift->sched_id, ['shift_start' => '9 AM'], $this->headers($admin))
            ->assertStatus(400);
        $this->putJson('/api/shifts/' . $shift->sched_id, ['shift_end' => '07:00'], $this->headers($admin))
            ->assertStatus(400);
        $this->putJson('/api/shifts/' . $shift->sched_id, ['emp_id' => 999999], $this->headers($admin))
            ->assertStatus(400);

        $shift->refresh();
        $this->assertSame('08:00', $shift->sched_time_start->format('H:i'));
        $this->assertSame('18:00', $shift->sched_time_end->format('H:i'));
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

        $this->deleteJson('/api/shifts/' . $shift->sched_id, [], $this->headers($admin))
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertDatabaseCount('schedules', 0);
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
        $this->assertSame(
            $inside->sched_time_start->toDateString(),
            $response->json('data.0.shift_date')
        );
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

        // Fixed clock: the derived status compares the block against now, so
        // the "running" and "still ahead" cases must not depend on the hour
        // this suite happens to run at.
        Carbon::setTestNow(Carbon::parse('2026-10-05 12:00:00'));
        $today = '2026-10-05';

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

        Carbon::setTestNow();
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
            '/api/shifts/' . $shift->sched_id,
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
            '/api/shifts/' . $shift->sched_id,
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
            '/api/shifts/' . $shift->sched_id,
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
            '/api/shifts/' . $shift->sched_id,
            ['emp_instore' => false],
            $this->headers($superAdmin)
        )->assertStatus(200);

        // The block now reads as PENDING REPLACEMENT without any status column
        $this->getJson('/api/shifts?status=PENDING REPLACEMENT', $this->headers($superAdmin))
            ->assertJsonPath('data.0.shift_id', $shift->sched_id);

        // Every super admin is alerted, naming the block, employee and time
        $alert = EmpNotif::where('empnotif_msg', 'like', '%block #' . $shift->sched_id . '%')->first();
        $this->assertNotNull($alert, 'The super admin alert was not created.');
        $this->assertStringContainsString('PENDING REPLACEMENT', $alert->empnotif_msg);
        $this->assertStringContainsString('Juan Dela Cruz', $alert->empnotif_msg);
        $this->assertStringContainsString('2026-10-05 07:30:00', $alert->empnotif_msg);

        // Every super admin is alerted exactly once, and nobody else is. The
        // assertion counts the super admins present rather than a fixed number,
        // so the seeded super admin (super@super.com, from seed_super_admin)
        // is covered too - it carries its rank as emp_type, which is exactly
        // what Controller::notifyEmployeesByType() falls back to.
        $superAdminIds = Employee::where('emp_type', 'SUPER ADMIN')->pluck('emp_id');
        $alerts = EmpNotif::where('empnotif_msg', 'like', '%block #' . $shift->sched_id . '%');

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
    // SYSTEM RULE: the primary key of a table with no sequence
    // ==========================================

    /**
     * REGRESSION - POST /api/shifts used to answer 500 "Failed to create duty
     * shift" on the live Supabase connection.
     *
     * `schedules.sched_id` is a bare `bigint NOT NULL` primary key there: no
     * identity, no sequence, no column default. An Eloquent insert that omits
     * the key therefore dies on "null value in column sched_id violates
     * not-null constraint", which is what the endpoint did: SystemAPI::
     * createShift() built the row without a key and `Schedule::$fillable` did
     * not carry `sched_id`, so even a caller that passed one had it stripped
     * again. The sqlite fixture this suite runs on auto-increments the key, so
     * every other test here passed and only production was broken.
     *
     * The assertion watches the SQL that actually reaches the connection: the
     * insert into `schedules` MUST name `sched_id`, which is what proves the
     * number is allocated in application code (App\Support\IdAllocator).
     */
    public function test_creating_a_shift_allocates_its_own_primary_key()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();

        $this->assertContains(
            'sched_id',
            (new \ReflectionClass(Schedule::class))->getDefaultProperties()['fillable'],
            'sched_id must be mass-assignable on the Schedule model.'
        );

        $statements = [];
        \Illuminate\Support\Facades\DB::listen(function ($query) use (&$statements) {
            $statements[] = $query->sql;
        });

        $response = $this->postJson('/api/shifts', $this->shiftPayload($officer), $this->headers($admin));
        $response->assertStatus(201);

        $insert = collect($statements)->first(
            fn (string $sql) => str_starts_with($sql, 'insert into "schedules"')
        );
        $this->assertNotNull($insert, 'No insert into schedules was recorded.');
        $this->assertStringContainsString('"sched_id"', $insert);

        $this->assertDatabaseHas('schedules', [
            'sched_id' => $response->json('data.shift_id'),
            'emp_id'   => $officer->getKey(),
        ]);
    }

    /**
     * The same class of bug on the other writer of `schedules`: enrollment
     * preschedules the new employee (FLOW-EMP_ENROLL-06 / REQ-EMP_ENROLL-06),
     * and that write has to name its key too or the whole enrollment fails.
     */
    public function test_prescheduling_a_new_employee_writes_a_keyed_block()
    {
        $admin = $this->makeSuperAdmin();

        $statements = [];
        \Illuminate\Support\Facades\DB::listen(function ($query) use (&$statements) {
            $statements[] = $query->sql;
        });

        $this->postJson('/api/auth/emp_signup', [
            'givname' => 'Batch',
            'surname' => 'Scheduler',
            'email'   => 'batchsched' . uniqid() . '@bicol-u.edu.ph',
            'phone'   => '0951' . random_int(1000000, 9999999),
            'categ'   => 'STAFF',
        ], $this->headers($admin))->assertStatus(201);

        $insert = collect($statements)->first(
            fn (string $sql) => str_starts_with($sql, 'insert into "schedules"')
        );
        $this->assertNotNull($insert, 'Enrollment did not preschedule the employee.');
        $this->assertStringContainsString('"sched_id"', $insert);
    }

    // ==========================================
    // RBAC + INVENTORY (instructions 60, 72, 75, 76, 78, 79)
    // ==========================================

    public function test_plain_staff_cannot_write_shifts()
    {
        $staff = $this->makeEmployee(['emp_type' => 'STAFF']);
        $shift = $this->makeShift($this->makeEmployee());

        $this->postJson('/api/shifts', $this->shiftPayload($staff), $this->headers($staff))->assertStatus(403);
        $this->putJson('/api/shifts/' . $shift->sched_id, ['shift_type' => 'EVENT PREP'], $this->headers($staff))->assertStatus(403);
        $this->deleteJson('/api/shifts/' . $shift->sched_id, [], $this->headers($staff))->assertStatus(403);

        $this->assertDatabaseHas('schedules', ['sched_id' => $shift->sched_id]);
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
        $this->assertDatabaseCount('schedules', 4);
        $this->assertDatabaseMissing('schedules', ['sched_id' => $shiftId]);
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

        // Two concurrent writers move two different blocks: neither write may
        // land on the other's row.
        $this->putJson('/api/shifts/' . $shiftOne->sched_id, ['shift_start' => '09:30'], $this->headers($adminOne))->assertStatus(200);
        $this->putJson('/api/shifts/' . $shiftTwo->sched_id, ['shift_start' => '10:30'], $this->headers($adminTwo))->assertStatus(200);

        $shiftOne->refresh();
        $shiftTwo->refresh();
        $this->assertSame('09:30', $shiftOne->sched_time_start->format('H:i'));
        $this->assertSame('10:30', $shiftTwo->sched_time_start->format('H:i'));
        $this->assertSame(
            $shiftOne->sched_time_start->toDateString(),
            $shiftTwo->sched_time_start->toDateString()
        );
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

    // ==========================================
    // DOMAIN 7 (EMPLOYEE SCHEDULING) RULES
    // FLOW-EMP_SCHED-03/05 + REQ-EMP_SCHED-01/03/04
    // ==========================================

    public function test_create_shift_must_land_on_the_ten_minute_grid()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();

        $this->postJson(
            '/api/shifts',
            $this->shiftPayload($officer, ['shift_start' => '08:05', 'shift_end' => '13:00']),
            $this->headers($admin)
        )->assertStatus(400)->assertJsonPath('success', false);

        $this->postJson(
            '/api/shifts',
            $this->shiftPayload($officer, ['shift_start' => '08:00', 'shift_end' => '13:15']),
            $this->headers($admin)
        )->assertStatus(400);

        $this->assertDatabaseCount('schedules', 0);
    }

    public function test_overlapping_blocks_are_refused_but_a_block_inside_a_wider_one_is_not()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();

        // The baseline availability block an enrolled employee is prescheduled
        // with (FLOW-EMP_ENROLL-06): a wide window spanning the whole week.
        $this->makeShift($officer, ['shift_date' => now()->addDay()->format('Y-m-d')]);

        // A duty slot INSIDE that window is not a conflict.
        $this->postJson(
            '/api/shifts',
            $this->shiftPayload($officer, ['shift_start' => '09:00', 'shift_end' => '10:00']),
            $this->headers($admin)
        )->assertStatus(201);

        // A partial cross is (REQ-EMP_SCHED-04): it starts inside and ends
        // outside the existing block.
        $this->postJson(
            '/api/shifts',
            $this->shiftPayload($officer, ['shift_start' => '17:00', 'shift_end' => '20:00']),
            $this->headers($admin)
        )->assertStatus(400);

        $this->assertDatabaseCount('schedules', 2);
    }

    public function test_weekly_minimum_of_180_minutes_is_enforced_on_every_change()
    {
        $admin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();

        // FLOW-EMP_SCHED-05: an hour a week is under the floor.
        $this->postJson(
            '/api/shifts',
            $this->shiftPayload($officer, ['shift_start' => '08:00', 'shift_end' => '09:00']),
            $this->headers($admin)
        )->assertStatus(400);

        // Exactly the floor clears it.
        $shiftId = $this->postJson(
            '/api/shifts',
            $this->shiftPayload($officer, ['shift_start' => '08:00', 'shift_end' => '11:00']),
            $this->headers($admin)
        )->assertStatus(201)->json('data.shift_id');

        // Shrinking it below the floor is refused on update too.
        $this->putJson(
            '/api/shifts/' . $shiftId,
            ['shift_start' => '08:00', 'shift_end' => '09:00'],
            $this->headers($admin)
        )->assertStatus(400);

        // A plain admin may not cancel the last block of the week (the week
        // would fall under the floor); a super admin re-plans the roster.
        $adminOnly = $this->makeEmployee(['emp_type' => 'ADMIN']);
        $this->deleteJson('/api/shifts/' . $shiftId, [], $this->headers($adminOnly))->assertStatus(400);
        $this->deleteJson('/api/shifts/' . $shiftId, [], $this->headers($admin))->assertStatus(200);

        $this->assertDatabaseCount('schedules', 0);
    }

    public function test_blocks_more_than_a_day_in_the_past_need_a_super_admin()
    {
        $admin = $this->makeEmployee(['emp_type' => 'ADMIN']);
        $superAdmin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee();

        // Two days back, so the block's own start PLUS the 24-hour allowance
        // is already behind the clock whatever hour the suite runs at.
        $yesterday = now()->subDays(2);

        // REQ-EMP_SCHED-03: an admin may not write a block more than 24 hours
        // in the past.
        $this->postJson(
            '/api/shifts',
            $this->shiftPayload($officer, [
                'shift_date'  => $yesterday->format('Y-m-d'),
                'shift_start' => '08:00',
                'shift_end'   => '11:00',
            ]),
            $this->headers($admin)
        )->assertStatus(400);

        // A super admin may still correct the roster.
        $this->postJson(
            '/api/shifts',
            $this->shiftPayload($officer, [
                'shift_date'  => $yesterday->format('Y-m-d'),
                'shift_start' => '08:00',
                'shift_end'   => '11:00',
            ]),
            $this->headers($superAdmin)
        )->assertStatus(201);
    }

    public function test_batch_scheduling_writes_one_block_per_employee()
    {
        $admin = $this->makeSuperAdmin();
        $first = $this->makeEmployee();
        $second = $this->makeEmployee();
        $headers = $this->headers($admin);

        // REQ-EMP_SCHED-06: the schedule screen sends one POST per selected
        // employee - each block is independent, so one employee's clash never
        // blocks the rest of the batch.
        $this->postJson('/api/shifts', $this->shiftPayload($first), $headers)->assertStatus(201);
        $this->postJson('/api/shifts', $this->shiftPayload($second), $headers)->assertStatus(201);

        $this->assertDatabaseCount('schedules', 2);
        $this->assertSame(
            2,
            Schedule::whereIn('emp_id', [$first->getKey(), $second->getKey()])->count()
        );
    }

    // ==========================================
    // FLOW-EMP_SCHED-04 THE EMPLOYEE'S OWN UNAVAILABLE FLAG
    // ==========================================

    public function test_an_employee_may_flag_one_block_unavailable()
    {
        $superAdmin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee(['emp_type' => 'STAFF', 'emp_instore' => 1]);
        // A week-wide baseline block so the 180-minute floor still clears
        // when one block inside it is flagged unavailable.
        $this->makeShift($officer, ['shift_start' => '00:00', 'shift_end' => '23:59']);
        $block = $this->makeShift($officer, ['shift_start' => '10:00', 'shift_end' => '12:00']);

        $response = $this->putJson(
            '/api/shifts/' . $block->sched_id,
            ['unavailable' => true],
            $this->headers($superAdmin)
        );

        $response->assertStatus(200)->assertJsonPath('success', true);
        $response->assertJsonPath('data.unavailable', true);

        $block->refresh();
        $this->assertNotNull($block->sched_disabled, 'The exception was not stored.');
        $this->assertFalse($block->isStaffed());

        // The flag is the employee's own exception, so it is reported back and
        // the block reads as needing a substitute (REQ-SS-03).
        $this->getJson('/api/shifts?status=PENDING REPLACEMENT', $this->headers($superAdmin))
            ->assertJsonPath('data.0.shift_id', $block->sched_id);
    }

    public function test_clearing_the_exception_puts_the_block_back_on_the_roster()
    {
        $superAdmin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee(['emp_type' => 'STAFF', 'emp_instore' => 1]);
        $this->makeShift($officer, ['shift_start' => '00:00', 'shift_end' => '23:59']);
        $block = $this->makeShift($officer, ['shift_start' => '10:00', 'shift_end' => '12:00']);

        $this->putJson('/api/shifts/' . $block->sched_id, ['unavailable' => true], $this->headers($superAdmin))
            ->assertStatus(200);
        $this->putJson('/api/shifts/' . $block->sched_id, ['unavailable' => false], $this->headers($superAdmin))
            ->assertStatus(200)
            ->assertJsonPath('data.unavailable', false);

        $block->refresh();
        $this->assertNull($block->sched_disabled);
        $this->assertTrue($block->isStaffed());
    }

    public function test_flagging_a_block_unavailable_obeys_the_req_ss_02_deadline()
    {
        $admin = $this->makeEmployee(['emp_type' => 'ADMIN']);
        $officer = $this->makeEmployee(['emp_type' => 'STAFF', 'emp_instore' => 1]);
        Carbon::setTestNow(Carbon::parse('2026-10-05 10:00:00'));

        $block = $this->makeShift($officer, [
            'shift_date'  => '2026-10-05',
            'shift_start' => '09:00',
            'shift_end'   => '18:00',
        ]);

        // The block is already running, so only a super admin may override.
        $this->putJson('/api/shifts/' . $block->sched_id, ['unavailable' => true], $this->headers($admin))
            ->assertStatus(403)
            ->assertJsonPath('code', 'ALR_AVAIL_AFTER_BLOCK_START');

        $block->refresh();
        $this->assertNull($block->sched_disabled);

        Carbon::setTestNow();
    }

    public function test_flagging_a_block_unavailable_still_keeps_the_weekly_minimum()
    {
        $superAdmin = $this->makeSuperAdmin();
        $officer = $this->makeEmployee(['emp_type' => 'STAFF', 'emp_instore' => 1]);
        $block = $this->makeShift($officer, ['shift_start' => '08:00', 'shift_end' => '11:00']);

        // Removing the only block of the week would drop it under 180 minutes.
        $this->putJson('/api/shifts/' . $block->sched_id, ['unavailable' => true], $this->headers($superAdmin))
            ->assertStatus(400);

        $block->refresh();
        $this->assertNull($block->sched_disabled);
    }

    public function test_an_unavailable_block_no_longer_staffs_the_shop()
    {
        $superAdmin = $this->makeSuperAdmin();
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:30:00'));

        $day = '2026-10-05';
        // Every employee also keeps a baseline block later the same week (the
        // floor is Monday-based), so flagging one block unavailable still clears
        // the weekly minimum (REQ-EMP_SCHED-01) and only that block loses its
        // staffing.
        $baseline = ['shift_date' => '2026-10-06', 'shift_start' => '00:00', 'shift_end' => '23:59'];
        $wide = ['shift_date' => $day, 'shift_start' => '00:00', 'shift_end' => '23:59'];

        $makeRostered = function () use ($baseline, $wide) {
            $employee = $this->makeEmployee(['emp_type' => 'STAFF', 'emp_instore' => 1]);
            $this->makeShift($employee, $baseline);

            return $this->makeShift($employee, $wide);
        };

        $makeRostered();
        $makeRostered();
        $flagMe = $makeRostered();

        $headcount = fn () => (new AppointmentsAPI())->rosterHeadcount(
            Carbon::parse($day . ' 10:00'),
            Carbon::parse($day . ' 10:10')
        );

        $this->assertSame(3, $headcount(), 'Three in-store employees hold blocks on this day.');

        // FLOW-EMP_SCHED-06/07: flagging a block unavailable subtracts that
        // employee from the headcount for exactly those hours.
        $this->putJson('/api/shifts/' . $flagMe->sched_id, ['unavailable' => true], $this->headers($superAdmin))
            ->assertStatus(200);

        $this->assertSame(2, $headcount(), 'An unavailable block still staffed the shop.');

        Carbon::setTestNow();
    }
}
