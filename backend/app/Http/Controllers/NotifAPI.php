<?php

    namespace App\Http\Controllers;

    use App\Models\CustNotif;
    use App\Models\Customer;
    use App\Models\EmpNotif;
    use App\Models\Employee;
    use Illuminate\Http\Request;

    class NotifAPI extends Controller
    {
        /*
            Creating notifications
            ----------
            JSON REQUEST

            recipient_type - string (req: customer | employee)
            recipient_id - integer (req)
            notif_msg - string (req)
        */
        public function createNotification(Request $json)
        {
            $validator = (new InputValidatorAPI())->createNotification($json);
            if ($validator) return $validator;

            try {
                $recipientType = strtolower($json->input('recipient_type'));
                $recipientId   = $json->input('recipient_id');
                $notifMsg      = $json->input('notif_msg');

                if ($recipientType === 'customer') {
                    $recipient = Customer::where('cust_id', $recipientId)->first();
                    if (!$recipient) {
                        return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
                    }

                    $notif = CustNotif::create([
                        'cust_id'           => $recipientId,
                        'custnotif_created' => now(),
                        'custnotif_read'    => null,
                        'custnotif_msg'     => $notifMsg,
                    ]);
                } else {
                    $recipient = Employee::where('emp_id', $recipientId)->first();
                    if (!$recipient) {
                        return response()->json(['success' => false, 'message' => 'Employee not found'], 404);
                    }

                    $notif = EmpNotif::create([
                        'emp_id'           => $recipientId,
                        'empnotif_created' => now(),
                        'empnotif_read'    => null,
                        'empnotif_msg'     => $notifMsg,
                    ]);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Notification created successfully',
                    'data'    => $notif
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to create notification',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Distributing notifications
            ----------
            JSON REQUEST

            recipient_type - string (req: customer | employee)
            notif_msg - string (req)
            recipient_ids - array of integers (opt, if omitted sends to ALL of that type)
        */
        public function distributeNotifications(Request $json)
        {
            $validator = (new InputValidatorAPI())->distributeNotifications($json);
            if ($validator) return $validator;

            try {
                $recipientType = strtolower($json->input('recipient_type'));
                $notifMsg      = $json->input('notif_msg');
                $recipientIds  = $json->input('recipient_ids');

                $sentCount = 0;
                $now = now();

                if ($recipientType === 'customer') {
                    // Fetch target customers
                    $query = Customer::whereNull('cust_deleted')->whereNull('cust_disabled');
                    if (!empty($recipientIds) && is_array($recipientIds)) {
                        $query->whereIn('cust_id', $recipientIds);
                    }
                    $customers = $query->get();

                    $inserts = [];
                    foreach ($customers as $customer) {
                        $inserts[] = [
                            'cust_id'           => $customer->cust_id,
                            'custnotif_created' => $now,
                            'custnotif_read'    => null,
                            'custnotif_msg'     => $notifMsg,
                        ];
                    }
                    if (!empty($inserts)) {
                        CustNotif::insert($inserts);
                        $sentCount = count($inserts);
                    }
                } else {
                    // Fetch target employees
                    $query = Employee::whereNull('emp_deleted')->whereNull('emp_disabled');
                    if (!empty($recipientIds) && is_array($recipientIds)) {
                        $query->whereIn('emp_id', $recipientIds);
                    }
                    $employees = $query->get();

                    $inserts = [];
                    foreach ($employees as $employee) {
                        $inserts[] = [
                            'emp_id'           => $employee->emp_id,
                            'empnotif_created' => $now,
                            'empnotif_read'    => null,
                            'empnotif_msg'     => $notifMsg,
                        ];
                    }
                    if (!empty($inserts)) {
                        EmpNotif::insert($inserts);
                        $sentCount = count($inserts);
                    }
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Notifications distributed successfully',
                    'data' => [
                        'recipient_type' => $recipientType,
                        'sent_count'     => $sentCount,
                    ]
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to distribute notifications',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Displaying notifications for an account (inbox)
            ----------
            JSON REQUEST / Query Params

            recipient_type - string (req: customer | employee)
            recipient_id - integer (req for employees, resolved from the
                            token for customers)
        */
        public function displayNotifications(Request $json)
        {
            $recipientType = strtolower((string) $json->input('recipient_type', ''));
            if (!in_array($recipientType, ['customer', 'employee'], true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Recipient type must be either customer or employee'
                ], 400);
            }

            $user = $json->user();
            $recipientId = $json->input('recipient_id');

            try {
                if ($user instanceof Customer) {
                    if ($recipientType !== 'customer') {
                        return response()->json([
                            'success' => false,
                            'message' => 'Customers may only read their own notifications'
                        ], 403);
                    }
                    $recipientId = $user->getKey();
                } elseif ($user instanceof Employee) {
                    if ($recipientType !== 'employee') {
                        return response()->json([
                            'success' => false,
                            'message' => 'Employees may only read their own notifications'
                        ], 403);
                    }
                    $recipientId = $user->getKey();
                } else {
                    return response()->json(['success' => false, 'message' => 'Account is not supported.'], 403);
                }

                if ($recipientType === 'customer') {
                    // The sanctum token already resolved this customer row,
                    // so a second existence check would only add a round trip
                    $notifications = CustNotif::where('cust_id', $recipientId)
                        ->orderBy('custnotif_created', 'desc')
                        ->get();
                } else {
                    if (!$recipientId) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Recipient ID is required'
                        ], 400);
                    }

                    $notifications = EmpNotif::where('emp_id', $recipientId)
                        ->orderBy('empnotif_created', 'desc')
                        ->get();
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Notifications retrieved successfully',
                    'data'    => $notifications
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display notifications',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating notification status (mark as read)
            ----------
            JSON REQUEST

            notif_id - integer (req)
            recipient_type - string (req: customer | employee)
        */
        public function updateNotificationStatus(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateNotificationStatus($json);
            if ($validator) return $validator;

            try {
                $notifId       = $json->input('notif_id');
                $recipientType = strtolower($json->input('recipient_type'));

                if ($recipientType === 'customer') {
                    $notif = CustNotif::where('custnotif_id', $notifId)->first();
                    if (! $notif || (int) $notif->cust_id !== $this->customerId($json)) {
                        return response()->json(['success' => false, 'message' => 'Customer notification not found'], 404);
                    }
                    if ($notif->custnotif_read) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Notification is already marked as read'
                        ], 400);
                    }
                    $notif->update(['custnotif_read' => now()]);
                } else {
                    $notif = EmpNotif::where('empnotif_id', $notifId)->first();
                    $employee = $json->user('sanctum');
                    if (! $notif || ! $employee instanceof Employee || (int) $notif->emp_id !== (int) $employee->getKey()) {
                        return response()->json(['success' => false, 'message' => 'Employee notification not found'], 404);
                    }
                    if ($notif->empnotif_read) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Notification is already marked as read'
                        ], 400);
                    }
                    $notif->update(['empnotif_read' => now()]);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Notification marked as read',
                    'data'    => $notif->fresh()
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update notification status',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }
    }
