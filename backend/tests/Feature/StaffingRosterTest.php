<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\CustNotif;
use App\Models\Customer;
use App\Models\DutyShift;
use App\Models\EmpLog;
use App\Models\Employee;
use App\Models\Setting;
use App\Support\AcademicPeriodRoster;
use Carbon\Carbon;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Staffing headcount (REQ-AB-03 / REQ-SS-03), the academic-period roster
 * rebuild (REQ-SS-01) and the registration audit row (REQ-UM-04).
 *
 * These run on phpunit's sqlite :memory: database, so no row in the Supabase
 * database is read or written from here.
 */
class StaffingRosterTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;
    private array $tokens = [];
    private ?string $markerBackup = null;
    private bool $markerExisted = false;

    protected function setUp(): void
    {
        parent::setUp();

        // duty_shift exists in Supabase and now has its migration file, so a
        // fresh test database builds it. Older schemas that predate that file
        // still need the stub.
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

        // The roster job writes a marker file next to the application's own
        // state. It is saved and put back so a test run never leaves the
        // running scheduler's marker changed.
        $this->markerBackup = storage_path('framework/academic-period-applied');
        $this->markerExisted = file_exists($this->markerBackup);
        if ($this->markerExisted) {
            $this->markerBackup = file_get_contents($this->markerBackup);
            @unlink(storage_path('framework/academic-period-applied'));
        }
    }

    protected function tearDown(): void
    {
        $path = storage_path('framework/academic-period-applied');
        @unlink($path);
        if ($this->markerExisted && $this->markerBackup !== null) {
            file_put_contents($path, $this->markerBackup);
        }

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
            'emp_instore'  => 0,
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

    // ==========================================
    // REQ-AB-03 / REQ-SS-03 PER-BLOCK HEADCOUNT
    // ==========================================

    public function test_a_block_is_only_staffed_by_the_employees_rostered_for_it()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $admin = $this->makeSuperAdmin();

        // Both officers are in store, but only one is rostered for the morning.
        $morning = $this->makeEmployee(['emp_instore' => 1]);
        $allDay = $this->makeEmployee(['emp_instore' => 1]);

        $this->makeShift($morning, ['shift_start' => '08:00', 'shift_end' => '11:00']);
        $this->makeShift($allDay, ['shift_start' => '08:00', 'shift_end' => '18:00']);

        $slots = $this->getJson('/api/appoint/slots?date=2026-10-05', $this->headers($admin))
            ->assertStatus(200)
            ->json('data.slots');

        // 08:00 is covered by both blocks; 11:00 is covered by one block only.
        $this->assertSame(2, $this->slotAt($slots, '08:00', 'VISIT')['in_store']);
        $this->assertSame(1, $this->slotAt($slots, '11:00', 'VISIT')['in_store']);

        // REQ-AB-03: a visit needs two, so the thin block closes while the
        // fully covered one stays bookable.
        $this->assertTrue($this->slotAt($slots, '08:00', 'VISIT')['available']);
        $this->assertFalse($this->slotAt($slots, '11:00', 'VISIT')['available']);
        $this->assertSame(
            'Not enough in-store employees available (minimum 2 required)',
            $this->slotAt($slots, '11:00', 'VISIT')['reason']
        );
    }

    public function test_a_day_without_any_roster_falls_back_to_the_day_wide_headcount()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $admin = $this->makeSuperAdmin();

        // Rostered for a different day only.
        $this->makeEmployee(['emp_instore' => 1]);
        $this->makeEmployee(['emp_instore' => 1]);
        $this->makeShift($this->makeEmployee(['emp_instore' => 0]), ['shift_date' => '2026-11-01']);

        $slots = $this->getJson('/api/appoint/slots?date=2026-10-05', $this->headers($admin))
            ->assertStatus(200)
            ->json('data.slots');

        $this->assertSame(2, $this->slotAt($slots, '09:00', 'VISIT')['in_store']);
        $this->assertTrue($this->slotAt($slots, '09:00', 'VISIT')['available']);
    }

    public function test_a_booking_is_refused_when_its_own_block_is_understaffed()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $admin = $this->makeSuperAdmin();
        $customer = $this->makeCustomer();

        // One in-store officer, rostered only for the afternoon.
        $officer = $this->makeEmployee(['emp_instore' => 1]);
        $this->makeShift($officer, ['shift_start' => '13:00', 'shift_end' => '18:00']);

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
        $officer = $this->makeEmployee(['emp_instore' => 1]);
        $this->makeShift($officer);

        // Flip the single officer out twice; the notice must not double up.
        $this->putJson('/api/shifts/' . $this->shiftOf($officer)->shift_id, ['emp_instore' => false], $this->headers($admin))
            ->assertStatus(200);
        $this->putJson('/api/shifts/' . $this->shiftOf($officer)->shift_id, ['emp_instore' => false], $this->headers($admin))
            ->assertStatus(200);

        $notices = CustNotif::where('cust_id', $customer->getKey())
            ->where('custnotif_msg', 'like', '%appointment #' . $appointment->appoint_id . '%')
            ->get();

        $this->assertCount(1, $notices);
        $this->assertStringContainsString('staff shortage', $notices->first()->custnotif_msg);
        $this->assertStringContainsString('Reason: staff shortage', $notices->first()->custnotif_msg);
    }

    public function test_a_well_staffed_booking_sends_no_shortage_notice()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $admin = $this->makeSuperAdmin();
        $customer = $this->makeCustomer();

        // A CLAIM needs one in-store employee, so losing one of two keeps the
        // block staffed and the customer hears nothing.
        $this->makeAppointment($customer, 'CLAIM', '2026-10-05', '09:00');
        $first = $this->makeEmployee(['emp_instore' => 1]);
        $second = $this->makeEmployee(['emp_instore' => 1]);
        $this->makeShift($first);
        $this->makeShift($second);

        $this->putJson('/api/shifts/' . $this->shiftOf($first)->shift_id, ['emp_instore' => false], $this->headers($admin))
            ->assertStatus(200);

        $this->assertSame(
            0,
            CustNotif::where('custnotif_msg', 'like', '%Reason: staff shortage%')->count()
        );
    }

    // ==========================================
    // REQ-SS-01 ACADEMIC PERIOD ROSTER
    // ==========================================

    public function test_the_roster_stays_dormant_while_the_term_has_not_opened()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        $this->makeEmployee();

        $summary = AcademicPeriodRoster::apply();

        $this->assertFalse($summary['applied']);
        $this->assertSame('the term has not opened yet', $summary['reason']);
        $this->assertSame(0, $summary['reset']);
        $this->assertDatabaseCount('duty_shift', 0);
        $this->assertSame(0, (int) Employee::first()->fresh()->emp_instore);
    }

    public function test_the_roster_runs_once_per_term()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        Setting::create(['key' => 'academic_period_start', 'value' => '"2026-08-04"']);
        $officer = $this->makeEmployee();

        $first = AcademicPeriodRoster::apply();

        $this->assertTrue($first['applied']);
        $this->assertSame(1, (int) $officer->fresh()->emp_instore);
        $this->assertSame(
            AcademicPeriodRoster::DAYS,
            DutyShift::where('emp_id', $officer->getKey())->count()
        );

        // A second run in the same term is a no-op, so nothing is doubled up
        $second = AcademicPeriodRoster::apply();

        $this->assertFalse($second['applied']);
        $this->assertSame('this term is already applied', $second['reason']);
        $this->assertSame(
            AcademicPeriodRoster::DAYS,
            DutyShift::where('emp_id', $officer->getKey())->count()
        );
    }

    public function test_the_roster_never_overwrites_a_block_an_admin_already_created()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        Setting::create(['key' => 'academic_period_start', 'value' => '"2026-08-04"']);
        // The officer is available, so the exception rule does not apply and
        // the rebuild reaches its gap-filling step.
        $officer = $this->makeEmployee(['emp_instore' => 1]);

        $this->makeShift($officer, ['shift_start' => '13:00', 'shift_end' => '17:00']);

        AcademicPeriodRoster::apply();

        // Every remaining day is filled, and today keeps the admin's own block
        $this->assertSame(
            AcademicPeriodRoster::DAYS,
            DutyShift::where('emp_id', $officer->getKey())->count()
        );

        $mine = DutyShift::where('emp_id', $officer->getKey())
            ->where('shift_date', '2026-10-05')
            ->first();

        $this->assertSame('13:00', $mine->shift_start);
        $this->assertSame('17:00', $mine->shift_end);
    }

    public function test_the_roster_uses_the_store_operating_hours()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        Setting::create(['key' => 'academic_period_start', 'value' => '"2026-08-04"']);
        Setting::create(['key' => 'operating_hours', 'value' => '"09:00 - 21:00"']);
        $officer = $this->makeEmployee();

        AcademicPeriodRoster::apply();

        $block = DutyShift::where('emp_id', $officer->getKey())
            ->where('shift_date', '2026-10-05')
            ->first();

        $this->assertSame('09:00', $block->shift_start);
        $this->assertSame('21:00', $block->shift_end);
    }

    public function test_a_logged_unavailability_survives_the_roster_rebuild()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        Setting::create(['key' => 'academic_period_start', 'value' => '"2026-08-04"']);

        $excepted = $this->makeEmployee(['emp_instore' => 0]);
        $normal = $this->makeEmployee(['emp_instore' => 0]);

        // The exception: a block the officer is not available for.
        $this->makeShift($excepted);

        $summary = AcademicPeriodRoster::apply();

        $this->assertSame(1, $summary['excepted']);
        $this->assertSame(0, (int) $excepted->fresh()->emp_instore);
        $this->assertSame(1, (int) $normal->fresh()->emp_instore);

        // The excepted employee keeps the block that recorded the exception,
        // and gains no baseline block on top of it for that day.
        $this->assertDatabaseHas('duty_shift', [
            'emp_id'     => $excepted->getKey(),
            'shift_date' => '2026-10-05',
            'shift_start'=> '08:00',
        ]);
        $this->assertSame(
            1,
            DutyShift::where('emp_id', $excepted->getKey())->where('shift_date', '2026-10-05')->count()
        );
    }

    public function test_a_disabled_or_deleted_employee_is_left_out_of_the_roster()
    {
        Carbon::setTestNow(Carbon::parse('2026-10-05 07:00:00'));
        Setting::create(['key' => 'academic_period_start', 'value' => '"2026-08-04"']);

        $disabled = $this->makeEmployee(['emp_disabled' => now()]);
        $deleted = $this->makeEmployee(['emp_deleted' => now()]);

        AcademicPeriodRoster::apply();

        $this->assertSame(0, DutyShift::where('emp_id', $disabled->getKey())->count());
        $this->assertSame(0, DutyShift::where('emp_id', $deleted->getKey())->count());
        $this->assertSame(0, (int) $disabled->fresh()->emp_instore);
        $this->assertSame(0, (int) $deleted->fresh()->emp_instore);
    }

    // ==========================================
    // REQ-UM-04 REGISTRATION AUDIT ROW
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

    private function shiftOf(Employee $employee): DutyShift
    {
        return DutyShift::where('emp_id', $employee->getKey())->orderBy('shift_id')->first();
    }
}
