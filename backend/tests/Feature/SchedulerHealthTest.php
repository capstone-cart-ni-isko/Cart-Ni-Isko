<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Scheduler watchdog (REQ-AN-03).
 *
 * The hourly job writes a heartbeat file, and GET /api/health/scheduler
 * reports its age so a stopped or hung schedule:work process is visible over
 * HTTP. The endpoint is public, so a monitor needs no access token.
 */
class SchedulerHealthTest extends TestCase
{
    use RefreshDatabase;

    private const HEARTBEAT = 'framework/scheduler-heartbeat';

    // The endpoint reads a fixed path, so a real heartbeat written by
    // schedule:work is set aside for the duration of a test and restored
    // afterwards. Without this the test would delete the live heartbeat and
    // report a perfectly healthy scheduler as STALLED.
    private ?string $realHeartbeat = null;

    protected function setUp(): void
    {
        parent::setUp();

        $path = storage_path(self::HEARTBEAT);
        $this->realHeartbeat = file_exists($path) ? file_get_contents($path) : null;
    }

    protected function tearDown(): void
    {
        $path = storage_path(self::HEARTBEAT);

        if ($this->realHeartbeat === null) {
            @unlink($path);
        } else {
            file_put_contents($path, $this->realHeartbeat);
        }

        parent::tearDown();
    }

    private function writeHeartbeat(string $when): void
    {
        file_put_contents(storage_path(self::HEARTBEAT), $when);
    }

    public function test_a_fresh_heartbeat_reports_the_scheduler_running()
    {
        $this->writeHeartbeat(now()->subMinutes(2)->toDateTimeString());

        $response = $this->getJson('/api/health/scheduler');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('status', 'RUNNING')
            ->assertJsonPath('job', 'priority-notification-follow-ups');
        $this->assertLessThan(300, $response->json('age_seconds'));
    }

    public function test_a_stale_heartbeat_reports_the_scheduler_stalled()
    {
        $this->writeHeartbeat(now()->subHours(5)->toDateTimeString());

        $this->getJson('/api/health/scheduler')
            ->assertStatus(503)
            ->assertJsonPath('status', 'STALLED');
    }

    public function test_a_missing_heartbeat_reports_the_scheduler_stalled()
    {
        @unlink(storage_path(self::HEARTBEAT));
        clearstatcache();

        $this->getJson('/api/health/scheduler')
            ->assertStatus(503)
            ->assertJsonPath('status', 'STALLED')
            ->assertJsonPath('last_heartbeat', null);
    }

    public function test_the_watchdog_needs_no_access_token()
    {
        $this->writeHeartbeat(now()->toDateTimeString());

        $this->getJson('/api/health/scheduler')->assertStatus(200);
        $this->assertFalse(session()->has('auth_token'));
    }
}
