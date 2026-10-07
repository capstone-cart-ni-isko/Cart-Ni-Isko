<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Bag;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Employee;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Pickup;
use App\Models\Prodsales;
use App\Models\Prodvar;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * DOMAIN 28 (order claiming) + the fulfillment track the admin pages read.
 *
 * There is no `parcel` / `payment` *linkage* on the happy path any more: a
 * pickup order links its appointment through `pickup`, a delivery order
 * carries its own `delivery` row (delivery.ord_id). Both legacy tables still
 * exist live, so `Order::parcel()` / `Order::payment()` resolve and act as the
 * fallback link for rows written before ord_id was stamped. Fulfilment status lives on `orders.ord_status`
 * (processing | to cancel | to claim | delivering | to receive | claimed |
 * received | unclaimed | cancelled); the legacy `delivery.deliver_status`
 * spelling is only re-derived on the way out so old screens keep working.
 *
 * FLOW-ORD_CLAIM-01..08:
 *  - pickup: scanning `appoint_qr` closes the appointment, clears the QR and
 *    moves the order to `claimed` (`done` when scanned on/before
 *    `appoint_end`, `absent` when scanned after it);
 *  - never scanned after `appoint_end` -> appointment `absent`, order
 *    `unclaimed` (the sweep below);
 *  - delivery: scanning `deliver_qr` stamps the claim/end stamp
 *    (`delivery.deliver_end`, which the spec calls `deliver_timestamp` - see
 *    Delivery::setDeliverTimestampAttribute) and moves the order to
 *    `received`.
 * Stock only leaves the store on those two scans (REQ-WALKIN-03 is the POS
 * twin), and every claim is logged (REQ-ORD_CLAIM-03).
 */
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
            // Close out any pickup window that quietly expired (FLOW-ORD_CLAIM-06)
            $this->sweepExpiredPickups();

            $order = $this->findOrder($json->input('ord_id'));
            if (! $order) {
                return response()->json(['success' => false, 'message' => 'Order not found'], 404);
            }

            $customerId = $this->customerId($json);
            if ($customerId !== null && (int) $order->cust_id !== $customerId) {
                return response()->json(['success' => false, 'message' => 'Order not found'], 404);
            }
            if ($customerId === null && ! $this->isEmployee($json->user('api'))) {
                return response()->json(['success' => false, 'message' => 'Account is not supported.'], 403);
            }

            $trackType = strtolower($json->input('track_type'));
            $order->loadMissing(['items.bag.prodvar.product', 'pickup.appointment', 'delivery']);

            if ($trackType === 'pickup') {
                $pickup = Pickup::with('appointment')->where('ord_id', $order->ord_id)->first();
                if (! $pickup) {
                    return response()->json([
                        'success' => false,
                        'message' => 'No pickup record found for this order',
                    ], 404);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Fulfillment track retrieved successfully',
                    'data' => [
                        'track_type'  => 'PICKUP',
                        'order'       => $this->orderPayload($order),
                        'pickup'      => $this->pickupPayload($pickup, $order),
                        'appointment' => $this->appointmentPayload($pickup->appointment),
                        'payment'     => $this->paymentPayload($order),
                        'pickup_id'   => $pickup->pickup_id,
                        'ord_status'  => $order->ord_status,
                        'status'      => $order->ord_status,
                        // the signed payload the customer renders as a QR
                        'qr_code'     => $this->orderQr($order),
                    ],
                ], 200);
            }

            $delivery = $this->deliveryForOrder($order);
            if (! $delivery) {
                return response()->json([
                    'success' => false,
                    'message' => 'No delivery record found for this order',
                ], 404);
            }

            return response()->json([
                'success' => true,
                'message' => 'Fulfillment track retrieved successfully',
                'data' => [
                    'track_type'  => 'DELIVERY',
                    'order'       => $this->orderPayload($order),
                    'delivery'    => $this->deliveryPayload($delivery, $order),
                    'parcel'      => null, // legacy key, the table is gone
                    'ord_status'  => $order->ord_status,
                    'status'      => $order->ord_status,
                    'qr_code'     => $delivery->deliver_qr,
                    'deliver_qr'  => $delivery->deliver_qr,
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve fulfillment track',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Updating fulfillment status (delivery only - pickup is QR driven)
        ----------
        JSON REQUEST

        track_id - integer (req: delivery.deliver_id)
        track_type - string (req: pickup | delivery)
        status - string (req: legacy TRANSIT/DELIVERED/RETURNED/CANCELLED
                 or a new-vocabulary status)
    */
    public function updateFulfillmentStatus(Request $json)
    {
        $validator = (new InputValidatorAPI())->updateFulfillmentStatus($json);
        if ($validator) return $validator;

        try {
            $trackId = $json->input('track_id');
            $trackType = strtolower($json->input('track_type'));

            if ($trackType !== 'delivery') {
                return response()->json([
                    'success' => false,
                    'message' => 'Pickup orders can only be claimed by QR verification.',
                ], 409);
            }

            $employee = $json->user('api');
            if (! $this->isEmployee($employee)) {
                return response()->json(['success' => false, 'message' => 'Employee access is required.'], 403);
            }

            $delivery = is_numeric($trackId) ? Delivery::find((int) $trackId) : null;
            if (! $delivery) {
                return response()->json(['success' => false, 'message' => 'Delivery record not found'], 404);
            }

            // FLOW-ORD_CLAIM-07: legacy delivery rows may carry no ord_id
            $order = $this->resolveDeliveryOrder($delivery, $employee);
            if (! $order) {
                return response()->json(['success' => false, 'message' => 'Order not found'], 404);
            }

            $status = $this->normalizeStatus((string) $json->input('status'));
            if ($status === null) {
                return response()->json(['success' => false, 'message' => 'Unsupported delivery status.'], 422);
            }

            $priorStatus = (string) $order->ord_status;
            if ($status === $priorStatus) {
                return response()->json([
                    'success' => true,
                    'message' => 'Delivery fulfillment status updated successfully',
                    'data'    => [
                        'track_type' => 'DELIVERY',
                        'delivery'   => $this->deliveryPayload($delivery, $order),
                        'order'      => $this->orderPayload($order),
                        'ord_status' => $order->ord_status,
                    ],
                ], 200);
            }

            $allowed = $this->transitions();
            if (! in_array($status, $allowed[$priorStatus] ?? [], true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Invalid delivery status transition.',
                ], 409);
            }

            // D12: a delivery only starts moving while the store still holds
            // the stock for every bag line.
            if (in_array($status, ['to claim', 'delivering'], true)) {
                foreach ($this->stockShortages($order) as $name) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Insufficient stock for ' . $name,
                    ], 409);
                }
            }

            DB::transaction(function () use ($order, $delivery, $status, $priorStatus) {
                $order->update(['ord_status' => $status]);

                if ($status === 'delivering' && $delivery->deliver_pickedup === null) {
                    $delivery->update(['deliver_pickedup' => now()]);
                }

                if (in_array($status, ['claimed', 'received'], true)) {
                    // FLOW-ORD_CLAIM-08: the claim stamp (see Delivery::$fillable)
                    $delivery->update(['deliver_timestamp' => $delivery->deliver_end ?? now()]);
                    $this->fulfilOrder($order);
                }

                // FLOW-ORD_LIST-09: an approved cancellation closes the track
                if ($status === 'cancelled') {
                    if ($delivery->deliver_end === null) {
                        $delivery->update(['deliver_timestamp' => now()]);
                    }
                    if (in_array($priorStatus, ['claimed', 'received'], true)) {
                        $this->restockOrder($order);
                    }
                    foreach ($this->orderBags($order) as $bag) {
                        $this->bumpProdsales($bag, $order, 'cancel', $order->isWalkIn());
                    }
                }
            });

            $this->logEmployee(
                (int) $employee->emp_id,
                'edit',
                'tracking/update ' . $status . ' - order #' . $order->ord_id
            );

            // REQ-ORD_LIST-03: every customer-visible status change notifies -
            // including `to cancel`, `to claim` and `to receive`, which used to
            // be swallowed by the old REQ-OT-01 silent set.
            if ((int) $order->cust_id > 0) {
                $this->notifyCustomer(
                    (int) $order->cust_id,
                    'Order #' . $order->ord_id . ' status changed to ' . $status . '.'
                );
            }

            $order->refresh();

            return response()->json([
                'success' => true,
                'message' => 'Delivery fulfillment status updated successfully',
                'data' => [
                    'track_type' => 'DELIVERY',
                    'delivery'   => $this->deliveryPayload($delivery->fresh(), $order),
                    'order'      => $this->orderPayload($order),
                    'ord_status' => $order->ord_status,
                    'status'     => $order->ord_status,
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update fulfillment status',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Closing fulfillment track (confirming the order is fully fulfilled)
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

            if ($trackType === 'pickup') {
                $pickup = Pickup::with('appointment')->find(is_numeric($trackId) ? (int) $trackId : 0);
                if (! $pickup) {
                    return response()->json(['success' => false, 'message' => 'Fulfillment track not found.'], 404);
                }

                $order = Order::find($pickup->ord_id);
                // The pickup row carries no completion stamp any more: the
                // appointment closing (or the order leaving `to claim`) is
                // what proves a QR scan happened.
                $scanned = ($pickup->appointment && $pickup->appointment->appoint_closed !== null)
                    || ($order && in_array($order->ord_status, ['claimed', 'received', 'unclaimed', 'cancelled'], true));

                if (! $scanned) {
                    return response()->json([
                        'success' => false,
                        'message' => 'A valid QR scan is required before closing fulfillment.',
                    ], 409);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Fulfillment track is already closed.',
                    'data' => [
                        'track_type' => 'PICKUP',
                        'track'      => $this->pickupPayload($pickup, $order),
                        'pickup'     => $this->pickupPayload($pickup, $order),
                        'order'      => $order ? $this->orderPayload($order) : null,
                        'ord_status' => $order ? $order->ord_status : null,
                    ],
                ], 200);
            }

            $delivery = Delivery::find(is_numeric($trackId) ? (int) $trackId : 0);
            if (! $delivery) {
                return response()->json(['success' => false, 'message' => 'Fulfillment track not found.'], 404);
            }

            $order = $this->resolveDeliveryOrder($delivery, $json->user('api'));
            $scanned = $delivery->deliver_end !== null
                || ($order && in_array($order->ord_status, ['received', 'claimed', 'cancelled'], true));

            if (! $scanned) {
                return response()->json([
                    'success' => false,
                    'message' => 'A valid QR scan is required before closing fulfillment.',
                ], 409);
            }

            return response()->json([
                'success' => true,
                'message' => 'Fulfillment track is already closed.',
                'data' => [
                    'track_type' => 'DELIVERY',
                    'track'      => $this->deliveryPayload($delivery, $order),
                    'delivery'   => $this->deliveryPayload($delivery, $order),
                    'order'      => $order ? $this->orderPayload($order) : null,
                    'ord_status' => $order ? $order->ord_status : null,
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to close fulfillment track',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Scanning a QR code (in-store claiming or delivery receipt)
        ----------
        JSON REQUEST

        code - string (req: appoint_qr | deliver_qr | pay_reference |
               the signed CNI-ORDER-<id>.<hmac> payload)
        scanned_by - string (opt: label of the person scanning)
    */
    public function scanCode(Request $json)
    {
        $validator = (new InputValidatorAPI())->scanCode($json);
        if ($validator) return $validator;

        try {
            $code = trim((string) $json->input('code'));
            $scannedBy = trim((string) $json->input('scanned_by', ''));
            $user = $json->user('api');
            $isEmployee = $this->isEmployee($user);
            $byLabel = $scannedBy !== '' ? ' by ' . $scannedBy : '';

            // A pickup window that quietly expired turns absent/unclaimed
            // before anyone looks at the queue (FLOW-ORD_CLAIM-06).
            $this->sweepExpiredPickups();

            $order = null;
            $delivery = null;
            $appointment = null;
            $viaDeliveryQr = false;

            // 1. FLOW-ORD_CLAIM-07: the parcel's own code
            $candidateDelivery = Delivery::where('deliver_qr', $code)->first();
            if ($candidateDelivery) {
                $viaDeliveryQr = true;
                $delivery = $candidateDelivery;
                // Never `Order::find(null)`: rows written before checkout
                // stamped delivery.ord_id resolve through parcel / customer.
                $order = $this->resolveDeliveryOrder($candidateDelivery, $user);
            }

            // 2. FLOW-ORD_CLAIM-01: the appointment's code
            if (! $order) {
                $candidateAppointment = Appointment::where('appoint_qr', $code)->first();
                if ($candidateAppointment) {
                    $appointment = $candidateAppointment;
                    $candidatePickup = Pickup::where('appoint_id', $candidateAppointment->appoint_id)->first();
                    $order = $candidatePickup ? Order::find($candidatePickup->ord_id) : null;
                }
            }

            // 3. the reference printed on the receipt
            if (! $order && $code !== '') {
                $order = Order::where('pay_reference', $code)->first();
            }

            // 4. the signed payload tracking/create hands the customer
            if (! $order && preg_match('/^CNI-ORDER-(\d+)\./', $code, $matched)) {
                $candidate = Order::find((int) $matched[1]);
                if ($candidate && hash_equals($this->orderQr($candidate), $code)) {
                    $order = $candidate;
                }
            }

            if (! $order) {
                // REQ-APC-03: failed scans notify the store side too
                $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel
                    . ': code "' . $code . '" does not match any active order.');
                $this->logScanAttempt($user, $code, false, 'no matching order');

                return response()->json([
                    'success' => false,
                    'message' => 'QR code does not match any active order',
                ], 404);
            }

            $this->logScanAttempt($user, $code, true, 'matched order #' . $order->ord_id);

            $order->loadMissing(['items.bag.prodvar.product', 'pickup.appointment', 'delivery']);
            if (! $delivery) {
                $delivery = $order->delivery ?? $this->deliveryForOrder($order);
            }
            if (! $appointment && $order->pickup) {
                $appointment = $order->pickup->appointment;
            }

            // ---------------------------------------------------------
            // DELIVERY RECEIPT: FLOW-ORD_CLAIM-07/08 (owning customer)
            // ---------------------------------------------------------
            if ($delivery || ($viaDeliveryQr && ! $order->pickup)) {
                return $this->completeDelivery($json, $order, $delivery, $byLabel, $isEmployee);
            }

            // ---------------------------------------------------------
            // IN-STORE CLAIMING: FLOW-ORD_CLAIM-01..05
            // ---------------------------------------------------------
            return $this->completePickup($json, $order, $appointment, $byLabel, $isEmployee);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to scan QR code',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // ==========================================
    // DOMAIN 28 - THE TWO SCANS
    // ==========================================

    /**
     * FLOW-ORD_CLAIM-07/08: the owning customer confirms the parcel.
     * `deliver_timestamp` (the live `deliver_end` column) is stamped and the
     * order becomes `received`.
     */
    private function completeDelivery(Request $json, Order $order, ?Delivery $delivery, string $byLabel, bool $isEmployee)
    {
        $user = $json->user('api');
        $ownsOrder = $user instanceof Customer && (int) $order->cust_id === (int) $user->cust_id;

        if (! $ownsOrder) {
            // REQ-ORD_CLAIM-01: receipt scanning is a customer power, so an
            // employee (or anyone else) holding the code is refused loudly.
            $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel
                . ': delivery code for order #' . $order->ord_id
                . ($isEmployee ? ' was scanned by an employee.' : ' was scanned by a non-owner.'));
            $this->logScanAttempt($user, (string) $json->input('code'), false, 'delivery code without owner match');

            return response()->json([
                'success' => false,
                'message' => 'Only the owning customer can verify delivery QR codes',
            ], 403);
        }

        $status = (string) $order->ord_status;

        if ($status === 'received') {
            return response()->json([
                'success' => false,
                'message' => 'Order has already been received and its QR code can no longer be scanned',
            ], 409);
        }

        if ($status === 'cancelled' || $status === 'unclaimed') {
            return response()->json([
                'success' => false,
                'message' => 'Order is cancelled and can no longer be scanned',
            ], 409);
        }

        if (! in_array($status, ['delivering', 'to receive'], true)) {
            $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel
                . ': delivery code for order #' . $order->ord_id
                . ' cannot be scanned while its status is ' . $status . '.');
            $this->logScanAttempt($user, (string) $json->input('code'), false, 'status ' . $status);

            return response()->json([
                'success' => false,
                'message' => 'Order cannot be scanned while its status is ' . $status,
            ], 409);
        }

        if (! $delivery) {
            return response()->json([
                'success' => false,
                'message' => 'No delivery record found for this order',
            ], 404);
        }

        DB::transaction(function () use ($order, $delivery) {
            // FLOW-ORD_CLAIM-08: deliver_timestamp -> live `deliver_end` column
            $delivery->update(['deliver_timestamp' => $delivery->deliver_end ?? now()]);
            $order->update(['ord_status' => 'received']);
            $this->fulfilOrder($order);
        });

        // REQ-ORD_CLAIM-03: every claim is logged with timestamp + method
        if ((int) $order->cust_id > 0) {
            $this->logCustomer(
                (int) $order->cust_id,
                'edit',
                'tracking/scan pickup/delivery-receipt order #' . $order->ord_id . ' - QR'
            );

            $this->notifyCustomer((int) $order->cust_id,
                '[PRIORITY] Order #' . $order->ord_id . ' has been received successfully.');
        }

        $this->notifyAllEmployees('[PRIORITY] Order #' . $order->ord_id
            . ' was received via QR scan' . $byLabel . '.');

        $order->refresh();
        $delivery->refresh();

        return response()->json([
            'success' => true,
            'message' => 'Order received successfully',
            'data' => [
                'track_type' => 'DELIVERY',
                'order'      => $this->orderPayload($order),
                'delivery'   => $this->deliveryPayload($delivery, $order),
                'parcel'     => null,
                'ord_status' => $order->ord_status,
                'status'     => $order->ord_status,
            ],
        ], 200);
    }

    /**
     * FLOW-ORD_CLAIM-01..05: the pickup code is spent against the
     * appointment - `done` when scanned on or before `appoint_end`, `absent`
     * when scanned after it - and the order always lands on `claimed`.
     */
    private function completePickup(Request $json, Order $order, ?Appointment $appointment, string $byLabel, bool $isEmployee)
    {
        $user = $json->user('api');
        $pickup = $order->pickup;

        if (! $pickup) {
            // D11: a register sale holds neither fulfillment row
            return response()->json([
                'success' => false,
                'message' => $order->isWalkIn()
                    ? 'Walk-in orders are completed at the register and cannot be scanned.'
                    : 'This order has no pickup appointment.',
            ], 409);
        }

        $ownsOrder = $user instanceof Customer && (int) $order->cust_id === (int) $user->cust_id;

        // REQ-ORD_CLAIM-02 gives employees the scanner; FLOW-ORD_CLAIM-01
        // still lets the owning customer scan their own appoint_qr.
        if (! $ownsOrder && ! $isEmployee) {
            $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel
                . ': pickup code for order #' . $order->ord_id . ' was scanned by a non-owner.');
            $this->logScanAttempt($user, (string) $json->input('code'), false, 'pickup code without owner match');

            return response()->json([
                'success' => false,
                'message' => 'Only store employees or the owning customer can verify pickup QR codes',
            ], 403);
        }

        $status = (string) $order->ord_status;

        if ($status === 'claimed') {
            return response()->json([
                'success' => false,
                'message' => 'Order has already been claimed and its QR code can no longer be scanned',
            ], 409);
        }

        if ($status === 'cancelled') {
            return response()->json([
                'success' => false,
                'message' => 'Order is cancelled and can no longer be scanned',
            ], 409);
        }

        if (! $appointment || $appointment->appoint_closed !== null) {
            return response()->json([
                'success' => false,
                'message' => 'The claiming appointment is not valid.',
            ], 409);
        }

        if ($status !== 'to claim') {
            $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel
                . ': pickup code for order #' . $order->ord_id
                . ' cannot be scanned while its status is ' . $status . '.');
            $this->logScanAttempt($user, (string) $json->input('code'), false, 'status ' . $status);

            return response()->json([
                'success' => false,
                'message' => 'Order cannot be scanned while its status is ' . $status,
            ], 409);
        }

        // FLOW-ORD_CLAIM-04 (on/before appoint_end) / -05 (after appoint_end)
        $late = $appointment->appoint_end !== null && $appointment->appoint_end->isPast();

        DB::transaction(function () use ($order, $appointment, $late) {
            $appointment->update([
                'appoint_status' => $late ? 'absent' : 'done',
                'appoint_closed' => now(),
                // FLOW-ORD_CLAIM-03: the code is spent. There is no storage
                // bucket to delete a file from (spec section 0.4), so the QR
                // is simply cleared.
                'appoint_qr'     => null,
            ]);

            $order->update(['ord_status' => 'claimed']);
            $this->fulfilOrder($order);
        });

        // REQ-ORD_CLAIM-03: every claim is logged with timestamp + method
        if ($isEmployee) {
            $this->logEmployee(
                (int) $user->emp_id,
                'edit',
                'tracking/scan pickup-claim order #' . $order->ord_id
                    . ' - appointment #' . $appointment->appoint_id . ($late ? ' (late)' : '')
            );
        } elseif ((int) $order->cust_id > 0) {
            $this->logCustomer(
                (int) $order->cust_id,
                'edit',
                'tracking/scan pickup-claim order #' . $order->ord_id
                    . ' - appointment #' . $appointment->appoint_id
            );
        }

        if ((int) $order->cust_id > 0) {
            $this->notifyCustomer((int) $order->cust_id,
                '[PRIORITY] Order #' . $order->ord_id . ' has been claimed.');
        }

        $this->notifyAllEmployees('[PRIORITY] Order #' . $order->ord_id
            . ' was claimed via QR scan' . $byLabel . '.');

        $order->refresh();
        $appointment->refresh();

        return response()->json([
            'success' => true,
            'message' => 'Order claimed successfully',
            'data' => [
                'track_type'  => 'PICKUP',
                'order'       => $this->orderPayload($order),
                'pickup'      => $this->pickupPayload($pickup, $order),
                'appointment' => $this->appointmentPayload($appointment),
                'pickup_id'   => $pickup->pickup_id,
                'appoint_id'  => $appointment->appoint_id,
                'ord_status'  => $order->ord_status,
                'status'      => $order->ord_status,
            ],
        ], 200);
    }

    /**
     * FLOW-ORD_CLAIM-06 / D8: a pickup slot whose window passed with no scan
     * turns `absent`, the order turns `unclaimed`, and the code is cleared so
     * the sweep never fires twice.
     *
     * Public because routes/console.php schedules it, so the flip happens on
     * time even when no tracking call ever arrives (REQ-ORD_LIST-02 polling).
     */
    public function sweepExpiredPickups(): void
    {
        $appointments = Appointment::whereRaw('LOWER(appoint_type) IN (?, ?)', ['pickup', 'claim'])
            ->where('appoint_status', 'upcoming')
            ->whereNotNull('appoint_qr')
            ->where('appoint_end', '<', now())
            ->get();

        foreach ($appointments as $appointment) {
            $appointment->update([
                'appoint_status' => 'absent',
                'appoint_closed' => $appointment->appoint_closed ?? now(),
                'appoint_qr'     => null,
            ]);

            $pickup = Pickup::where('appoint_id', $appointment->appoint_id)->first();
            if (! $pickup) continue;

            $order = Order::find($pickup->ord_id);
            if (! $order || $order->ord_status !== 'to claim') continue;

            $order->update(['ord_status' => 'unclaimed']);

            if ((int) $order->cust_id > 0) {
                $this->notifyCustomer(
                    (int) $order->cust_id,
                    '[PRIORITY] Order #' . $order->ord_id
                        . ' was not claimed within its pickup window. Please contact the store.'
                );
            }
        }
    }

    /**
     * The delivery row carrying an order's track (FLOW-ORD_CLAIM-07): the
     * direct `delivery.ord_id` link first, then the legacy parcel link, so an
     * order never reports "no delivery record" while its row exists.
     */
    private function deliveryForOrder(Order $order): ?Delivery
    {
        $delivery = Delivery::where('ord_id', $order->ord_id)->first();
        if ($delivery) {
            return $delivery;
        }

        try {
            $parcel = Parcel::where('ord_id', $order->ord_id)->first();
        } catch (\Throwable $e) {
            return null; // no parcel table -> no legacy link to try
        }

        return $parcel ? Delivery::find($parcel->deliver_id) : null;
    }

    /**
     * FLOW-ORD_CLAIM-07: which order does this delivery row belong to?
     *
     * Checkout stamps `delivery.ord_id` from now on, but rows written before
     * that leave it NULL and `Order::find(null)` was a dead end (404/500).
     * Resolution order: the direct key -> the legacy `parcel.ord_id` link ->
     * the owning customer's delivery order that is still in flight.
     */
    private function resolveDeliveryOrder(Delivery $delivery, $user = null): ?Order
    {
        if (is_numeric($delivery->ord_id) && (int) $delivery->ord_id > 0) {
            return Order::find((int) $delivery->ord_id);
        }

        try {
            $parcel = Parcel::where('deliver_id', $delivery->deliver_id)->first();
        } catch (\Throwable $e) {
            $parcel = null; // no parcel table -> fall through to the customer
        }

        if ($parcel && (int) $parcel->ord_id > 0) {
            $order = Order::find((int) $parcel->ord_id);
            if ($order) {
                return $order;
            }
        }

        $custId = (int) ($delivery->cust_id ?? 0);
        if ($custId <= 0 && $user instanceof Customer) {
            $custId = (int) $user->cust_id;
        }
        if ($custId <= 0) {
            return null;
        }

        $candidates = Order::where('cust_id', $custId)
            ->where('ord_claiming', 'delivery')
            ->orderByDesc('ord_created');

        // an order still moving through delivery beats the customer's newest
        $active = (clone $candidates)
            ->whereIn('ord_status', ['delivering', 'to receive', 'to claim'])
            ->first();

        return $active ?? $candidates->first();
    }

    // ==========================================
    // INVENTORY + METRICS
    // ==========================================

    /**
     * The goods physically left the shelf, so the deduction is exact, and the
     * day's `prodsales` row is guaranteed to exist (Domain 9 / REQ-ORD_CLAIM-03
     * cares about the claim, not about counting the sale twice - the sale
     * itself was recorded when the order was placed).
     */
    private function fulfilOrder(Order $order): void
    {
        $order->loadMissing('items.bag.prodvar.product');
        $walkIn = $order->isWalkIn();
        $threshold = (int) $this->settingValue('low_stock_threshold', 5);
        $lowStock = [];

        foreach ($order->items as $item) {
            $bag = $item->bag;
            if (! $bag || ! $bag->prodvar_id) continue;

            $prodvar = $bag->prodvar;

            // A pre-order variation is paid for before the goods exist, so it
            // is left on the shelf untouched at placement and only deducted
            // now - the moment the goods actually leave the store. In-stock
            // lines were already deducted at placement (CheckoutAPI), so the
            // claim must never deduct them a second time (D8 / REQ-CHECKOUT-06).
            if ($prodvar && (int) $prodvar->prodvar_preorder === 1) {
                Prodvar::where('prodvar_id', $bag->prodvar_id)
                    ->decrement('prodvar_stock', (int) $bag->bag_qty);
                $prodvar->prodvar_stock = max(0, (int) $prodvar->prodvar_stock - (int) $bag->bag_qty);
            }

            if ($prodvar && (int) $prodvar->prodvar_stock <= $threshold) {
                $lowStock[] = [
                    'name' => $prodvar->product ? $prodvar->product->prod_name : ('variation #' . $prodvar->prodvar_id),
                    'qty'  => (int) $prodvar->prodvar_stock,
                ];
            }

            $this->bumpProdsales($bag, $order, 'claim', $walkIn);
        }

        foreach ($lowStock as $low) {
            $this->notifyEmployeesByType(
                ['ADMIN', 'SUPER ADMIN'],
                '[PRIORITY] Low stock: "' . $low['name'] . '" is now down to ' . $low['qty'] . ' unit(s).'
            );
        }
    }

    /** Cancelling an order that already left the shelf puts it back. */
    private function restockOrder(Order $order): void
    {
        foreach ($this->orderBags($order) as $bag) {
            Prodvar::where('prodvar_id', $bag->prodvar_id)
                ->increment('prodvar_stock', (int) $bag->bag_qty);
        }
    }

    /** Every live bag line this order was cut from. */
    private function orderBags(Order $order): array
    {
        $order->loadMissing('items.bag');
        $bagIds = $order->items->pluck('bag_id')->filter()->unique()->values()->all();
        if ($bagIds === []) {
            return [];
        }

        return Bag::whereIn('bag_id', $bagIds)->whereNull('bag_deleted')->get()->all();
    }

    /** Product names whose stock no longer covers the order's bag quantities. */
    private function stockShortages(Order $order): array
    {
        $order->loadMissing('items.bag.prodvar.product');

        $short = [];
        foreach ($order->items as $item) {
            $bag = $item->bag;
            if (! $bag || ! $bag->prodvar) continue;
            if ((int) $bag->prodvar->prodvar_stock < (int) $bag->bag_qty) {
                $short[] = $bag->prodvar->product
                    ? $bag->prodvar->product->prod_name
                    : ('variation #' . $bag->prodvar_id);
            }
        }

        return $short;
    }

    /**
     * DOMAIN 9 / 14 upkeep: one `prodsales` row per variation per day.
     *
     * 'place'  -> qty/amount/bag + cust/guest + walkin/preorder counters
     * 'cancel' -> those counters reversed, cancelled + 1
     * 'claim'  -> makes sure the day's row exists (no double counting)
     */
    private function bumpProdsales(Bag $bag, Order $order, string $mode, bool $walkIn): void
    {
        try {
            $prodvarId = (int) $bag->prodvar_id;
            if ($prodvarId <= 0) return;

            $date = $order->ord_created
                ? \Carbon\Carbon::parse($order->ord_created)->toDateString()
                : today()->toDateString();

            $row = Prodsales::where('prodvar_id', $prodvarId)
                ->where('prodsales_date', $date)
                ->first();

            $customer = Customer::find($order->cust_id);
            $isBueno = $customer
                && ! preg_match('/guest/i', (string) ($customer->cust_type ?? ''));

            if (! $row) {
                $row = new Prodsales();
                $row->prodvar_id = $prodvarId;
                $row->prodsales_date = $date;
                $row->prodsales_qty = 0;
                $row->prodsales_amount = 0;
                $row->prodsales_bag = 0;
                $row->prodsales_cust = 0;
                $row->prodsales_guest = 0;
                $row->prodsales_walkin = 0;
                $row->prodsales_preorder = 0;
                $row->prodsales_unsold = 0;
                $row->prodsales_cancelled = 0;
                $row->prodsales_wishlist = 0;
                $row->prodsales_bueno_categ = $isBueno ? $customer->cust_categ : null;
                $row->prodsales_college = $isBueno ? $customer->cust_college : null;
                $row->prodsales_created = now();
            }

            if ($mode === 'claim') {
                $row->save();
                return;
            }

            $sign = $mode === 'cancel' ? -1 : 1;
            $qty = (int) $bag->bag_qty;
            $amount = round((float) $bag->bag_amount, 2);

            $row->prodsales_qty = (int) $row->prodsales_qty + ($sign * $qty);
            $row->prodsales_amount = round((float) $row->prodsales_amount + ($sign * $amount), 2);
            $row->prodsales_bag = (int) $row->prodsales_bag + $sign;
            $row->prodsales_cust = (int) $row->prodsales_cust + ($isBueno ? $sign : 0);
            $row->prodsales_guest = (int) $row->prodsales_guest + ($isBueno ? 0 : $sign);
            $row->prodsales_walkin = (int) $row->prodsales_walkin + ($walkIn ? $sign : 0);
            $row->prodsales_preorder = (int) $row->prodsales_preorder + ($walkIn ? 0 : $sign);

            if ($mode === 'cancel') {
                $row->prodsales_cancelled = (int) $row->prodsales_cancelled + 1;
            }

            $row->save();
        } catch (\Throwable $e) {
            // Metrics must never break the flow they describe.
        }
    }

    // ==========================================
    // STATUS + ACCESS LOG HELPERS
    // ==========================================

    /** The DOMAIN 27 transition table (employee side). */
    private function transitions(): array
    {
        return [
            'processing' => ['to claim', 'delivering', 'to cancel', 'cancelled'],
            'to cancel'  => ['cancelled', 'processing'],
            'to claim'   => ['claimed', 'unclaimed', 'cancelled'],
            'delivering' => ['to receive', 'received', 'cancelled'],
            'to receive' => ['received', 'claimed', 'cancelled'],
            'claimed'    => ['cancelled', 'received'],
            'received'   => [],
            'unclaimed'  => ['cancelled', 'to claim'],
            'cancelled'  => [],
        ];
    }

    /** Legacy and new status spellings -> the DOMAIN 27 vocabulary. */
    private function normalizeStatus(?string $raw): ?string
    {
        if ($raw === null) return null;

        $trimmed = trim($raw);
        $key = strtoupper($trimmed);

        $map = [
            'PENDING'          => 'processing',
            'TO PROCESS'       => 'processing',
            'PROCESSING'       => 'processing',
            'TO CANCEL'        => 'to cancel',
            'CANCEL REQUESTED' => 'to cancel',
            'CANCELLING'       => 'to cancel',
            'TO CLAIM'         => 'to claim',
            'DELIVERING'       => 'delivering',
            'TRANSIT'          => 'delivering',
            'TO RECEIVE'       => 'to receive',
            'CLAIMED'          => 'claimed',
            'RECEIVED'         => 'received',
            'DELIVERED'        => 'received',
            'COMPLETED'        => 'received',
            'UNCLAIMED'        => 'unclaimed',
            'CANCEL'           => 'cancelled',
            'CANCELED'         => 'cancelled',
            'CANCELLED'        => 'cancelled',
            'RETURN REQUESTED' => 'to cancel',
            'RETURNED'         => 'cancelled',
            'REFUNDED'         => 'cancelled',
        ];

        if (isset($map[$key])) {
            return $map[$key];
        }

        $vocabulary = ['processing', 'to cancel', 'to claim', 'delivering', 'to receive', 'claimed', 'received', 'unclaimed', 'cancelled'];

        return in_array(strtolower($trimmed), $vocabulary, true) ? strtolower($trimmed) : null;
    }

    /** Guarded order lookup: a non-numeric id never reaches the database. */
    private function findOrder($ordId): ?Order
    {
        if ($ordId === null || $ordId === '' || ! is_numeric($ordId) || (int) $ordId <= 0) {
            return null;
        }

        return Order::find((int) $ordId);
    }

    /**
     * REQ-ORD_CLAIM-03 / D32: every scan attempt lands in emplog (employee
     * scanner) or custlog (customer scanner) using the new
     * `*_access` / `*_endpoint` columns.
     */
    private function logScanAttempt($user, string $code, bool $success, string $details): void
    {
        $endpoint = 'tracking/scan ' . ($success ? 'match' : 'miss') . ' - ' . $details
            . ' | code: ' . Str::limit($code, 60, '');

        if ($user instanceof Employee) {
            $this->logEmployee((int) $user->emp_id, 'view', $endpoint);
        } elseif ($user instanceof Customer) {
            $this->logCustomer((int) $user->cust_id, 'view', $endpoint);
        } else {
            $this->logEmployee(0, 'view', $endpoint);
        }
    }

    /** The signed code tracking/create hands to the customer (REQ-APC-01). */
    private function orderQr(Order $order): string
    {
        $payload = 'CNI-ORDER-' . $order->ord_id;
        $signature = hash_hmac('sha256', $payload, (string) config('app.key'));

        return $payload . '.' . $signature;
    }

    // ==========================================
    // PAYLOAD HELPERS (legacy aliases, spec section 6)
    // ==========================================

    /**
     * `delivery.deliver_status` no longer exists: it is re-derived from the
     * order so admin queues that still filter on TRANSIT/DELIVERED keep working.
     */
    private function legacyDeliverStatus(string $ordStatus): string
    {
        $map = [
            'delivering' => 'TRANSIT',
            'to receive' => 'TRANSIT',
            'received'   => 'DELIVERED',
            'claimed'    => 'DELIVERED',
            'cancelled'  => 'CANCELLED',
            'unclaimed'  => 'CANCELLED',
        ];

        return $map[$ordStatus] ?? 'PENDING';
    }

    private function deliveryPayload(?Delivery $delivery, ?Order $order): ?array
    {
        if (! $delivery) {
            return null;
        }

        $payload = $delivery->toArray();
        $payload['ord_id'] = $delivery->ord_id;
        $payload['delivery_ref'] = $delivery->deliver_qr;   // legacy name
        $payload['deliver_date'] = $delivery->deliver_expect; // legacy column
        $payload['deliver_deleted'] = $delivery->deliver_end; // legacy column
        $payload['deliver_status'] = $this->legacyDeliverStatus(
            $order ? (string) $order->ord_status : 'processing'
        );
        $payload['ord_status'] = $order ? $order->ord_status : null;
        $payload['status'] = $order ? $order->ord_status : null;

        return $payload;
    }

    private function appointmentPayload(?Appointment $appointment): ?array
    {
        if (! $appointment) {
            return null;
        }

        $payload = $appointment->toArray();
        $payload['appoint_date'] = $appointment->appoint_start; // legacy single datetime
        $payload['type'] = $appointment->appoint_type;
        $payload['status'] = $appointment->appoint_status;

        return $payload;
    }

    private function pickupPayload(?Pickup $pickup, ?Order $order): ?array
    {
        if (! $pickup) {
            return null;
        }

        $payload = $pickup->toArray();
        $payload['ord_id'] = $pickup->ord_id;
        $payload['appoint_id'] = $pickup->appoint_id;
        $payload['pickup_created'] = $pickup->pickup_created;
        $payload['pickup_completed'] = $pickup->appointment
            ? $pickup->appointment->appoint_closed
            : null; // legacy column
        $payload['appointment'] = $this->appointmentPayload($pickup->appointment);
        $payload['ord_status'] = $order ? $order->ord_status : null;
        $payload['status'] = $order ? $order->ord_status : null;

        return $payload;
    }

    private function paymentPayload(Order $order): array
    {
        return [
            'pay_ref'       => $order->pay_reference,
            'pay_reference' => $order->pay_reference,
            'pay_given'     => (float) $order->pay_received,
            'pay_due'       => (float) $order->ord_amount,
            'pay_change'    => (float) $order->pay_change,
            'ord_amount'    => (float) $order->ord_amount,
        ];
    }

    private function orderPayload(Order $order): array
    {
        $order->loadMissing(['items.bag.prodvar.product', 'pickup.appointment', 'delivery']);

        $items = $order->items->map(function ($item) {
            $bag = $item->bag;
            if (! $bag) {
                return [
                    'item_id' => $item->item_id,
                    'ord_id'  => $item->ord_id,
                    'bag_id'  => $item->bag_id,
                    'product' => null,
                ];
            }

            $array = $this->bagItemArray($bag);
            $array['item_id'] = $item->item_id;
            $array['ord_id'] = $item->ord_id;
            $array['item_created'] = $item->item_created;

            return $array;
        })->values()->all();

        $payload = $order->toArray();
        $payload['items'] = $items;
        $payload['status'] = $order->ord_status;
        $payload['amount'] = $order->ord_amount;
        $payload['created'] = $order->ord_created;
        $payload['dispatch_type'] = $order->ord_claiming;
        $payload['ord_tag'] = null;
        $payload['is_preorder'] = $order->pickup !== null || $order->delivery !== null;
        $payload['is_walk_in'] = $order->pickup === null && $order->delivery === null;

        if ($order->delivery) {
            $payload['deliver_qr'] = $order->delivery->deliver_qr;
            $payload['deliver_addr'] = $order->delivery->deliver_address;
            $payload['deliver_address'] = $order->delivery->deliver_address;
            $payload['deliver_status'] = $this->legacyDeliverStatus((string) $order->ord_status);
        }

        if ($order->pickup && $order->pickup->appointment) {
            $payload['appoint_id'] = $order->pickup->appointment->appoint_id;
            $payload['appoint_start'] = $order->pickup->appointment->appoint_start;
        }

        return $payload;
    }

    private function bagItemArray(Bag $bag): array
    {
        $bag->loadMissing(['prodvar.product']);
        $prodvar = $bag->prodvar;
        $product = $prodvar ? $prodvar->product : null;

        return [
            'bag_id'       => $bag->bag_id,
            'cust_id'      => $bag->cust_id,
            'prodvar_id'   => $bag->prodvar_id,
            'bag_qty'      => (int) $bag->bag_qty,
            'bag_amount'   => (float) $bag->bag_amount,
            'bag_placed'   => (bool) $bag->bag_placed,
            'bag_created'  => $bag->bag_created,
            'bag_deleted'  => $bag->bag_deleted,
            'item_id'      => $bag->bag_id,
            'item_qty'     => (int) $bag->bag_qty,
            'item_amount'  => (float) $bag->bag_amount,
            'prod_id'      => $product ? $product->prod_id : null,
            'prod_tag'     => $product ? $product->prod_tag : null,
            'prod_name'    => $product ? $product->prod_name : null,
            'prodvar_name' => $prodvar ? $prodvar->prodvar_name : null,
            'product'      => $this->productPayload($product, $prodvar),
        ];
    }

    private function productPayload($product, $prodvar = null): ?array
    {
        if (! $product) {
            return null;
        }

        $variants = Prodvar::where('prod_id', $product->prod_id)
            ->whereNull('prodvar_deleted')
            ->get();

        $payload = $product->toArray();
        $payload['prod_qty'] = (int) $variants->sum('prodvar_stock');
        $payload['prod_preorder'] = $variants->contains(fn ($v) => (bool) $v->prodvar_preorder);
        $payload['prod_sizes'] = $variants->pluck('prodvar_name')->values()->all();
        $payload['prod_images'] = $variants->pluck('prodvar_pic')->filter()->unique()->values()->all();

        if ($prodvar) {
            $payload['prodvar_id'] = $prodvar->prodvar_id;
            $payload['prodvar_name'] = $prodvar->prodvar_name;
            $payload['prodvar_pic'] = $prodvar->prodvar_pic;
            $payload['prodvar_markup'] = $prodvar->prodvar_markup;
            $payload['prodvar_stock'] = (int) $prodvar->prodvar_stock;
            $payload['prodvar_preorder'] = (bool) $prodvar->prodvar_preorder;
            $payload['unit_price'] = round(
                (float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0),
                2
            );
        }

        return $payload;
    }
}
