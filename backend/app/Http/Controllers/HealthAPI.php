<?php

namespace App\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\Request;

// Scheduler watchdog (REQ-AN-03). The hourly job writes a heartbeat file and
// this endpoint reports its age, so a stopped or hung schedule:work process is
// visible over HTTP. It is public so a monitor needs no access token.
class HealthAPI extends Controller
{
    // Minutes without a heartbeat before the scheduler counts as stalled
    const STALE_MINUTES = 120;

    /*
        Scheduler health check
        ----------
        No params. Returns 200 while the heartbeat is fresh, 503 once it is
        stale or missing.
    */
    public function schedulerHealth(Request $json)
    {
        $lastRun = trim((string) @file_get_contents(storage_path('framework/scheduler-heartbeat')));
        $ageSeconds = $lastRun === ''
            ? null
            : (int) Carbon::parse($lastRun)->diffInSeconds(now(), true);
        $isRunning = $ageSeconds !== null && $ageSeconds <= self::STALE_MINUTES * 60;

        return response()->json([
            'success'             => true,
            'status'              => $isRunning ? 'RUNNING' : 'STALLED',
            'job'                 => 'priority-notification-follow-ups',
            'last_heartbeat'      => $lastRun === '' ? null : $lastRun,
            'age_seconds'         => $ageSeconds,
            'stale_after_minutes' => self::STALE_MINUTES,
        ], $isRunning ? 200 : 503);
    }
}
