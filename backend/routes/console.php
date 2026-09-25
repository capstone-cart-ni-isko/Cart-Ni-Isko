<?php

use App\Models\CustNotif;
use App\Models\EmpNotif;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
    REQ-AN-03: every priority notification that is still unread after a day
    gets an automated follow-up notification. A follow-up is tagged with
    [FOLLOW-UP] and references the original notification id, which is what
    keeps this job from sending the same follow-up twice.
*/
Schedule::call(function () {
    $cutoff = now()->subDay();

    $followUpCustomer = function (CustNotif $notif) {
        $exists = CustNotif::where('cust_id', $notif->cust_id)
            ->where('custnotif_msg', 'like', '%[FOLLOW-UP] #' . $notif->custnotif_id . '%')
            ->exists();

        if ($exists) return;

        CustNotif::create([
            'cust_id'           => $notif->cust_id,
            'custnotif_created' => now(),
            'custnotif_read'    => null,
            'custnotif_msg'     => '[FOLLOW-UP] [PRIORITY] ' . $notif->custnotif_msg
                . ' (follow-up for notification #' . $notif->custnotif_id . ')',
        ]);
    };

    $followUpEmployee = function (EmpNotif $notif) {
        $exists = EmpNotif::where('emp_id', $notif->emp_id)
            ->where('empnotif_msg', 'like', '%[FOLLOW-UP] #' . $notif->empnotif_id . '%')
            ->exists();

        if ($exists) return;

        EmpNotif::create([
            'emp_id'           => $notif->emp_id,
            'empnotif_created' => now(),
            'empnotif_read'    => null,
            'empnotif_msg'     => '[FOLLOW-UP] [PRIORITY] ' . $notif->empnotif_msg
                . ' (follow-up for notification #' . $notif->empnotif_id . ')',
        ]);
    };

    CustNotif::whereNull('custnotif_read')
        ->where('custnotif_created', '<=', $cutoff)
        ->where('custnotif_msg', 'like', '%[PRIORITY]%')
        ->where('custnotif_msg', 'not like', '%[FOLLOW-UP%')
        ->orderBy('custnotif_id')
        ->each($followUpCustomer);

    EmpNotif::whereNull('empnotif_read')
        ->where('empnotif_created', '<=', $cutoff)
        ->where('empnotif_msg', 'like', '%[PRIORITY]%')
        ->where('empnotif_msg', 'not like', '%[FOLLOW-UP%')
        ->orderBy('empnotif_id')
        ->each($followUpEmployee);
})->hourlyAt(0)->name('priority-notification-follow-ups')->withoutOverlapping();
