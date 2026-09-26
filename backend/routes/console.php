<?php

use App\Jobs\NotificationFollowUpJob;
use App\Support\AcademicPeriodRoster;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
    REQ-AN-03: every priority notification that is still unread after 2 hours
    gets an automated follow-up notification. A follow-up is tagged with
    [FOLLOW-UP] and references the original notification id, which is what
    keeps this job from sending the same follow-up twice.
    Runs every 15 minutes; controlled by ENABLE_NOTIFICATION_FOLLOWUPS env flag.
*/
Schedule::job(new NotificationFollowUpJob())
    ->everyFifteenMinutes()
    ->name('priority-notification-follow-ups')
    ->withoutOverlapping();

/*
    Scheduler watchdog: the job writes a heartbeat file that
    GET /api/health/scheduler reads, so a stopped or hung schedule:work
    process is detectable over HTTP. It runs every minute so the reported age
    is accurate; the write is a single file.
*/
Schedule::call(function () {
    file_put_contents(storage_path('framework/scheduler-heartbeat'), now()->toDateTimeString());
})->everyMinute()->name('scheduler-heartbeat')->withoutOverlapping();

/*
    REQ-SS-01: at the start of an academic period the baseline duty roster is
    rebuilt - every active employee back to Available, with one duty_shift block
    per day over the standard operating hours. The rebuild is inert until a
    term is configured and then runs once per term; see AcademicPeriodRoster
    for the guards and the exception rule.
*/
Schedule::call(fn () => AcademicPeriodRoster::apply())
    ->hourly()
    ->name('academic-period-start')
    ->withoutOverlapping();


