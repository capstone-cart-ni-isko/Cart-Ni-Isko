<?php

use App\Http\Controllers\AppointmentsAPI;
use App\Http\Controllers\OrdersAPI;
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

/*
    FLOW-ORD_CLAIM-06: a pickup appointment that passes appoint_end with no
    QR scan turns `absent` and its order turns `unclaimed` on schedule, so the
    flip no longer depends on a tracking call arriving (OrdersAPI still runs
    the same sweep at the top of tracking/create and tracking/scan).
    Checked every minute - claim slots are 10 minutes long - and the sweep
    clears the QR, so an appointment is only ever flipped once.
*/
Schedule::call(fn () => app(OrdersAPI::class)->sweepExpiredPickups())
    ->everyMinute()
    ->name('sweep-expired-pickups')
    ->withoutOverlapping();

/*
    REQ-MANAGE_APP-07: a store-visit appointment whose window ended more than
    ten minutes ago auto-closes (status `done` + appoint_closed). Pickup
    bookings are handled by the sweep above (sweep-expired-pickups marks them
    `absent`); visits have no QR scan to flip them, so the scheduler does it.
*/
Schedule::call(fn () => app(AppointmentsAPI::class)->autoCloseExpired())
    ->everyMinute()
    ->name('auto-close-expired-visits')
    ->withoutOverlapping();

/*
    REQ-MANAGE_DEL-01: a paid delivery whose expected date/time is within the
    next 24 hours flips `delivering` -> `to receive`, so the customer can mark
    it received the moment it is due (FLOW-ORD_CLAIM-07) rather than waiting
    for a tracking call that may never arrive.
*/
Schedule::call(fn () => app(OrdersAPI::class)->sweepUpcomingDeliveries())
    ->everyThirtyMinutes()
    ->name('sweep-upcoming-deliveries')
    ->withoutOverlapping();

/*
    SYSTEM RULE 78 - "Soft-deleted records must be hard-deleted from the
    database after 18 months." DatabaseAPI owns the purge (it owns every
    statement, rule 80) and this is what makes it happen: once a day, every
    record that reached the end of its life more than 18 months ago - a
    soft-delete marker, a cancelled/absent order or appointment, a rejected
    review, a read notification, a completed delivery or parcel - and that
    nothing points at any more is hard-deleted. The run returns the rows it
    removed per table so the audit trail shows what happened; an empty result
    is not logged, which keeps the daily noise at zero while there is nothing
    to purge.
*/
Schedule::call(function () {
    $purged = \App\Http\Controllers\DatabaseAPI::purgeSoftDeleted();

    if ($purged !== []) {
        \Log::info('System rule 78 purge', $purged);
    }
})->dailyAt('03:30')->name('purge-soft-deleted-records')->withoutOverlapping();

/*
    DOMAIN 32 - access-log retention, half one of the owner's policy: 60
    months after custlog_created / emplog_created a log entry is permanently
    deleted whether any super admin decided or not, and every super admin is
    notified of what went. The 24-month half - the question a super admin may
    answer by hand - lives behind DELETE /api/access/logs and the biweekly
    prompt below. DatabaseAPI::purgeAccessLogs() is the only code path that
    removes a log row.
*/
Schedule::call(fn () => app(\App\Http\Controllers\DatabaseAPI::class)->sweepAccessLogRetention())
    ->dailyAt('04:00')
    ->name('access-log-retention-sweep')
    ->withoutOverlapping();

/*
    DOMAIN 32 - access-log retention, half two of the owner's policy: once
    every two weeks the system asks ALL super admins whether one of them
    wants every log entry older than 24 months deleted now, and reminds them
    that an unanswered question still expires those entries at 60 months. A
    marker file remembers the last question, so the daily run only actually
    asks once per fortnight.
*/
Schedule::call(fn () => app(\App\Http\Controllers\DatabaseAPI::class)->promptAccessLogPurge())
    ->dailyAt('09:00')
    ->name('access-log-retention-prompt')
    ->withoutOverlapping();


