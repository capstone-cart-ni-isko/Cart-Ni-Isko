<?php

namespace Tests\Feature;

use App\Http\Controllers\DatabaseAPI;
use App\Models\EmpNotif;
use App\Models\Employee;
use App\Support\IdAllocator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * DOMAIN 32 - the owner's access-log retention policy, the two precise
 * exceptions to REQ-ACCESS_LOG-01's "the trail is immutable":
 *
 *   * once every two weeks the system asks ALL super admins whether one of
 *     them wants every log entry older than 24 months deleted now, and says
 *     in the same breath that an unanswered question still expires those
 *     entries at 60 months;
 *   * 60 months after custlog_created / emplog_created an entry is deleted
 *     whether anyone decided or not, and every super admin is told what went.
 *
 * DatabaseAPI::purgeAccessLogs() is the only code path that removes a log
 * row; nothing younger than the asked-for age is ever touched.
 */
class AccessLogRetentionTest extends TestCase
{
    use RefreshDatabase;

    /** One access-log row of the given table, recorded $monthsAgo months ago. */
    private function logRow(string $table, int $monthsAgo): void
    {
        $actor = $table === 'custlog' ? 'cust_id' : 'emp_id';

        DB::table($table)->insert([
            $table . '_id'       => IdAllocator::next($table, $table . '_id'),
            $actor               => 1,
            $table . '_access'   => 'view',
            $table . '_endpoint' => 'GET /api/example',
            $table . '_created'  => now()->subMonths($monthsAgo),
        ]);
    }

    /** The marker file each prompt test isolates in the temp directory. */
    private function marker(): string
    {
        return sys_get_temp_dir() . '/cni-access-log-ask-' . uniqid() . '.txt';
    }

    private function superAdmin(): Employee
    {
        return Employee::where('emp_email', 'super@super.com')->firstOrFail();
    }

    // ==========================================
    // THE 60-MONTH SWEEP
    // ==========================================

    public function test_the_sixty_month_sweep_deletes_only_what_is_that_old()
    {
        $this->logRow('custlog', 61);
        $this->logRow('custlog', 2);
        $this->logRow('emplog', 72);
        $this->logRow('emplog', 2);

        $purged = (new DatabaseAPI())->sweepAccessLogRetention();

        $this->assertSame(['custlog' => 1, 'emplog' => 1], $purged);
        $this->assertSame(1, DB::table('custlog')->count(), 'The 2-month entry must survive.');
        $this->assertSame(1, DB::table('emplog')->count(), 'The 2-month entry must survive.');
    }

    public function test_the_sweep_notifies_every_super_admin_of_what_went()
    {
        $this->logRow('custlog', 61);

        (new DatabaseAPI())->sweepAccessLogRetention();

        $notice = EmpNotif::where('emp_id', $this->superAdmin()->emp_id)
            ->where('empnotif_msg', 'LIKE', '%60 months were permanently deleted%')
            ->first();

        $this->assertNotNull($notice, 'The sweep must tell the super admins what it removed.');
        $this->assertStringContainsString('1 customer', $notice->empnotif_msg);
    }

    public function test_a_sweep_with_nothing_to_delete_says_nothing()
    {
        $this->logRow('custlog', 2);

        $purged = (new DatabaseAPI())->sweepAccessLogRetention();

        $this->assertSame([], $purged);
        $this->assertSame(
            0,
            EmpNotif::where('empnotif_msg', 'LIKE', '%retention%')->count(),
            'An empty sweep must not spam the super admins.'
        );
    }

    // ==========================================
    // THE 24-MONTH MANUAL PURGE
    // ==========================================

    public function test_the_manual_purge_deletes_everything_past_twenty_four_months_only()
    {
        $this->logRow('custlog', 25);
        $this->logRow('custlog', 23);
        $this->logRow('emplog', 30);
        $this->logRow('emplog', 1);

        $purged = (new DatabaseAPI())->purgeAccessLogs(DatabaseAPI::accessLogPurgeMonths);

        $this->assertSame(['custlog' => 1, 'emplog' => 1], $purged);
        $this->assertSame(1, DB::table('custlog')->count());
        $this->assertSame(1, DB::table('emplog')->count());
        $this->assertTrue(
            DB::table('custlog')->where('custlog_created', '>', now()->subMonths(24))->exists(),
            'Nothing younger than 24 months may ever be touched.'
        );
    }

    public function test_the_manual_purge_notifies_the_super_admins_of_the_count()
    {
        $this->logRow('custlog', 25);
        $this->logRow('emplog', 25);

        (new DatabaseAPI())->purgeAccessLogs(DatabaseAPI::accessLogPurgeMonths);

        $notice = EmpNotif::where('emp_id', $this->superAdmin()->emp_id)
            ->where('empnotif_msg', 'LIKE', '%24-month purge%')
            ->first();

        $this->assertNotNull($notice, 'A manual purge must tell every super admin what went.');
        $this->assertStringContainsString('2 access log entries', $notice->empnotif_msg);
    }

    // ==========================================
    // THE BIWEEKLY QUESTION
    // ==========================================

    public function test_the_question_is_asked_once_per_fortnight()
    {
        $marker = $this->marker();
        $api    = new DatabaseAPI();

        $this->assertTrue($api->promptAccessLogPurge($marker), 'The first run must ask.');
        $this->assertFalse($api->promptAccessLogPurge($marker), 'The same fortnight must not ask twice.');

        $ask = EmpNotif::where('emp_id', $this->superAdmin()->emp_id)
            ->where('empnotif_msg', 'LIKE', '%older than 24 months%')
            ->first();

        $this->assertNotNull($ask, 'The question must reach the super admins as a notification.');
        $this->assertStringContainsString('60 months', $ask->empnotif_msg);

        // Two weeks and a day later the question goes out again.
        file_put_contents($marker, now()->subDays(15)->toIso8601String());
        $this->assertTrue($api->promptAccessLogPurge($marker));

        @unlink($marker);
    }

    public function test_the_question_waits_while_there_is_no_super_admin_to_ask()
    {
        $marker = $this->marker();

        Employee::query()->update(['emp_deleted' => now()]);

        $this->assertFalse(
            (new DatabaseAPI())->promptAccessLogPurge($marker),
            'Nobody to ask means nobody was asked.'
        );
        $this->assertFileDoesNotExist($marker, 'The marker must wait so the question goes out later.');

        @unlink($marker);
    }
}
