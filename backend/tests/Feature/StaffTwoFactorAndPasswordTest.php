<?php

namespace Tests\Feature;

use App\Models\EmpNotif;
use App\Models\Employee;
use App\Support\EmployeePassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * IT evaluation follow-ups for account security: two-factor staff sign-in
 * and one password standard for every role.
 */
class StaffTwoFactorAndPasswordTest extends TestCase
{
    use RefreshDatabase;

    private function makeEmployee(string $type = 'STAFF'): Employee
    {
        return Employee::forceCreate([
            'emp_created'      => now(),
            'emp_password'     => Hash::make('Password123!'),
            'emp_cred_changed' => now(),
            'emp_surname'      => 'Dela Cruz',
            'emp_givname'      => 'Juan',
            'emp_midname'      => '',
            'emp_suffix'       => '',
            'emp_studnum'      => '2023-' . random_int(30000, 39999),
            'emp_pronoun'      => 'they/them',
            'emp_birthday'     => '2000-01-01',
            'emp_brgy'         => 'Sagpon',
            'emp_city'         => 'Legazpi',
            'emp_province'     => 'Albay',
            'emp_country'      => '',
            'emp_callcode'     => '+63',
            'emp_phone'        => '09' . random_int(500000000, 599999999),
            'emp_email'        => 'twofa' . uniqid() . '@bicol-u.edu.ph',
            'emp_type'         => $type,
            'emp_categ'        => $type,
            'emp_instore'      => 0,
        ]);
    }

    public function test_staff_sign_in_requires_the_emailed_code_when_enabled()
    {
        config(['otp.staff_login' => true]);
        \App\Support\SystemSettings::putMany([
            'store_name' => 'Tindahan ni Isko',
            'store_location' => 'BU',
            'store_contact' => 'store@bicol-u.edu.ph',
            'operating_hours' => '08:00 - 18:00',
        ]);
        $employee = $this->makeEmployee();

        $login = $this->postJson('/api/auth/emp_login', [
            'email' => $employee->emp_email,
            'password' => 'Password123!',
        ])->assertStatus(200)
            ->assertJsonPath('data.requires_otp', true)
            ->assertJsonMissingPath('data.token');

        $challenge = $login->json('data.challenge');

        // The second factor is never handed back by the API itself
        $this->postJson('/api/otp/challenge/inbox', ['challenge' => $challenge, 'purpose' => 'login'])
            ->assertStatus(200)
            ->assertJsonPath('data.code', null);

        // A wrong code opens no session
        $this->postJson('/api/otp/challenge/verify', [
            'challenge' => $challenge, 'purpose' => 'login', 'code' => '000000',
        ])->assertStatus(422);

        preg_match('/\b(\d{6})\b/', (string) EmpNotif::where('emp_id', $employee->emp_id)->latest('empnotif_id')->value('empnotif_msg'), $m);
        $this->assertNotEmpty($m[1] ?? null);

        $this->postJson('/api/otp/challenge/verify', [
            'challenge' => $challenge, 'purpose' => 'login', 'code' => $m[1],
        ])->assertStatus(200)
            ->assertJsonStructure(['data' => ['token']])
            ->assertJsonPath('data.must_change_password', false);
    }

    public function test_staff_sign_in_without_mail_transport_skips_the_code()
    {
        config(['otp.staff_login' => 'auto', 'mail.default' => 'log']);
        \App\Support\SystemSettings::putMany([
            'store_name' => 'Tindahan ni Isko',
            'store_location' => 'BU',
            'store_contact' => 'store@bicol-u.edu.ph',
            'operating_hours' => '08:00 - 18:00',
        ]);
        $employee = $this->makeEmployee();

        $this->postJson('/api/auth/emp_login', [
            'email' => $employee->emp_email,
            'password' => 'Password123!',
        ])->assertStatus(200)->assertJsonStructure(['data' => ['token']]);
    }

    public function test_temporary_staff_password_expires_after_48_hours()
    {
        config(['otp.staff_login' => false]);
        \App\Support\SystemSettings::putMany([
            'store_name' => 'Tindahan ni Isko',
            'store_location' => 'BU',
            'store_contact' => 'store@bicol-u.edu.ph',
            'operating_hours' => '08:00 - 18:00',
        ]);

        $validEmployee = $this->makeEmployee();
        $validEmployee->emp_created = now()->subHours(47);
        $validEmployee->emp_password = EmployeePassword::makeTemporary('Temporary#2026');
        $validEmployee->save();

        $this->postJson('/api/auth/emp_login', [
            'email' => $validEmployee->emp_email,
            'password' => 'Temporary#2026',
        ])->assertStatus(200)
            ->assertJsonPath('data.must_change_password', true);

        $expiredEmployee = $this->makeEmployee();
        $expiredEmployee->emp_created = now()->subHours(49);
        $expiredEmployee->emp_password = EmployeePassword::makeTemporary('Temporary#2026');
        $expiredEmployee->save();

        $this->postJson('/api/auth/emp_login', [
            'email' => $expiredEmployee->emp_email,
            'password' => 'Temporary#2026',
        ])->assertStatus(403)
            ->assertJsonPath('code', 'TEMP_PASSWORD_EXPIRED')
            ->assertJsonPath('message', 'The temporary password has expired. Use Forgot Password to reset it, or contact an admin if you cannot access your university email.');
    }

    public function test_one_password_standard_for_every_role()
    {
        // 8+ with upper, lower, number and symbol - no longer 16 for super admin
        $this->assertTrue(EmployeePassword::meetsStandard('Isko#2026'));
        $this->assertFalse(EmployeePassword::meetsStandard('isko#2026'));
        $this->assertFalse(EmployeePassword::meetsStandard('Isko2026x'));
        $this->assertFalse(EmployeePassword::meetsStandard('Is#26'));
    }
}
