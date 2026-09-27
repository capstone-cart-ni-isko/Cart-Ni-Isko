<?php

namespace App\Jobs;

use App\Models\CustNotif;
use App\Models\EmpNotif;
use App\Models\Customer;
use App\Models\Employee;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class NotificationFollowUpJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        // Check if follow-up notifications are enabled
        if (!env('ENABLE_NOTIFICATION_FOLLOWUPS', true)) {
            Log::info('Notification follow-ups disabled via env');
            return;
        }

        $cutoff = now()->subDay();

        // Process customer notifications
        $customerFollowUps = CustNotif::whereNull('custnotif_read')
            ->where('custnotif_created', '<=', $cutoff)
            ->where('custnotif_msg', 'like', '%[PRIORITY]%')
            ->where('custnotif_msg', 'not like', '%[FOLLOW-UP]%')
            ->orderBy('custnotif_id')
            ->get();

        foreach ($customerFollowUps as $notif) {
            // Check if follow-up already exists for this notification
            $exists = CustNotif::where('cust_id', $notif->cust_id)
                ->where('custnotif_msg', 'like', '%[FOLLOW-UP] #' . $notif->custnotif_id . '%')
                ->exists();

            if ($exists) continue;

            CustNotif::create([
                'cust_id'           => $notif->cust_id,
                'custnotif_created' => now(),
                'custnotif_read'    => null,
                'custnotif_msg'     => '[FOLLOW-UP] [PRIORITY] ' . $notif->custnotif_msg
                    . ' (follow-up for notification #' . $notif->custnotif_id . ')',
            ]);

            Log::info('Created customer follow-up notification', [
                'original_notif_id' => $notif->custnotif_id,
                'cust_id' => $notif->cust_id,
            ]);
        }

        // Process employee notifications
        $employeeFollowUps = EmpNotif::whereNull('empnotif_read')
            ->where('empnotif_created', '<=', $cutoff)
            ->where('empnotif_msg', 'like', '%[PRIORITY]%')
            ->where('empnotif_msg', 'not like', '%[FOLLOW-UP]%')
            ->orderBy('empnotif_id')
            ->get();

        foreach ($employeeFollowUps as $notif) {
            // Check if follow-up already exists for this notification
            $exists = EmpNotif::where('emp_id', $notif->emp_id)
                ->where('empnotif_msg', 'like', '%[FOLLOW-UP] #' . $notif->empnotif_id . '%')
                ->exists();

            if ($exists) continue;

            EmpNotif::create([
                'emp_id'           => $notif->emp_id,
                'empnotif_created' => now(),
                'empnotif_read'    => null,
                'empnotif_msg'     => '[FOLLOW-UP] [PRIORITY] ' . $notif->empnotif_msg
                    . ' (follow-up for notification #' . $notif->empnotif_id . ')',
            ]);

            Log::info('Created employee follow-up notification', [
                'original_notif_id' => $notif->empnotif_id,
                'emp_id' => $notif->emp_id,
            ]);
        }
    }
}