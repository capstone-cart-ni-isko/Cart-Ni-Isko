<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Bag;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Item;
use App\Models\Order;
use App\Models\Pickup;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * DOMAIN 27 (ORDERS LIST - customer / employee transition logic).
 *
 * `ord_status` vocabulary: processing | to cancel | to claim | delivering |
 * to receive | claimed | received | unclaimed | cancelled.
 *
 * The customer may only ASK for a cancellation (FLOW-ORD_LIST-04/06): the
 * request parks the order on `to cancel` until staff approve (-> cancelled)
 * or reject it (-> processing, FLOW-ORD_LIST-07).
 *
 * Line detail is never read from the items table itself - that table only
 * links an ord_id to a bag row - so every line is built as
 * items -> bag -> prodvar -> product. Totals come from ord_amount.
 */
class OrdersAPI extends Controller
{
    /*
        Updating order details (DOMAIN 27)
        ----------
        JSON REQUEST

        ord_id - integer (req)
        ord_status - string (req)
    */
    public function updateOrderDetails(Request $json)
    {
        $validator = (new InputValidatorAPI())->updateOrderDetails($json);
        if ($validator) return $validator;

        try {
            $ordId = (int) $json->input('ord_id');
            $order = Order::with(['items.bag.prodvar.product', 'pickup.appointment', 'delivery', 'parcel.delivery'])
                ->where('ord_id', $ordId)
                ->first();

            if (! $order) {
                return response()->json(['success' => false, 'message' => 'Order not found'], 404);
            }

            if (! $json->has('ord_status')) {
                return response()->json([
                    'success' => false,
                    'message' => 'No updatable fields provided',
                ], 400);
            }

            $rawStatus = (string) $json->input('ord_status');
            $status    = $this->normalizeStatus($rawStatus);

            if ($status === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unsupported order status.',
                ], 422);
            }

            $priorStatus = (string) $order->ord_status;
            $customerId  = $this->customerId($json);

            if ($customerId !== null) {
                return $this->customerStatusUpdate($order, $customerId, $status, $rawStatus, $priorStatus);
            }

            return $this->employeeStatusUpdate($json, $order, $status, $priorStatus);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update order details',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // ==========================================
    // CUSTOMER BRANCH (FLOW-ORD_LIST-04/06)
    // ==========================================

    /**
     * A customer may request a cancellation only while the order is still
     * `processing` (403 for anything else); the request parks it on
     * `to cancel` for staff to approve or reject.
     */
    protected function customerStatusUpdate(Order $order, int $customerId, string $status, string $rawStatus, string $priorStatus)
    {
        if ((int) $order->cust_id !== $customerId) {
            return response()->json(['success' => false, 'message' => 'Order not found'], 404);
        }

        $requesting = $status === 'to cancel';

        if (! $requesting || ($this->normalizeStatus($priorStatus) ?? strtolower(trim($priorStatus))) !== 'processing') {
            return response()->json([
                'success' => false,
                'message' => 'This order change requires staff review.',
            ], 403);
        }

        $rawLabel  = strtoupper(trim($rawStatus));
        $customer  = Customer::find($customerId);

        if ($customer) {
            $walkInError = $this->walkInVisitRequired($customer, $rawLabel);

            if ($walkInError) {
                $this->logCustomer(
                    (int) $customer->cust_id,
                    'edit',
                    'orders/update ' . $rawLabel . ' - order #' . $order->ord_id
                        . ' - ' . $walkInError['code']
                );

                return response()->json([
                    'success'   => false,
                    'message'   => $walkInError['description'],
                    'code'      => $walkInError['code'],
                    'error'     => $walkInError['description'],
                    'timestamp' => $walkInError['timestamp'],
                ], 403);
            }
        }

        // FLOW-ORD_LIST-06: sending the request itself parks the order.
        $order->update(['ord_status' => 'to cancel']);

        $this->logCustomer($customerId, 'edit', 'orders/update to cancel - order #' . $order->ord_id);
        $this->announceStatus($order, 'to cancel');

        return response()->json([
            'success' => true,
            'message' => 'Order details updated successfully',
            'data'    => self::orderPayload($order->fresh()),
        ], 200);
    }

    // ==========================================
    // EMPLOYEE BRANCH (FLOW-ORD_LIST-05/07/08/09)
    // ==========================================

    /**
     * Staff finalize the parked request: `to cancel` -> `cancelled` approves
     * it (FLOW-ORD_LIST-05) and closes the track, `to cancel` -> `processing`
     * rejects it (FLOW-ORD_LIST-07). Any other transition stays as permissive
     * as it was.
     */
    protected function employeeStatusUpdate(Request $json, Order $order, string $status, string $priorStatus)
    {
        $user = $json->user('api');

        if (! $this->isAdmin($user)) {
            return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
        }

        DB::transaction(function () use ($order, $status) {
            $order->update(['ord_status' => $status]);

            // FLOW-ORD_LIST-08/09: finalizing the cancellation closes the
            // pickup appointment or the delivery track.
            if ($status === 'cancelled') {
                $this->closeDispatch($order);
            }
        });

        $this->logEmployee(
            (int) $user->emp_id,
            'edit',
            'orders/update ' . $status . ' - order #' . $order->ord_id
                . ' (was ' . trim($priorStatus) . ')'
        );
        $this->announceStatus($order, $status);

        return response()->json([
            'success' => true,
            'message' => 'Order status updated successfully',
            'data'    => self::orderPayload($order->fresh()),
        ], 200);
    }

    /**
     * FLOW-ORD_LIST-08: a cancelled pickup order stamps its claim appointment
     * with `appoint_closed`. FLOW-ORD_LIST-09: a cancelled delivery order
     * stamps `deliver_end`. Both columns exist live.
     */
    protected function closeDispatch(Order $order): void
    {
        $claiming = strtolower((string) $order->ord_claiming);

        if ($claiming === 'pickup') {
            foreach (Pickup::where('ord_id', $order->ord_id)->get() as $pickup) {
                if (! $pickup->appoint_id) continue;

                Appointment::where('appoint_id', $pickup->appoint_id)
                    ->whereNull('appoint_closed')
                    ->update(['appoint_closed' => now()]);
            }

            return;
        }

        if ($claiming === 'delivery') {
            Delivery::where('ord_id', $order->ord_id)
                ->whereNull('deliver_end')
                ->update(['deliver_end' => now()]);
        }
    }

    /** REQ-ORD_LIST-03: best-effort inbox write, never a failed status change. */
    protected function announceStatus(Order $order, string $status): void
    {
        $custId = (int) $order->cust_id;
        if ($custId <= 0) return;

        try {
            $this->notifyCustomer(
                $custId,
                'Order #' . $order->ord_id . ' status changed to ' . $status . '.'
            );
        } catch (\Throwable $e) {
            Log::warning('Orders customer notification failed', ['error' => $e->getMessage()]);
        }
    }

    // ==========================================
    // SHARED PAYLOAD (also used by CheckoutAPI)
    // ==========================================

    /**
     * One order line. The items table only links an ord_id to a bag row, so
     * quantity, price and product always come from bag -> prodvar -> product.
     */
    public static function lineFromBag(Bag $bag): array
    {
        $line = CartAPI::cartItemPayload($bag);

        $qty    = (int) ($line['bag_qty'] ?? 0);
        $amount = round((float) ($line['bag_amount'] ?? 0), 2);

        $line['qty']        = $qty;
        $line['amount']     = $amount;
        $line['line_total'] = round($qty * $amount, 2);

        return $line;
    }

    /** Same line, reached through its items row (order history detail). */
    public static function lineFromItem(Item $item): array
    {
        $item->loadMissing('bag');
        $bag = $item->bag;

        if (! $bag) {
            return [
                'item_id'      => (int) $item->item_id,
                'ord_id'       => (int) $item->ord_id,
                'bag_id'       => (int) $item->bag_id,
                'item_created' => $item->item_created,
                'qty'          => 0,
                'amount'       => 0.0,
                'line_total'   => 0.0,
                'product'      => null,
            ];
        }

        $line = self::lineFromBag($bag);

        $line['item_id']      = (int) $item->item_id;
        $line['ord_id']       = (int) $item->ord_id;
        $line['item_created'] = $item->item_created;

        return $line;
    }

    /**
     * A placed order with its lines and dispatch details: totals from
     * ord_amount, line detail from items -> bag -> prodvar -> product and
     * pickup/delivery info from the live appointment / delivery columns.
     */
    public static function orderPayload(Order $order): array
    {
        $order->loadMissing([
            'items.bag.prodvar.product', 'pickup.appointment',
            'delivery', 'parcel.delivery', 'parcel.payment',
        ]);

        $items   = $order->items->map(fn (Item $item) => self::lineFromItem($item))->values()->all();
        $payload = $order->toArray();

        $lineTotal = round((float) array_sum(array_column($items, 'line_total')), 2);
        $raw       = $order->getAttribute('ord_amount');
        $amount    = $raw !== null && $raw !== '' ? round((float) $raw, 2) : $lineTotal;

        $payload['items']      = $items;
        $payload['status']     = $order->ord_status;
        $payload['claiming']   = $order->ord_claiming ?? null;
        $payload['created']    = $order->ord_created ?? null;
        $payload['ord_amount'] = $amount;
        $payload['amount']     = $amount;
        $payload['total']      = $amount;

        // Payment: the order's own reference first, the payment row behind the
        // parcel when one exists (live `pickup` has no payment link).
        $payment = $order->parcel?->payment ?? null;

        if ($payment) {
            $payload['pay_ref']    = $payment->pay_ref;
            $payload['pay_given']  = (float) $payment->pay_given;
            $payload['pay_due']    = (float) $payment->pay_due;
            $payload['pay_change'] = (float) $payment->pay_change;
        } elseif ($order->pay_reference) {
            $payload['pay_ref'] = $order->pay_reference;
        }

        // Pickup: the claim appointment slot (start/end) - never a single date.
        $appointment = $order->pickup?->appointment ?? null;

        if ($appointment) {
            $payload['dispatch_type']   = 'pickup';
            $payload['appoint_id']      = (int) $appointment->appoint_id;
            $payload['appoint_start']   = $appointment->appoint_start;
            $payload['appoint_end']     = $appointment->appoint_end;
            $payload['appoint_type']    = $appointment->appoint_type;
            $payload['appoint_status']  = $appointment->appoint_status;
            $payload['appoint_qr']      = $appointment->appoint_qr;
            $payload['appoint_closed']  = $appointment->appoint_closed;
        }

        // Delivery: live columns; the state itself derives from ord_status.
        $delivery = $order->delivery ?? $order->parcel?->delivery ?? null;

        if ($delivery) {
            $payload['dispatch_type']      = 'delivery';
            $payload['deliver_id']         = (int) $delivery->deliver_id;
            $payload['deliver_qr']         = $delivery->deliver_qr;
            $payload['deliver_address']    = $delivery->deliver_address;
            $payload['deliver_addr']       = $delivery->deliver_address;
            $payload['deliver_phone']      = $delivery->deliver_phone;
            $payload['deliver_recipient']  = $delivery->deliver_recipient;
            $payload['deliver_expect']     = $delivery->deliver_expect;
            $payload['deliver_end']        = $delivery->deliver_end;
            $payload['deliver_placed']     = $delivery->deliver_placed;
            $payload['deliver_pickedup']   = $delivery->deliver_pickedup;
            $payload['deliver_completed']  = $delivery->deliver_completed;
            $payload['deliver_notes']      = $delivery->deliver_notes;
            $payload['deliver_service']    = $delivery->deliver_service;
            $payload['deliver_share_link'] = $delivery->deliver_share_link;
            $payload['deliver_last_event'] = $delivery->deliver_last_event;
        }

        $payload['is_preorder'] = $order->pickup !== null
            || $order->delivery !== null
            || $order->parcel !== null;
        $payload['is_walk_in'] = $order->isWalkIn();

        return $payload;
    }

    // ==========================================
    // HELPERS
    // ==========================================

    /** Legacy spellings still sent by the storefront map onto live statuses. */
    protected function normalizeStatus(string $raw): ?string
    {
        $status = trim(strtolower($raw));

        $map = [
            'to process'       => 'processing',
            'processing'       => 'processing',
            'to cancel'        => 'to cancel',
            'cancel requested' => 'to cancel',
            'to claim'         => 'to claim',
            'delivering'       => 'delivering',
            'to receive'       => 'to receive',
            'claimed'          => 'claimed',
            'received'         => 'received',
            'unclaimed'        => 'unclaimed',
            'cancelled'        => 'cancelled',
            'returned'         => 'returned',
            'refunded'         => 'refunded',
        ];

        return $map[$status] ?? null;
    }
}
