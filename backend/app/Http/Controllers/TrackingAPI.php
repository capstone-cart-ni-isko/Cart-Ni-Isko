<?php

    namespace App\Http\Controllers;

    use App\Models\Appointment;
    use App\Models\Customer;
    use App\Models\Delivery;
    use App\Models\Employee;
    use App\Models\Order;
    use App\Models\Parcel;
    use App\Models\Pickup;
    use Illuminate\Http\Request;

    class TrackingAPI extends Controller
    {
        /*
            Creating fulfillment track
            ----------
            JSON REQUEST

            ord_id - integer (req)
            track_type - string (req: pickup | delivery)
        */
        public function createFulfillmentTrack(Request $json)
        {
            $validator = (new InputValidatorAPI())->createFulfillmentTrack($json);
            if ($validator) return $validator;

            try {
                $ordId     = $json->input('ord_id');
                $trackType = strtolower($json->input('track_type'));

                // Verify order exists
                $order = Order::with(['items.product', 'customer'])->where('ord_id', $ordId)->first();
                if (! $order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }
                $customerId = $this->customerId($json);
                if ($customerId !== null && (int) $order->cust_id !== $customerId) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }
                if ($customerId === null && ! $this->isEmployee($json->user('sanctum'))) {
                    return response()->json(['success' => false, 'message' => 'Account is not supported.'], 403);
                }

                if ($trackType === 'pickup') {
                    $track = Pickup::with(['payment'])
                        ->where('ord_id', $ordId)
                        ->first();

                    if (!$track) {
                        return response()->json([
                            'success' => false,
                            'message' => 'No pickup record found for this order'
                        ], 404);
                    }

                    return response()->json([
                        'success' => true,
                        'message' => 'Fulfillment track retrieved successfully',
                        'data' => [
                            'track_type'  => 'PICKUP',
                            'order'       => $order,
                            'pickup'      => $track,
                            'ord_status'  => $order->ord_status,
                            'qr_code'     => $this->orderQr($order),
                        ]
                    ], 200);
                } else {
                    $parcel = Parcel::with(['delivery', 'payment'])
                        ->where('ord_id', $ordId)
                        ->first();

                    if (!$parcel) {
                        return response()->json([
                            'success' => false,
                            'message' => 'No delivery/parcel record found for this order'
                        ], 404);
                    }

                    return response()->json([
                        'success' => true,
                        'message' => 'Fulfillment track retrieved successfully',
                        'data' => [
                            'track_type' => 'DELIVERY',
                            'order'      => $order,
                            'parcel'     => $parcel,
                            'delivery'   => $parcel->delivery,
                            'ord_status' => $order->ord_status,
                            'qr_code' => $delivery->deliver_qr,
                        ]
                    ], 200);
                }

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to retrieve fulfillment track',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating fulfillment status
            ----------
            JSON REQUEST

            track_id - integer (req)
            track_type - string (req: pickup | delivery)
            status - string (req)
                pickup: CLAIMED | UNCLAIMED | CANCELLED
                delivery: TRANSIT | DELIVERED | RETURNED | CANCELLED
        */
        public function updateFulfillmentStatus(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateFulfillmentStatus($json);
            if ($validator) return $validator;

            try {
                $trackId = $json->input('track_id');
                $trackType = strtolower($json->input('track_type'));
                $status = strtoupper($json->input('status'));

                if ($trackType === 'pickup') {
                    return response()->json([
                        'success' => false,
                        'message' => 'Pickup orders can only be claimed by QR verification.',
                    ], 409);
                }

                $delivery = Delivery::find($trackId);
                if (! $delivery) {
                    return response()->json(['success' => false, 'message' => 'Delivery record not found'], 404);
                }

                $allowed = [
                    'PENDING' => ['TRANSIT'],
                    'TRANSIT' => ['RETURNED'],
                ];
                if (! in_array($status, $allowed[$delivery->deliver_status] ?? [], true)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Invalid delivery status transition.',
                    ], 409);
                }

                $delivery->update(['deliver_status' => $status]);

                return response()->json([
                    'success' => true,
                    'message' => 'Delivery fulfillment status updated successfully',
                    'data' => [
                        'track_type' => 'DELIVERY',
                        'delivery' => $delivery->fresh(),
                    ],
                ]);
            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update fulfillment status',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Closing fulfillment track (marking order as fully fulfilled)
            ----------
            JSON REQUEST

            track_id - integer (req)
            track_type - string (req: pickup | delivery)
        */
        public function closeFulfillmentTrack(Request $json)
        {
            $validator = (new InputValidatorAPI())->closeFulfillmentTrack($json);
            if ($validator) return $validator;

            try {
                $trackId = $json->input('track_id');
                $trackType = strtolower($json->input('track_type'));
                $track = $trackType === 'pickup'
                    ? Pickup::find($trackId)
                    : Parcel::find($trackId);
                if (! $track) {
                    return response()->json(['success' => false, 'message' => 'Fulfillment track not found.'], 404);
                }

                $completedAt = $trackType === 'pickup' ? $track->pickup_completed : $track->parcel_completed;
                if (! $completedAt) {
                    return response()->json([
                        'success' => false,
                        'message' => 'A valid QR scan is required before closing fulfillment.',
                    ], 409);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Fulfillment track is already closed.',
                    'data' => ['track_type' => strtoupper($trackType), 'track' => $track],
                ]);
            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to close fulfillment track',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Scanning a QR code (in-store claiming or delivery receipt)
            ----------
            JSON REQUEST

            code - string (req: ord_tag | deliver_qr | appoint_qr)
            scanned_by - string (opt: label of the person scanning)
        */
        public function scanCode(Request $json)
        {
            $validator = (new InputValidatorAPI())->scanCode($json);
            if ($validator) return $validator;

            try {
                $code = trim((string) $json->input('code'));
                $scannedBy = trim((string) $json->input('scanned_by', ''));
                $user = $json->user();
                $isEmployee = $user instanceof Employee;
                $byLabel = $scannedBy !== '' ? ' by ' . $scannedBy : '';

                $order = null;
                $pickup = null;
                $parcel = null;
                $delivery = null;

                $delivery = Delivery::where('deliver_qr', $code)->first();
                if ($delivery) {
                    $parcel = Parcel::where('deliver_id', $delivery->deliver_id)->first();
                    $order = $parcel ? Order::find($parcel->ord_id) : null;
                } else {
                    // REQ-APC-01: one code per order. Accept the order's own
                    // ORD-* tag or the signed payload returned by
                    // tracking/create; the signature is still verified so a
                    // forged ord_id never resolves.
                    $order = Order::where('ord_tag', $code)->first();

                    if (! $order && preg_match('/^CNI-ORDER-(\d+)\./', $code, $matched)) {
                        $candidate = Order::find((int) $matched[1]);
                        if ($candidate && hash_equals($this->orderQr($candidate), $code)) {
                            $order = $candidate;
                        }
                    }

                    // ...or an appointment QR resolving appointment -> order
                    if (! $order) {
                        $appointment = Appointment::where('appoint_qr', $code)->first();
                        if ($appointment) {
                            $appointmentPickup = Pickup::where('appoint_id', $appointment->appoint_id)->first();
                            $order = $appointmentPickup ? Order::find($appointmentPickup->ord_id) : null;
                        }
                    }
                }

                if (!$order) {
                    // REQ-APC-03: failed scans notify the store side too
                    $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel .
                        ': code "' . $code . '" does not match any active order.');
                    return response()->json([
                        'success' => false,
                        'message' => 'QR code does not match any active order'
                    ], 404);
                }

                // Resolve the remaining fulfillment records if not found above
                if (!$pickup) {
                    $pickup = Pickup::where('ord_id', $order->ord_id)->first();
                }
                if (!$parcel) {
                    $parcel = Parcel::where('ord_id', $order->ord_id)->first();
                }
                if (!$delivery && $parcel) {
                    $delivery = Delivery::where('deliver_id', $parcel->deliver_id)->first();
                }

                $status = strtoupper(trim((string) $order->ord_status));

                // ---------------------------------------------------------
                // IN-STORE CLAIMING: status "TO CLAIM" (employee scan only)
                // ---------------------------------------------------------
                if ($status === 'TO CLAIM') {
                    if (!$isEmployee) {
                        $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel .
                            ': in-store claim code for order ' . $order->ord_tag . ' was scanned by a customer.');
                        return response()->json([
                            'success' => false,
                            'message' => 'Only store employees can verify in-store claiming QR codes'
                        ], 403);
                    }
                    if (! $pickup) {
                        return response()->json([
                            'success' => false,
                            'message' => 'This order has no pickup appointment.',
                        ], 409);
                    }
                    $appointment = Appointment::find($pickup->appoint_id);
                    if (! $appointment || $appointment->appoint_type !== 'CLAIM' || $appointment->appoint_closed) {
                        return response()->json([
                            'success' => false,
                            'message' => 'The claiming appointment is not valid.',
                        ], 409);
                    }

                    $order->ord_status = 'CLAIMED';
                    $order->ord_completed = now();
                    $order->save();

                    if ($pickup) {
                        $pickup->update(['pickup_completed' => now()]);

                        if ($pickup->appoint_id) {
                            Appointment::where('appoint_id', $pickup->appoint_id)
                                ->whereNull('appoint_closed')
                                ->update(['appoint_closed' => now()]);
                        }
                    }

                    if ($order->cust_id) {
                        $this->notifyCustomer((int) $order->cust_id,
                            '[PRIORITY] Order ' . $order->ord_tag . ' has been claimed.');
                    }
                    $this->notifyAllEmployees('[PRIORITY] Order ' . $order->ord_tag .
                        ' was claimed via QR scan' . $byLabel . '.');

                    return response()->json([
                        'success' => true,
                        'message' => 'Order claimed successfully',
                        'data' => [
                            'order'      => $order,
                            'pickup'     => $pickup ? $pickup->fresh() : null,
                            'ord_status' => 'CLAIMED',
                        ]
                    ], 200);
                }

                // ---------------------------------------------------------
                // DELIVERY RECEIPT: status "TO RECEIVE" (owning customer only)
                // ---------------------------------------------------------
                if ($status === 'TO RECEIVE') {
                    $ownsOrder = $user instanceof Customer
                        && $order->cust_id
                        && (int) $user->getKey() === (int) $order->cust_id;

                    if (!$ownsOrder) {
                        $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel .
                            ': delivery code for order ' . $order->ord_tag .
                            ($isEmployee ? ' was scanned by an employee.' : ' was scanned by a non-owner.'));
                        return response()->json([
                            'success' => false,
                            'message' => 'Only the owning customer can verify delivery QR codes'
                        ], 403);
                    }

                    $order->ord_status = 'CLAIMED';
                    $order->ord_completed = now();
                    $order->save();

                    if ($parcel) {
                        $parcel->update(['parcel_completed' => now()]);
                    }
                    if ($delivery) {
                        $delivery->update(['deliver_status' => 'DELIVERED']);
                    }

                    $this->notifyCustomer((int) $order->cust_id,
                        '[PRIORITY] Order ' . $order->ord_tag . ' has been received successfully.');
                    $this->notifyAllEmployees('[PRIORITY] Order ' . $order->ord_tag .
                        ' was received via QR scan' . $byLabel . '.');

                    return response()->json([
                        'success' => true,
                        'message' => 'Order received successfully',
                        'data' => [
                            'order'      => $order,
                            'parcel'     => $parcel ? $parcel->fresh() : null,
                            'delivery'   => $delivery ? $delivery->fresh() : null,
                            'ord_status' => 'CLAIMED',
                        ]
                    ], 200);
                }

                // ---------------------------------------------------------
                // CLOSED OR UNKNOWN STATUS: 409 with a specific message
                // ---------------------------------------------------------
                $closedMessages = [
                    'CLAIMED'   => 'Order has already been claimed and its QR code can no longer be scanned',
                    'CANCELLED' => 'Order is cancelled and can no longer be scanned',
                    'RETURNED'  => 'Order has been returned and can no longer be scanned',
                    'REFUNDED'  => 'Order has been refunded and can no longer be scanned',
                ];

                if (isset($closedMessages[$status])) {
                    $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel .
                        ': order ' . $order->ord_tag . ' is already ' . $status . '.');
                    return response()->json([
                        'success' => false,
                        'message' => $closedMessages[$status]
                    ], 409);
                }

                // Any other status (e.g. TO PROCESS) is not scannable yet
                $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel .
                    ': order ' . $order->ord_tag . ' cannot be scanned while its status is ' . $status . '.');
                return response()->json([
                    'success' => false,
                    'message' => 'Order cannot be scanned while its status is ' . $status
                ], 409);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to scan QR code',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        private function orderQr(Order $order): string
        {
            $payload = 'CNI-ORDER-' . $order->ord_id;
            $signature = hash_hmac('sha256', $payload, (string) config('app.key'));

            return $payload . '.' . $signature;
        }
    }
