<?php

namespace App\Http\Controllers;

use App\Exceptions\InsufficientStockException;
use App\Models\Visit;
use App\Models\Bag;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Employee;
use App\Models\Item;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Payment;
use App\Models\Pickup;
use App\Models\Prodsales;
use App\Models\Product;
use App\Models\Prodvar;
use App\Http\Controllers\ProductsAPI;
use App\Services\LalamoveService;
use App\Services\LalamoveUnavailableException;
use App\Services\PayMongoService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class OrdersAPI extends Controller
{

    public function updateOrderDetails(Request $json)
    {
        $validator = (new DatabaseAPI())->updateOrderDetails($json);
        if ($validator) return $validator;

        try {
            $ordId = (int) $json->input('ord_id');
            $order = Order::with(['items.bag.prodvar.product', 'pickup.appointment', 'delivery', 'parcel.delivery'])
                ->where('ord_id', $ordId)
                ->first();

            if (! $order) {
                return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
            }

            if (! $json->has('ord_status')) {
                return response()->json([
                    'success' => false,
                    'message' => 'No updatable fields provided.',
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

    protected function customerStatusUpdate(Order $order, int $customerId, string $status, string $rawStatus, string $priorStatus)
    {
        if ((int) $order->cust_id !== $customerId) {
            return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
        }

        $rawLabel = strtoupper(trim($rawStatus));
        $customer = Customer::find($customerId);

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

        $requesting = $status === 'to cancel';
        $priorKey   = $this->normalizeStatus($priorStatus) ?? strtolower(trim($priorStatus));
        $isReturn = $rawLabel === 'RETURN REQUESTED';

        if ($isReturn || ! $requesting || $priorKey !== 'processing') {
            return response()->json([
                'success' => false,
                'message' => 'This order change requires staff review.',
            ], 403);
        }

        $order->update(['ord_status' => 'to cancel']);

        $this->logCustomer($customerId, 'edit', 'orders/update ' . $rawLabel . ' - order #' . $order->ord_id);
        $this->announceStatus($order, 'to cancel');

        return response()->json([
            'success' => true,
            'message' => 'Order details updated successfully',
            'data'    => self::orderPayload($order->fresh()),
        ], 200);
    }

    protected function employeeStatusUpdate(Request $json, Order $order, string $status, string $priorStatus)
    {
        $user = $json->user('api');

        if (! $this->isAdmin($user)) {
            return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
        }

        if ($order->isWalkIn()) {
            return response()->json([
                'success' => false,
                'message' => 'Walk-in (POS) orders are managed from the point of sale, not the orders list.',
                'code'    => 'WALK_IN_ORDER',
            ], 409);
        }

        $priorKey  = $this->trackingNormalizeStatus($priorStatus) ?? strtolower(trim($priorStatus));
        $targetKey = $this->trackingNormalizeStatus($status);
        $allowed   = $this->transitions()[$priorKey] ?? [];

        if ($targetKey === null || ! in_array($targetKey, $allowed, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Cannot move order from "'
                    . trim($priorStatus) . '" to "' . trim($status) . '".',
                'code'    => 'INVALID_TRANSITION',
            ], 422);
        }

        $deliverExpect = null;
        if ($targetKey === 'delivering' && $json->filled('deliver_expect')) {
            try {
                $deliverExpect = \Carbon\Carbon::parse($json->input('deliver_expect'));
            } catch (\Throwable $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'A valid expected delivery date is required.',
                ], 422);
            }
        }

        if ($priorStatus === 'processing' && in_array($status, ['to claim', 'delivering'], true)) {
            $shortages = $this->stockShortages($order);
            if ($shortages !== []) {
                return response()->json([
                    'success' => false,
                    'message' => 'Insufficient stock for ' . implode(', ', $shortages)
                        . ' - other pre-orders already hold the remaining units.',
                    'code'    => 'INSUFFICIENT_STOCK',
                ], 409);
            }
        }

        DB::transaction(function () use ($order, $status, $deliverExpect) {
            $order->update(['ord_status' => $status]);

            if ($deliverExpect !== null) {
                Delivery::where('ord_id', $order->ord_id)
                    ->update(['deliver_expect' => $deliverExpect]);
            }

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
            'message' => 'Order status updated successfully.',
            'data'    => self::orderPayload($order->fresh()),
        ], 200);
    }

    protected function closeDispatch(Order $order): void
    {
        $claiming = strtolower((string) $order->ord_claiming);

        if ($claiming === 'pickup') {
            foreach (Pickup::where('ord_id', $order->ord_id)->get() as $pickup) {
                if (! $pickup->appoint_id) continue;

                Visit::where('appoint_id', $pickup->appoint_id)
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

    public static function lineFromBag(Bag $bag): array
    {
        $line = UserAPI::cartItemPayload($bag);

        $qty    = (int) ($line['bag_qty'] ?? 0);
        $amount = round((float) ($line['bag_amount'] ?? 0), 2);

        $line['qty']        = $qty;
        $line['amount']     = $amount;
        $line['line_total'] = round($qty * $amount, 2);

        return $line;
    }

    public static function bagLinesPayload($bags): array
    {
        $bags = collect($bags)->values();
        UserAPI::primeCartProducts($bags);

        return $bags->map(fn (Bag $bag) => self::lineFromBag($bag))->values()->all();
    }

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

    public static function orderPayload(Order $order): array
    {
        $order->loadMissing([
            'items.bag.prodvar.product', 'pickup.appointment',
            'delivery', 'parcel.delivery', 'parcel.payment',
        ]);

        ProductsAPI::primePresentations(
            $order->items->map(fn (Item $item) => $item->bag?->prodvar?->product)->filter()->all()
        );

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

        $payment = $order->parcel?->payment ?? null;

        if ($payment) {
            $payload['pay_ref']    = $payment->pay_ref;
            $payload['pay_given']  = (float) $payment->pay_given;
            $payload['pay_due']    = (float) $payment->pay_due;
            $payload['pay_change'] = (float) $payment->pay_change;
        } elseif ($order->pay_reference) {
            $payload['pay_ref'] = $order->pay_reference;
        }

        $payload['pay_method'] = self::payMethodFromReference(
            $payload['pay_ref'] ?? $order->pay_reference
        );

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
            $payload['deliver_share_link'] = $delivery->shareUrl();
            $payload['deliver_last_event'] = $delivery->deliver_last_event;

            $payload['deliver_fee_charged'] = $delivery->deliver_fee_charged !== null
                ? (float) $delivery->deliver_fee_charged : null;
            $payload['deliver_fee_actual']  = $delivery->deliver_fee_actual !== null
                ? (float) $delivery->deliver_fee_actual : null;
            $payload['deliver_fee']         = $payload['deliver_fee_charged'];
            $payload['deliver_env']         = $delivery->deliver_env;
            $payload['deliver_lat']         = $delivery->deliver_lat;
            $payload['deliver_lng']         = $delivery->deliver_lng;

            $payload['dispatch_fee_source'] = $delivery->deliver_env ? 'lalamove' : 'store';

            $courier = $delivery->courier();
            $payload['courier'] = [
                'provider' => $delivery->deliver_env ? 'lalamove' : null,
                'order_id' => $courier['id'],
                'share_url'=> $courier['url'],
                'status'   => $courier['status'],
                'booked'   => $delivery->isBooked(),
            ];

            $payload['ord_ship_policy'] = 'at_checkout';
        }

        $payload['is_preorder'] = $order->pickup !== null
            || $order->delivery !== null
            || $order->parcel !== null;
        $payload['is_walk_in'] = $order->pickup === null && $order->delivery === null;

        if (! isset($payload['ord_ship_policy'])) {
            $payload['ord_ship_policy'] = $payload['is_walk_in'] ? null : 'at_checkout';
        }

        return $payload;
    }

    protected function normalizeStatus(string $raw): ?string
    {
        $status = trim(strtolower($raw));

        $map = [
            'to process'       => 'processing',
            'processing'       => 'processing',
            'to cancel'        => 'to cancel',
            'cancel requested' => 'to cancel',
            'return requested' => 'to cancel',
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

    public static function payMethodFromReference(?string $reference): ?string
    {
        $ref = strtoupper(trim((string) $reference));

        if (str_starts_with($ref, 'POS-CASH-')) {
            return 'cash';
        }
        if (str_starts_with($ref, 'POS-DIGITAL-') || str_starts_with($ref, 'POS-EWALLET-')) {
            return 'digital';
        }

        return null;
    }

    const dispatchFees = ['priority' => 100.0, 'standard' => 50.0, 'saver' => 30.0];

    const dispatchDays = ['priority' => 1, 'standard' => 2, 'saver' => 5];

    public function determineDispatchDetails(Request $json)
    {
        $validator = (new DatabaseAPI())->determineDispatchDetails($json);
        if ($validator) return $validator;

        try {
            $dispatchType = strtolower($json->input('dispatch_type'));
            $speed        = strtolower($json->input('speed', 'standard'));

            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $scope = $this->resolveBagScope($json, $custId);
            if (isset($scope['error'])) {
                return response()->json(['success' => false, 'message' => $scope['error'][0]], $scope['error'][1]);
            }

            $bags        = $scope['bags'];
            $subtotal    = $this->bagSubtotal($bags);
            $quote       = $this->quoteDispatch($json, $dispatchType, $speed);
            $dispatchFee = $quote['fee'];
            $totalDue    = round($subtotal + $dispatchFee, 2);

            if ($dispatchType === 'pickup') {
                $slotStart = $this->slotStartFrom($json) ?? $this->defaultSlotStart();
                $slotEnd   = $slotStart->copy()->addMinutes($this->slotMinutes());
                $appointId = (int) $json->input('appoint_id', 0);

                if ($appointId > 0) {
                    $appointment = Visit::find($appointId);

                    if (! $appointment || ! $this->usableAppointment($appointment, $custId)) {
                        return response()->json([
                            'success' => false,
                            'message' => 'A valid order-claiming appointment is required.',
                        ], 422);
                    }

                    $slotStart = $this->normalizeSlotStart($appointment->appoint_start ?? $slotStart);
                    $slotEnd   = $slotStart->copy()->addMinutes($this->slotMinutes());
                }

                if (! $this->slotHasCapacity($slotStart, $slotEnd, $appointId ?: null)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'The selected pickup slot is already full. Please pick another slot.',
                    ], 409);
                }

                $dispatchDetails = [
                    'type'             => 'PICKUP',
                    'appoint_id'       => $appointId ?: null,
                    'appoint_start'    => $slotStart,
                    'appoint_end'      => $slotEnd,
                    'appointment_date' => $slotStart,
                    'location'         => 'Tindahan ni Isko Physical Store',
                ];
            } else {
                $customer     = Customer::find($custId);
                $deliverAddress = $this->deliveryAddress($json, $customer);
                $expect       = $this->deliveryExpectation($json, $speed);

                $dispatchDetails = [
                    'type'               => 'DELIVERY',
                    'speed'              => strtoupper($speed),
                    'deliver_address'    => $deliverAddress,
                    'deliver_phone'      => (string) ($customer->cust_phone ?? ''),
                    'deliver_expect'     => $expect,
                    'estimated_delivery' => $expect->toDateTimeString(),
                    'courier'            => $quote['courier'],
                    'fee_source'         => $quote['source'],
                ];
            }

            return response()->json([
                'success' => true,
                'message' => 'Dispatch details determined successfully',
                'data'    => [
                    'bag_ids'          => $bags->pluck('bag_id')->all(),
                    'subtotal'         => $subtotal,
                    'dispatch_fee'     => $dispatchFee,
                    'dispatch_quote'   => $quote,
                    'total_due'        => $totalDue,
                    'total'            => $totalDue,
                    'cart_count'       => UserAPI::cartCount($custId),
                    'items'            => self::bagLinesPayload($bags),
                    'dispatch_details' => $dispatchDetails,
                ],
            ], 200);

        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 409);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to determine dispatch details',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function integratePayment(Request $json)
    {
        $validator = (new DatabaseAPI())->integratePayment($json);
        if ($validator) return $validator;

        $custId = $this->customerId($json);
        if ($custId === null) {
            return response()->json([
                'success' => false,
                'message' => 'Customer authentication is required.',
            ], 403);
        }

        $this->logCustomer($custId, 'edit',
            'POST /api/checkout/payment - refused, preorders are paid online only');

        return response()->json([
            'success' => false,
            'message' => 'Preorders are paid online only. Your bag has been kept exactly as it was.',
            'code'    => 'ONLINE_PAYMENT_REQUIRED',
        ], 409);
    }

    public function createPaymentIntent(Request $json)
    {
        $validator = (new DatabaseAPI())->createPaymentIntent($json);
        if ($validator) return $validator;

        try {
            $gateway      = strtolower($json->input('gateway'));
            $dispatchType = strtolower($json->input('dispatch_type', 'pickup'));
            $speed        = strtolower($json->input('speed', 'standard'));

            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            if ($gateway !== 'paymongo') {
                return response()->json(['success' => false, 'message' => 'Unsupported payment gateway'], 400);
            }

            if (! PayMongoService::isConfigured()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Online payment is not yet configured. '
                        . 'Your bag is unchanged - please try again once the store enables online payments.',
                    'code'    => 'PAYMENT_GATEWAY_UNAVAILABLE',
                ], 503);
            }

            $gate = $this->otpGate($json, 'checkout');
            if ($gate) return $gate;

            $returnBase = rtrim((string) config('services.frontend_url'), '/');

            $result = $this->placeOrder($json, $custId, $dispatchType, $speed,
                function (Order $order, float $due) use ($returnBase) {
                    $paymongo = new PayMongoService();

                    $session = $paymongo->createCheckoutSession(
                        [[
                            'name'     => 'Order #' . $order->ord_id . ' - Tindahan ni Isko',
                            'amount'   => $due,
                            'quantity' => 1,
                        ]],
                        'order:' . $order->ord_id,
                        $returnBase . '/checkout?status=paid&order=' . $order->ord_id,
                        $returnBase . '/checkout?status=cancelled&order=' . $order->ord_id
                    );

                    return [
                        'pay_ref' => $session['id'],
                        'paid'    => false,
                        'given'   => 0.0,
                        'due'     => $due,
                        'change'  => 0.0,
                        'intent'  => [
                            'payment_intent_id' => $session['id'],
                            'client_key'        => $session['id'],
                            'checkout_url'      => $session['checkout_url'],
                            'checkout_session'  => $session['id'],
                            'livemode'          => $session['livemode'],
                        ],
                    ];
                });

            $this->consumeOtp($json, 'checkout');

            $intent = $result['reference']['intent'] ?? [];

            $this->logCustomer($custId, 'edit',
                'POST /api/checkout/payment/intent - order #' . $result['order']->ord_id);

            return response()->json([
                'success' => true,
                'message' => 'Payment intent created successfully',
                'data'    => [
                    'checkout_url'        => $intent['checkout_url'] ?? null,
                    'checkout_session_id' => $intent['checkout_session'] ?? null,
                    'payment_intent_id'   => $intent['payment_intent_id'] ?? null,
                    'client_key'          => $intent['client_key'] ?? null,
                    'reference'           => 'order:' . $result['order']->ord_id,
                    'ord_id'              => $result['order']->ord_id,
                    'bag_ids'             => $result['bag_ids'],
                    'total_due'           => $result['payment']['pay_due'],
                    'cart_count'          => UserAPI::cartCount($custId),
                    'payment'             => $result['payment'],
                    'dispatch'            => $result['dispatch'],
                    'order'               => OrdersAPI::orderPayload($result['order']),
                ],
            ], 201);

        } catch (InsufficientStockException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 409);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 409);
        } catch (\Exception $e) {
            Log::error('PayMongo createPaymentIntent error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to create payment intent',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function paymentWebhook(Request $json)
    {
        $signature = $json->header('Paymongo-Signature');
        $payload   = $json->getContent();

        if (! $signature) {
            Log::warning('PayMongo webhook missing signature');
            return response()->json(['success' => false, 'message' => 'Missing signature'], 403);
        }

        try {
            $paymongo = new PayMongoService();
            if (! $paymongo->webhookVerify($payload, $signature)) {
                Log::warning('PayMongo webhook signature verification failed');
                return response()->json(['success' => false, 'message' => 'Invalid signature'], 403);
            }

            $event = json_decode($payload, true);
            if (! is_array($event)) {
                return $this->webhookAck('Event acknowledged');
            }

            $type      = (string) ($event['data']['type'] ?? ($event['type'] ?? ''));
            $reference = (string) ($this->findDeep($event, 'reference_number')
                ?? $this->findDeep($event, 'order_id')
                ?? '');
            $status    = strtolower((string) ($this->findDeep($event, 'status') ?? ''));

            $failed = str_contains($type, 'failed')
                || str_contains($type, 'expired')
                || in_array($status, ['failed', 'expired', 'cancelled', 'canceled'], true);

            $paid = ! $failed && (
                in_array($type, [
                    'checkout_session.payment.paid',
                    'payment.paid',
                    'payment.succeeded',
                ], true)
                || in_array($status, ['succeeded', 'paid'], true)
            );

            if (! str_starts_with($reference, 'order:')) {
                return $this->webhookAck('Event acknowledged');
            }

            $order = Order::find((int) substr($reference, 6));
            if (! $order) {
                Log::warning('PayMongo webhook: order not found', ['reference' => $reference]);
                return $this->webhookAck('Event acknowledged');
            }

            if ($failed) {
                return $this->webhookAck('Payment attempt did not succeed');
            }

            if (! $paid) {
                return $this->webhookAck('Event acknowledged');
            }

            $alreadyPaid = (float) $order->pay_received > 0;

            $payment = $this->markOrderPaid($order, [
                'amount' => (int) round((float) $order->ord_amount * 100),
            ]);

            if (! $alreadyPaid) {
                if ((int) $order->cust_id > 0) {
                    $this->logCustomer((int) $order->cust_id, 'edit',
                        'POST /api/checkout/payment/webhook - order #' . $order->ord_id . ' paid');
                }

                $this->announce(
                    (int) $order->cust_id,
                    '[PRIORITY] Payment confirmed for order #' . $order->ord_id
                        . '. Your order is being processed.'
                );
                $this->alertAdmins('[PRIORITY] Online payment received for order #' . $order->ord_id . '.');

                $booking = $this->bookDeliveryCourier($order);
                if ($booking['booked'] && ! empty($booking['order_id'])) {
                    $this->alertAdmins('LalaMove booked for order #' . $order->ord_id
                        . ' (courier order ' . $booking['order_id'] . ').');
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Payment confirmed',
                'data'    => [
                    'ord_id'     => $order->ord_id,
                    'pay_ref'    => $payment->pay_ref,
                    'pay_given'  => (float) $payment->pay_given,
                    'pay_due'    => (float) $payment->pay_due,
                ],
            ], 200);

        } catch (\Exception $e) {
            Log::error('PayMongo webhook error', ['error' => $e->getMessage()]);
            return $this->webhookAck('Event acknowledged');
        }
    }

    public function paymentStatus(Request $json)
    {
        $validator = (new DatabaseAPI())->paymentStatus($json);
        if ($validator) return $validator;

        $custId = $this->customerId($json);
        if ($custId === null) {
            return response()->json(['success' => false, 'message' => 'Customer authentication is required.'], 403);
        }

        $order = Order::find((int) $json->input('ord_id'));
        if (! $order || (int) $order->cust_id !== (int) $custId) {
            return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
        }

        $state = [
            'ord_id'      => $order->ord_id,
            'paid'        => (float) $order->pay_received > 0,
            'pay_ref'     => $order->pay_reference,
            'ord_status'  => $order->ord_status,
            'gateway'     => 'paymongo',
        ];

        if ($state['paid']) {
            return response()->json([
                'success' => true,
                'message' => 'Payment already confirmed',
                'data'    => $state + ['booked' => null],
            ], 200);
        }

        if (! PayMongoService::isConfigured()) {
            $state['gateway_ready'] = false;

            return response()->json([
                'success' => true,
                'message' => 'Online payment is not configured yet.',
                'data'    => $state,
            ], 200);
        }

        $session  = (new PayMongoService())->retrieveCheckoutSession((string) $order->pay_reference);
        $sessionStatus = strtolower((string) ($session['attributes']['status'] ?? ''));

        $settled = $session !== [] && (
            str_contains($sessionStatus, 'paid')
            || str_contains($sessionStatus, 'succeed')
            || str_contains($sessionStatus, 'complete')
            || (($session['attributes']['payments'] ?? []) !== [])
        );

        if ($settled) {
            $payment = $this->markOrderPaid($order, [
                'amount' => (int) round((float) $order->ord_amount * 100),
            ]);

            $this->announce((int) $order->cust_id,
                '[PRIORITY] Payment confirmed for order #' . $order->ord_id
                    . '. Your order is being processed.');
            $this->alertAdmins('[PRIORITY] Online payment received for order #' . $order->ord_id . '.');

            $booking = $this->bookDeliveryCourier($order);

            $state['paid']   = true;
            $state['pay_ref'] = $payment->pay_ref;
            $state['booked']  = $booking;
        }

        return response()->json([
            'success' => true,
            'message' => $settled ? 'Payment confirmed' : 'Payment is still being completed',
            'data'    => $state,
        ], 200);
    }

    private function webhookAck(string $message)
    {
        return response()->json(['success' => true, 'message' => $message], 200);
    }

    private function findDeep(array $data, string $key)
    {
        if (array_key_exists($key, $data)) {
            return $data[$key];
        }

        foreach ($data as $value) {
            if (is_array($value)) {
                $found = $this->findDeep($value, $key);
                if ($found !== null) {
                    return $found;
                }
            }
        }

        return null;
    }

    public function lalamoveWebhook(Request $json)
    {
        try {
            $event = $json->all();

            $orderId = (string) ($this->findDeep($event, 'orderId') ?? '');
            $message = strtoupper((string) ($this->findDeep($event, 'message') ?? $this->findDeep($event, 'type') ?? ''));
            $status  = strtoupper((string) ($this->findDeep($event, 'status') ?? ''));

            if ($orderId === '') {
                return $this->webhookAck('Event acknowledged');
            }

            $delivery = Delivery::where('deliver_share_link', 'like', '%' . $orderId . '%')->first();
            if (! $delivery) {
                Log::info('LalaMove webhook: no matching delivery', ['order_id' => $orderId]);
                return $this->webhookAck('Event acknowledged');
            }

            $order = $this->resolveDeliveryOrder($delivery);
            if (! $order) {
                return $this->webhookAck('Event acknowledged');
            }

            $state = $status !== '' && in_array($status, [
                'ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP', 'COMPLETED',
                'CANCELED', 'REJECTED', 'EXPIRED',
            ], true) ? $status : ($message === 'DRIVER_ASSIGNED' ? 'ON_GOING' : null);

            if ($state === null) {
                return $this->webhookAck('Event acknowledged');
            }

            $previous = $delivery->courier()['status'];
            if ($previous === $state && $delivery->deliver_last_event !== null) {
                return $this->webhookAck('Duplicate event ignored');
            }

            $delivery->forceFill(['deliver_last_event' => now()])->save();
            $delivery->storeCourier(['status' => $state]);

            $this->applyCourierState($order, $delivery, $state);

            return $this->webhookAck('Event acknowledged');
        } catch (\Throwable $e) {
            Log::error('LalaMove webhook error', ['error' => $e->getMessage()]);
            return $this->webhookAck('Event acknowledged');
        }
    }

    private function applyCourierState(Order $order, Delivery $delivery, string $state): void
    {
        switch ($state) {
            case 'PICKED_UP':
                if ($delivery->deliver_pickedup === null) {
                    $delivery->forceFill(['deliver_pickedup' => now()])->save();
                }
                if ($order->ord_status === 'processing' || $order->ord_status === 'to claim') {
                    $order->update(['ord_status' => 'delivering']);
                }
                if ((int) $order->cust_id > 0) {
                    $this->announce((int) $order->cust_id,
                        'Order #' . $order->ord_id . ' is on its way to you.');
                }
                break;

            case 'COMPLETED':
                if ($delivery->deliver_completed === null) {
                    $delivery->forceFill(['deliver_completed' => now()])->save();
                }
                if ($delivery->deliver_end === null) {
                    $delivery->forceFill(['deliver_end' => now()])->save();
                }
                if ($order->ord_status === 'delivering') {
                    $order->update(['ord_status' => 'to receive']);
                }
                if ((int) $order->cust_id > 0) {
                    $this->announce((int) $order->cust_id,
                        'Order #' . $order->ord_id . ' has arrived. Please scan the parcel code to confirm receipt.');
                }
                break;

            case 'CANCELED':
            case 'REJECTED':
            case 'EXPIRED':
                $delivery->forceFill(['deliver_placed' => null])->save();
                $this->alertAdmins('[PRIORITY] Courier booking for order #' . $order->ord_id
                    . ' was ' . strtolower($state) . '. Book it again from Deliveries.');
                if ((int) $order->cust_id > 0) {
                    $this->announce((int) $order->cust_id,
                        'The courier for order #' . $order->ord_id
                        . ' could not take the delivery. The store is re-arranging it.');
                }
                break;

            default:
                break;
        }
    }

    public function bookLalamoveDelivery(Request $json)
    {
        $validator = (new DatabaseAPI())->bookLalamoveDelivery($json);
        if ($validator) return $validator;

        $employee = $json->user('api');
        if (! $this->isEmployee($employee)) {
            return response()->json(['success' => false, 'message' => 'Employee access is required.'], 403);
        }

        $order = $this->resolveOrderFromIds($json);
        if (! $order) {
            return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
        }

        if (($order->ord_claiming ?? '') !== 'delivery') {
            return response()->json([
                'success' => false,
                'message' => 'Only delivery orders are booked with a courier.',
            ], 422);
        }

        $result = $this->bookDeliveryCourier($order);

        if ($this->isEmployee($employee)) {
            $this->logEmployee((int) $employee->emp_id, 'edit',
                'POST /api/delivery/book - order #' . $order->ord_id . ' - ' . $result['message']);
        }

        $delivery = $this->deliveryForOrder($order);

        return response()->json([
            'success' => $result['booked'],
            'message' => $result['message'],
            'data'    => [
                'ord_id'   => $order->ord_id,
                'booked'   => $result['booked'],
                'order_id' => $result['order_id'] ?? null,
                'delivery' => $delivery ? $this->deliveryPayload($delivery, $order) : null,
            ],
        ], $result['booked'] ? 200 : ($result['code'] ?? 409));
    }

    public function cancelLalamoveDelivery(Request $json)
    {
        $validator = (new DatabaseAPI())->bookLalamoveDelivery($json);
        if ($validator) return $validator;

        $employee = $json->user('api');
        if (! $this->isEmployee($employee)) {
            return response()->json(['success' => false, 'message' => 'Employee access is required.'], 403);
        }

        $order = $this->resolveOrderFromIds($json);
        if (! $order) {
            return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
        }

        $delivery = $this->deliveryForOrder($order);
        if (! $delivery) {
            return response()->json(['success' => false, 'message' => 'Delivery record not found'], 404);
        }

        $courierId = $delivery->courier()['id'];
        if (! $courierId || ! LalamoveService::isConfigured()) {
            return response()->json([
                'success' => false,
                'message' => 'There is no courier booking to cancel.',
            ], 409);
        }

        $result = (new LalamoveService())->cancelOrder($courierId);

        if ($result['cancelled']) {
            $delivery->forceFill(['deliver_placed' => null, 'deliver_last_event' => now()])->save();
            $delivery->storeCourier(['status' => 'CANCELED']);

            $this->logEmployee((int) $employee->emp_id, 'edit',
                'POST /api/delivery/cancel - order #' . $order->ord_id . ' - courier ' . $courierId);
            if ((int) $order->cust_id > 0) {
                $this->announce((int) $order->cust_id,
                    'The courier booking for order #' . $order->ord_id . ' was cancelled.');
            }
        }

        return response()->json([
            'success' => $result['cancelled'],
            'message' => $result['message'],
            'data'    => [
                'ord_id'   => $order->ord_id,
                'booked'   => false,
                'delivery' => $this->deliveryPayload($delivery, $order),
            ],
        ], $result['cancelled'] ? 200 : 409);
    }

    protected function orderIsPaid(Order $order): bool
    {
        if ((float) $order->pay_received > 0) {
            return true;
        }

        try {
            $payment = $order->parcel?->payment
                ?? Payment::where('pay_ref', (string) $order->pay_reference)->first();
        } catch (\Throwable $e) {
            $payment = null;
        }

        return $payment !== null
            && (float) $payment->pay_given >= (float) $payment->pay_due
            && (float) $payment->pay_due > 0;
    }

    protected function customerFullName(?Customer $customer): string
    {
        if (! $customer) {
            return '';
        }

        $composed = trim((string) $customer->cust_givname . ' ' . (string) $customer->cust_surname);

        if ($composed !== '') {
            return $composed;
        }

        return trim((string) ($customer->cust_nickname ?? ''));
    }

    protected function bookDeliveryCourier(Order $order): array
    {
        if (($order->ord_claiming ?? '') !== 'delivery') {
            return ['booked' => false, 'message' => 'Not a delivery order.'];
        }

        $delivery = $this->deliveryForOrder($order);
        if (! $delivery) {
            return ['booked' => false, 'message' => 'No delivery record exists for this order.'];
        }
        if ($delivery->isBooked()) {
            return ['booked' => true, 'message' => 'The courier is already booked.'];
        }
        if ((float) $order->pay_received <= 0) {
            return ['booked' => false, 'message' => 'The order must be paid online before a courier is booked.'];
        }
        if (! LalamoveService::isConfigured()) {
            return [
                'booked' => false,
                'code'   => 503,
                'message' => 'LalaMove is not configured - hand the parcel to the courier manually.',
            ];
        }

        try {
            $customer = Customer::find((int) $order->cust_id);

            $stops = [
                $this->storeStop(),
                [
                    'address' => (string) $delivery->deliver_address,
                    'lat'     => $delivery->deliver_lat,
                    'lng'     => $delivery->deliver_lng,
                ],
            ];

            $service = new LalamoveService();
            $quote   = $service->quote($stops);

            $pickupStop = $quote['stops'][0] ?? [];
            $dropStop   = $quote['stops'][1] ?? [];

            $recipient = trim((string) $delivery->deliver_recipient);
            if ($recipient === '' && $customer) {
                $recipient = trim($customer->cust_givname . ' ' . $customer->cust_surname);
            }

            $placed = $service->placeOrder(
                $quote['quotation_id'],
                [
                    'stopId' => (string) ($pickupStop['stopId'] ?? ''),
                    'name'   => (string) $this->settingValue('store_name', 'Tindahan ni Isko'),
                    'phone'  => $this->e164((string) $this->settingValue('store_phone', '09000000000')),
                ],
                [[
                    'stopId'  => (string) ($dropStop['stopId'] ?? ''),
                    'name'    => $recipient !== '' ? $recipient : 'Customer',
                    'phone'   => $this->e164(
                        (string) $delivery->deliver_phone,
                        $customer ? (string) $customer->cust_callcode : '+63'
                    ),
                    'remarks' => mb_substr((string) $delivery->deliver_notes, 0, 1500),
                ]],
                [
                    'ord_id'     => (string) $order->ord_id,
                    'deliver_id' => (string) $delivery->deliver_id,
                ]
            );

            if ($placed['order_id'] === '') {
                return ['booked' => false, 'code' => 409, 'message' => 'The courier returned no order number.'];
            }

            $delivery->forceFill([
                'deliver_placed'     => now(),
                'deliver_service'    => $quote['service_type'],
                'deliver_fee_actual' => $quote['total'],
                'deliver_env'        => LalamoveService::environment(),
            ])->save();

            $delivery->storeCourier([
                'id'     => $placed['order_id'],
                'url'    => $placed['share_link'],
                'status' => $placed['status'],
            ]);

            return [
                'booked'     => true,
                'message'    => 'Courier booked with LalaMove.',
                'order_id'   => $placed['order_id'],
                'share_link' => $placed['share_link'],
            ];
        } catch (LalamoveUnavailableException $e) {
            Log::warning('LalaMove booking unavailable', ['ord_id' => $order->ord_id, 'error' => $e->getMessage()]);

            return ['booked' => false, 'code' => 503, 'message' => $e->getMessage()];
        } catch (\Throwable $e) {
            Log::error('LalaMove booking failed', ['ord_id' => $order->ord_id, 'error' => $e->getMessage()]);

            return ['booked' => false, 'code' => 409, 'message' => 'The courier booking failed. Please retry.'];
        }
    }

    protected function placeOrder(Request $json, int $custId, string $dispatchType, string $speed, callable $resolveReference): array
    {
        $quote = $this->quoteDispatch($json, $dispatchType, $speed);

        return DB::transaction(function () use ($json, $custId, $dispatchType, $speed, $resolveReference, $quote) {
            $bags = $this->lockBagRows($json, $custId);

            $subtotal = 0.0;
            $preorderLines = [];
            foreach ($bags as $bag) {
                $prodvar = Prodvar::with('product')
                    ->where('prodvar_id', $bag->prodvar_id)
                    ->lockForUpdate()
                    ->first();

                if (! $prodvar || $prodvar->prodvar_deleted || $prodvar->prodvar_disabled || ! $prodvar->product) {
                    throw new InsufficientStockException('A product in your bag is no longer available.');
                }
                if (! $prodvar->product->isBuyable()) {
                    throw new InsufficientStockException(
                        'Product "' . $prodvar->product->prod_name . '" is no longer available.'
                    );
                }

                $name  = $prodvar->product->prod_name . ($prodvar->prodvar_name ? ' (' . $prodvar->prodvar_name . ')' : '');
                $qty   = max(1, (int) $bag->bag_qty);
                $stock = (int) $prodvar->prodvar_stock;

                if (! $prodvar->prodvar_preorder && $stock < $qty) {
                    throw new InsufficientStockException(
                        'Insufficient stock for ' . $name . ' - only ' . $stock . ' unit(s) remain.'
                    );
                }

                if ((bool) $prodvar->prodvar_preorder) {
                    $preorderLines[(int) $bag->prodvar_id] = true;
                }

                $subtotal += round((float) $bag->bag_amount * $qty, 2);
            }

            $subtotal    = round($subtotal, 2);
            $dispatchFee = round((float) ($quote['fee'] ?? 0), 2);
            $totalDue    = round($subtotal + $dispatchFee, 2);

            $order = Order::create([
                'ord_id'      => $this->nextId('orders', 'ord_id'),
                'cust_id'      => $custId,
                'ord_amount'   => $totalDue,
                'ord_status'   => 'processing',
                'ord_claiming' => $dispatchType === 'pickup' ? 'pickup' : 'delivery',
                'ord_created'  => now(),
            ]);

            $reference = $resolveReference($order, $totalDue);
            if ($reference['paid'] && $reference['given'] < $reference['due']) {
                throw new \RuntimeException('Payment amount is below the server-calculated total.');
            }

            $payment = Payment::create([
                'pay_created' => now(),
                'pay_ref'     => $reference['pay_ref'],
                'pay_given'   => $reference['given'],
                'pay_due'     => $reference['due'],
                'pay_change'  => $reference['change'],
            ]);

            $order->update([
                'pay_reference' => $reference['pay_ref'],
                'pay_received'  => $reference['paid'] ? $reference['given'] : 0,
                'pay_change'    => $reference['paid'] ? $reference['change'] : 0,
            ]);

            foreach ($bags as $bag) {
                Item::create([
                    'item_id' => $this->nextId('items', 'item_id'),
                    'ord_id' => $order->ord_id,
                    'bag_id' => $bag->bag_id,
                ]);

                $bag->update(['bag_placed' => DB::raw('true')]);

                if (! isset($preorderLines[(int) $bag->prodvar_id])) {
                    Prodvar::where('prodvar_id', $bag->prodvar_id)
                        ->decrement('prodvar_stock', max(1, (int) $bag->bag_qty));
                }
            }

            $customer = Customer::find($custId);
            $dispatch  = [];

            if ($dispatchType === 'pickup') {
                $appointment = $this->bookingAppointment($json, $custId);
                $pickup      = Pickup::create([
                    'pickup_id'       => $this->nextId('pickup', 'pickup_id'),
                    'appoint_id'     => $appointment->appoint_id,
                    'ord_id'         => $order->ord_id,
                    'pickup_created' => now(),
                ]);

                $dispatch = [
                    'modality'     => 'PICKUP',
                    'pickup_id'    => $pickup->pickup_id,
                    'appoint_id'   => $appointment->appoint_id,
                    'appoint_qr'   => $appointment->appoint_qr,
                    'appoint_start'=> $appointment->appoint_start,
                    'appoint_end'  => $appointment->appoint_end,
                    'appoint_type' => $appointment->appoint_type,
                ];
                $placedNote = 'Please proceed to your pickup appointment on '
                    . ($appointment->appoint_start
                        ? $appointment->appoint_start->format('M j, Y g:i A')
                        : 'your booked slot') . '.';
            } else {
                $address = $this->deliveryAddress($json, $customer);
                $expect  = $this->deliveryExpectation($json, $speed);

                $recipient = trim((string) $json->input(
                    'deliver_recipient',
                    $this->customerFullName($customer)
                ));
                $lat   = $json->input('deliver_lat');
                $lng   = $json->input('deliver_lng');
                $notes = trim((string) $json->input('deliver_notes', ''));

                $delivery = Delivery::create([
                    'deliver_id'          => $this->nextId('delivery', 'deliver_id'),
                    'ord_id'              => $order->ord_id,
                    'cust_id'             => $custId,
                    'deliver_address'     => $address,
                    'deliver_phone'       => (string) ($customer->cust_phone ?? ''),
                    'deliver_qr'          => 'QR-DEL-' . strtoupper(Str::random(10)),
                    'deliver_expect'      => $expect,
                    'deliver_created'     => now(),
                    'deliver_recipient'   => $recipient !== '' ? $recipient : $this->customerFullName($customer),
                    'deliver_notes'       => $notes !== '' ? $notes : null,
                    'deliver_lat'         => is_numeric($lat) ? (float) $lat : null,
                    'deliver_lng'         => is_numeric($lng) ? (float) $lng : null,
                    'deliver_service'     => strtoupper($speed),
                    'deliver_env'         => LalamoveService::isConfigured() ? LalamoveService::environment() : null,
                    'deliver_fee_charged' => $dispatchFee,
                ]);

                $parcel = Parcel::create([
                    'ord_id'         => $order->ord_id,
                    'deliver_id'     => $delivery->deliver_id,
                    'pay_id'         => $payment->pay_id,
                    'parcel_created' => now(),
                ]);

                $dispatch = [
                    'modality'            => 'DELIVERY',
                    'delivery_id'         => $delivery->deliver_id,
                    'parcel_id'           => $parcel->parcel_id,
                    'deliver_qr'          => $delivery->deliver_qr,
                    'deliver_address'     => $delivery->deliver_address,
                    'deliver_phone'       => $delivery->deliver_phone,
                    'deliver_expect'      => $delivery->deliver_expect,
                    'deliver_recipient'   => $delivery->deliver_recipient,
                    'deliver_service'     => $delivery->deliver_service,
                    'dispatch_fee'        => $dispatchFee,
                    'dispatch_fee_source' => (string) ($quote['source'] ?? 'store'),
                    'courier'             => $quote['courier'] ?? null,
                ];
                $placedNote = 'It is expected to arrive by '
                    . ($delivery->deliver_expect
                        ? $delivery->deliver_expect->format('M j, Y')
                        : 'the estimated date') . '.';
            }

            Customer::where('cust_id', $custId)->increment('cust_orders');

            $this->announce((int) $order->cust_id,
                'Your order #' . $order->ord_id . ' has been placed. ' . $placedNote);
            $this->lowStockAlerts($bags);

            return [
                'order'     => $order->fresh(['items.bag.prodvar.product', 'pickup.appointment', 'delivery', 'parcel.delivery']),
                'payment'   => [
                    'pay_id'        => $payment->pay_id,
                    'pay_ref'       => $payment->pay_ref,
                    'pay_reference' => $payment->pay_ref,
                    'pay_given'     => (float) $payment->pay_given,
                    'pay_due'       => (float) $payment->pay_due,
                    'pay_change'    => (float) $payment->pay_change,
                    'ord_amount'    => (float) $order->ord_amount,
                    'pay_created'   => $payment->pay_created,
                ],
                'dispatch'  => $dispatch,
                'bag_ids'   => $bags->pluck('bag_id')->all(),
                'reference' => $reference,
            ];
        });
    }

    protected function resolveBagScope(Request $json, int $custId): array
    {
        $query  = UserAPI::bagQuery($custId);
        $bagIds = $json->input('bag_ids');

        if (is_scalar($bagIds)) {
            $bagIds = [$bagIds];
        }

        if (is_array($bagIds)) {
            $unique = array_values(array_unique(
                array_filter(array_map('intval', $bagIds), fn ($id) => $id > 0)
            ));

            if ($unique === []) {
                return ['error' => ['Your bag is empty.', 409]];
            }

            $bags = $query->whereIn('bag_id', $unique)->orderByDesc('bag_created')->get();

            if ($bags->count() !== count($unique)) {
                return ['error' => ['One or more bag items are no longer available.', 409]];
            }

            return ['bags' => $bags];
        }

        $bags = $query->orderByDesc('bag_created')->get();

        if ($bags->isEmpty()) {
            return ['error' => ['Your bag is empty.', 409]];
        }

        return ['bags' => $bags];
    }

    protected function lockBagRows(Request $json, int $custId)
    {
        $scope = $this->resolveBagScope($json, $custId);
        if (isset($scope['error'])) {
            throw new \RuntimeException($scope['error'][0]);
        }

        $ids  = $scope['bags']->pluck('bag_id')->all();
        $bags = UserAPI::bagQuery($custId)
            ->whereIn('bag_id', $ids)
            ->orderByDesc('bag_created')
            ->lockForUpdate()
            ->get();

        if ($bags->count() !== count($ids)) {
            throw new \RuntimeException('One or more bag items are no longer available.');
        }

        return $bags;
    }

    protected function bagSubtotal($bags): float
    {
        return round((float) $bags->sum(
            fn ($bag) => round((float) $bag->bag_amount * (int) $bag->bag_qty, 2)
        ), 2);
    }

    protected function dispatchFee(string $dispatchType, string $speed): float
    {
        if ($dispatchType === 'pickup') {
            return 0.0;
        }

        return self::dispatchFees[$speed] ?? self::dispatchFees['standard'];
    }

    protected function quoteDispatch(Request $json, string $dispatchType, string $speed): array
    {
        $fallback = [
            'fee'      => $this->dispatchFee($dispatchType, $speed),
            'source'   => $dispatchType === 'pickup' ? 'none' : 'store',
            'currency' => 'PHP',
            'courier'  => null,
        ];

        if ($dispatchType !== 'delivery' || ! LalamoveService::isConfigured()) {
            return $fallback;
        }

        try {
            $quote = $this->lalamoveQuote($json);
        } catch (\Throwable $e) {
            Log::info('LalaMove quote unavailable - using the store fee table', [
                'error' => $e->getMessage(),
            ]);

            return $fallback;
        }

        if ($quote['total'] <= 0) {
            return $fallback;
        }

        return [
            'fee'      => round($quote['total'], 2),
            'source'   => 'lalamove',
            'currency' => $quote['currency'],
            'courier'  => [
                'provider'     => 'lalamove',
                'service_type' => $quote['service_type'],
                'distance_m'   => $quote['distance_m'],
                'quotation_id' => $quote['quotation_id'],
                'expires_at'   => $quote['expires_at'],
                'market'       => LalamoveService::market(),
                'environment'  => LalamoveService::environment(),
            ],
        ];
    }

    protected function lalamoveQuote(Request $json): array
    {
        $customer = Customer::find($this->customerId($json));
        $address  = $this->deliveryAddress($json, $customer);

        $lat = $json->input('deliver_lat');
        $lng = $json->input('deliver_lng');

        $stops = [
            $this->storeStop(),
            [
                'address' => $address,
                'lat'     => is_numeric($lat) ? $lat : null,
                'lng'     => is_numeric($lng) ? $lng : null,
            ],
        ];

        return (new LalamoveService())->quote($stops);
    }

    protected function storeStop(): array
    {
        return [
            'address' => (string) $this->settingValue(
                'store_address',
                'Tindahan ni Isko, Bicol University, Legazpi City, Albay'
            ),
            'lat' => $this->settingValue('store_lat', null),
            'lng' => $this->settingValue('store_lng', null),
        ];
    }

    protected function e164(string $phone, string $callCode = '+63'): string
    {
        $phone = preg_replace('/[^\d+]/', '', trim($phone)) ?? '';

        if ($phone === '') {
            return '';
        }

        if (str_starts_with($phone, '+')) {
            return $phone;
        }

        $callCode = $callCode !== '' && str_starts_with($callCode, '+') ? $callCode : '+63';

        if (str_starts_with($phone, '0')) {
            return $callCode . substr($phone, 1);
        }

        if (str_starts_with($phone, ltrim($callCode, '+'))) {
            return '+' . $phone;
        }

        return $callCode . $phone;
    }

    protected function bookingAppointment(Request $json, int $custId): Visit
    {
        $slotStart = $this->slotStartFrom($json) ?? $this->defaultSlotStart();
        $slotEnd   = $slotStart->copy()->addMinutes($this->slotMinutes());

        if ($slotStart->isPast()) {
            throw new \RuntimeException('Appointment slots must be booked for a future time.');
        }

        $appointId = (int) $json->input('appoint_id', 0);
        $existing  = $appointId > 0 ? Visit::find($appointId) : null;

        if ($appointId > 0) {
            if (! $existing || ! $this->usableAppointment($existing, $custId)) {
                throw new \RuntimeException('A valid order-claiming appointment is required.');
            }
        }

        $ignoreId = $existing ? (int) $existing->appoint_id : null;

        if (! $this->slotHasCapacity($slotStart, $slotEnd, $ignoreId)) {
            throw new \RuntimeException('The selected pickup slot is already full. Please pick another slot.');
        }

        $staffing = $this->slotStaffing($slotStart, $slotEnd);
        if ($staffing !== null) {
            throw new \RuntimeException($staffing);
        }

        if ($existing) {
            $moved = ! $existing->appoint_start->equalTo($slotStart)
                || ! $existing->appoint_end->equalTo($slotEnd);

            $existing->update([
                'appoint_start' => $slotStart,
                'appoint_end'   => $slotEnd,
                'appoint_qr'    => $moved || ! $existing->appoint_qr
                    ? ('APPT-' . strtoupper(Str::random(16)))
                    : $existing->appoint_qr,
            ]);

            return $existing->refresh();
        }

        return Visit::create([
            'appoint_id'    => $this->nextId('appointments', 'appoint_id'),
            'cust_id'         => $custId,
            'emp_id'          => $this->assigneeEmployeeId(),
            'appoint_type'    => 'CLAIM',
            'appoint_status'  => 'upcoming',
            'appoint_qr'      => 'APPT-' . strtoupper(Str::random(16)),
            'appoint_start'   => $slotStart,
            'appoint_end'     => $slotEnd,
            'appoint_created' => now(),
            'appoint_closed'  => null,
        ]);
    }

    protected function usableAppointment(Visit $appointment, int $custId): bool
    {
        return (int) $appointment->cust_id === $custId
            && $appointment->appoint_closed === null
            && $appointment->appoint_status !== 'cancelled'
            && in_array(strtolower((string) $appointment->appoint_type), ['pickup', 'claim'], true)
            && ! Pickup::where('appoint_id', $appointment->appoint_id)->exists();
    }

    protected function slotHasCapacity(Carbon $start, Carbon $end, ?int $ignoreAppointId = null): bool
    {
        $capacity = max(1, (int) $this->settingValue('pickup_slot_capacity', 5));

        $query = Visit::whereRaw("LOWER(appoint_type) IN ('pickup', 'claim')")
            ->whereNull('appoint_closed')
            ->where('appoint_start', '<', $end)
            ->where('appoint_end', '>', $start);

        if ($ignoreAppointId) {
            $query->where('appoint_id', '!=', $ignoreAppointId);
        }

        return $query->count() < $capacity;
    }

    protected function slotStaffing(Carbon $start, Carbon $end): ?string
    {
        $inStore = (new AppointmentsAPI())->rosterHeadcount($start, $end);

        if ($inStore !== null && $inStore < 1) {
            return 'Not enough in-store employees available for this slot. Please pick another slot.';
        }

        return null;
    }

    protected function assigneeEmployeeId(): int
    {
        $staff = Employee::whereNull('emp_deleted')
            ->orderBy('emp_id')
            ->get()
            ->filter(fn (Employee $employee) => $employee->isActive());

        $owner = $staff->first(fn (Employee $employee) => $employee->isAdmin()) ?? $staff->first();

        if (! $owner) {
            throw new \RuntimeException('No staff member is available to host pickup appointments.');
        }

        return (int) $owner->emp_id;
    }

    protected function slotStartFrom(Request $json): ?Carbon
    {
        $raw = $json->input('appoint_start');
        if (empty($raw)) return null;

        try {
            return $this->normalizeSlotStart(Carbon::parse($raw));
        } catch (\Throwable $e) {
            throw new \RuntimeException('A valid appointment slot is required.');
        }
    }

    protected function normalizeSlotStart(Carbon $slot): Carbon
    {
        $slot = $slot->copy()->second(0)->millisecond(0);
        $grid = $this->slotMinutes();

        return $slot->minute((int) floor($slot->minute / $grid) * $grid);
    }

    protected function defaultSlotStart(): Carbon
    {
        return $this->normalizeSlotStart(
            Carbon::parse(now()->addMinutes((int) $this->settingValue('booking_lead_minutes', 30))->format('Y-m-d H:00'))
        );
    }

    protected function slotMinutes(): int
    {
        return min(10, max(1, (int) $this->settingValue('slot_minutes', 10)));
    }

    protected function deliveryExpectation(Request $json, string $speed): Carbon
    {
        $raw = $json->input('deliver_expect');

        if (empty($raw)) {
            return match ($speed) {
                'priority' => now()->addHours(24),
                'saver'    => now()->addDays(5),
                default    => now()->addDays(2),
            };
        }

        try {
            $expect = Carbon::parse($raw);
        } catch (\Throwable $e) {
            throw new \RuntimeException('A valid delivery date is required.');
        }

        if ($expect->lt(now()->startOfDay())) {
            throw new \RuntimeException('The delivery date must be today or later.');
        }

        return $expect;
    }

    protected function deliveryAddress(Request $json, ?Customer $customer): string
    {
        $sent = trim((string) $json->input('deliver_address'));
        if ($sent !== '') {
            return $sent;
        }

        $saved = trim((string) ($customer->cust_address ?? ''));
        if ($saved !== '') {
            return str_replace(' | ', ', ', $saved);
        }

        throw new \RuntimeException('A delivery address is required.');
    }

    protected function markOrderPaid(Order $order, array $attributes): Payment
    {
        $intentId = $attributes['id'] ?? null;
        $amount   = isset($attributes['amount']) ? round((float) $attributes['amount'] / 100, 2) : 0.0;

        return DB::transaction(function () use ($order, $attributes, $intentId, $amount) {
            $payment = null;

            if ($intentId) {
                $payment = Payment::where('pay_ref', $intentId)->first();
            }
            if (! $payment && $order->pay_reference) {
                $payment = Payment::where('pay_ref', $order->pay_reference)->first();
            }

            if ($payment) {
                $payment->update([
                    'pay_ref'   => $intentId ?: $payment->pay_ref,
                    'pay_given' => $amount > 0 ? $amount : (float) $payment->pay_given,
                ]);
            } else {
                $payment = Payment::create([
                    'pay_created' => now(),
                    'pay_ref'     => $intentId ?: ('PM-' . strtoupper(Str::random(16))),
                    'pay_given'   => $amount,
                    'pay_due'     => $amount > 0 ? $amount : (float) $order->ord_amount,
                    'pay_change'  => 0,
                ]);
            }

            $order->update([
                'pay_reference' => $intentId ?: $order->pay_reference,
                'pay_received'  => $amount > 0 ? $amount : (float) $order->pay_received,
                'pay_change'    => round(max(0, $amount - (float) $order->ord_amount), 2),
            ]);

            return $payment;
        });
    }

    protected function lowStockAlerts($bags): void
    {
        $threshold = (int) $this->settingValue('low_stock_threshold', 5);
        $alerts    = [];

        foreach ($bags as $bag) {
            $prodvar = $bag->prodvar;
            if (! $prodvar) continue;

            $stock = (int) Prodvar::where('prodvar_id', $bag->prodvar_id)->value('prodvar_stock');
            if ($stock > $threshold) continue;

            $alerts[] = [
                'name'  => $prodvar->product
                    ? $prodvar->product->prod_name
                    : ('variation #' . $bag->prodvar_id),
                'stock' => $stock,
            ];
        }

        foreach ($alerts as $alert) {
            $this->alertAdmins('[PRIORITY] Low stock: "' . $alert['name'] . '" is now down to '
                . $alert['stock'] . ' unit(s).');
        }
    }

    protected function alertAdmins(string $message): void
    {
        try {
            $this->notifyEmployeesByType(['ADMIN', 'SUPER ADMIN'], $message);
        } catch (\Throwable $e) {
            Log::warning('Checkout admin notification failed', ['error' => $e->getMessage()]);
        }
    }

    protected function announce(int $custId, string $message): void
    {
        if ($custId <= 0) return;

        try {
            $this->notifyCustomer($custId, $message);
        } catch (\Throwable $e) {
            Log::warning('Checkout customer notification failed', ['error' => $e->getMessage()]);
        }
    }

    private ?Customer $walkInCache = null;

    public function addProductToOrder(Request $json)
    {
        $validator = (new DatabaseAPI())->posAddProductToOrder($json);
        if ($validator) return $validator;

        try {
            $walkIn = $this->walkInCustomer();
            $prodKey = $json->input('prod_id');
            $qty = max(1, (int) $json->input('item_qty', 1));
            $ordId = $json->input('ord_id');

            $product = $this->resolveProduct($prodKey);
            if (! $product) {
                return response()->json(['success' => false, 'message' => 'Product not found'], 404);
            }
            if (! $product->isBuyable()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Product "' . $product->prod_name . '" is no longer offered',
                ], 400);
            }

            $prodvar = $this->resolveVariation($product, $json);

            if (! $prodvar) {
                if ($this->retiredVariation($product, $json)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product "' . $product->prod_name . '" is no longer offered',
                    ], 400);
                }

                return response()->json([
                    'success' => false,
                    'message' => 'Product "' . $product->prod_name . '" has no variation matching "'
                        . $this->requestedVariationLabel($json) . '".',
                    'available' => $this->variationChoices($product),
                ], 422);
            }

            if ($prodvar->prodvar_disabled) {
                return response()->json([
                    'success' => false,
                    'message' => 'Product "' . $product->prod_name . '" is no longer offered',
                ], 400);
            }

            $order = null;
            if ($ordId !== null && $ordId !== '' && $ordId !== 0) {
                $resolved = $this->draftOrder($ordId, $walkIn);
                if ($resolved instanceof JsonResponse) {
                    return $resolved;
                }
                $order = $resolved;
            }

            $unit = round((float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0), 2);

            $result = DB::transaction(function () use (&$order, $walkIn, $product, $prodvar, $qty, $unit) {
                $createdOrder = false;

                if (! $order) {
                    $order = Order::create([
                        'cust_id'       => $walkIn->cust_id,
                        'ord_amount'    => 0,
                        'ord_status'    => 'processing',
                        'ord_claiming'  => 'pickup',
                        'pay_received'  => 0,
                        'pay_change'    => 0,
                        'pay_reference' => null,
                        'ord_created'   => now(),
                    ]);
                    $createdOrder = true;
                }

                $lineBagIds = Item::where('ord_id', $order->ord_id)->pluck('bag_id');
                $bag = Bag::with(['prodvar.product'])
                    ->whereIn('bag_id', $lineBagIds)
                    ->where('prodvar_id', $prodvar->prodvar_id)
                    ->whereNull('bag_deleted')
                    ->first();

                $createdItem = false;
                $message = 'Product quantity updated in POS order';

                if ($bag) {
                    $newQty = (int) $bag->bag_qty + $qty;
                    $bag->update([
                        'bag_qty'    => $newQty,
                        'bag_amount' => round($unit * $newQty, 2),
                    ]);
                } else {
                    $bag = Bag::create([
                        'cust_id'     => $walkIn->cust_id,
                        'prodvar_id'  => $prodvar->prodvar_id,
                        'bag_qty'     => $qty,
                        'bag_amount'  => round($unit * $qty, 2),
                        'bag_placed'  => DB::raw('false'),
                        'bag_created' => now(),
                        'bag_deleted' => null,
                    ]);
                    Item::create([
                        'ord_id'       => $order->ord_id,
                        'bag_id'       => $bag->bag_id,
                        'item_created' => now(),
                    ]);
                    $createdItem = true;
                    $message = $createdOrder
                        ? 'New POS order created and product added successfully'
                        : 'Product added to existing POS order successfully';
                }

                $total = $this->orderTotal($order->ord_id);
                Order::where('ord_id', $order->ord_id)->update(['ord_amount' => $total]);
                $this->syncBagCounter((int) $walkIn->cust_id);

                return [
                    'order'   => Order::with(['items.bag.prodvar.product', 'pickup', 'delivery'])
                        ->where('ord_id', $order->ord_id)->first(),
                    'bag'     => Bag::with(['prodvar.product'])->where('bag_id', $bag->bag_id)->first(),
                    'created' => $createdOrder || $createdItem,
                    'message' => $message,
                ];
            });

            $payload = $this->bagItemArray($result['bag']);
            $payload['ord_id'] = $result['order']->ord_id;
            $payload['item_id'] = $result['bag']->bag_id;
            $payload['item_created'] = $result['bag']->bag_created;

            $this->logPos($json, 'create', 'pos/add - "' . $product->prod_name
                . '" (' . ($prodvar->prodvar_name ?: 'main') . ') x' . $qty
                . ' - order #' . $result['order']->ord_id);

            return response()->json([
                'success' => true,
                'message' => $result['message'],
                'data' => [
                    'order'  => $this->orderPayload($result['order']),
                    'item'   => $payload,
                    'ord_id' => $result['order']->ord_id,
                ],
            ], $result['created'] ? 201 : 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to add product to POS order',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function checkoutOrder(Request $json)
    {
        $validator = (new DatabaseAPI())->posCheckoutOrder($json);
        if ($validator) return $validator;

        try {
            $walkIn = $this->walkInCustomer();
            $order = $this->findOrder($json->input('ord_id'));
            if (! $order) {
                return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
            }
            if (! $this->isWalkInOrder($order)) {
                return response()->json(['success' => false, 'message' => 'Order is not a POS order.'], 409);
            }

            $order->load(['items.bag.prodvar.product', 'pickup', 'delivery']);

            if (in_array($order->ord_status, ['claimed', 'received'], true)) {
                return response()->json([
                    'success' => true,
                    'message' => 'POS order was already checked out.',
                    'data'    => $this->checkoutResponse(
                        $order,
                        $this->paymentPayload($order, (float) $order->pay_received, (float) $order->pay_change),
                        $walkIn
                    ),
                ], 200);
            }

            if ($order->ord_status !== 'processing' || $order->items->isEmpty()) {
                return response()->json(['success' => false, 'message' => 'POS order cannot be checked out.'], 409);
            }

            $payGiven = (float) $json->input('pay_given');
            $discount = max(0.0, round((float) ($json->input('ord_discount') ?: 0), 2));
            $totalDue = round((float) $order->items->sum(fn ($item) => $item->bag ? (float) $item->bag->bag_amount : 0), 2);

            if ($discount > $totalDue) {
                return response()->json([
                    'success' => false,
                    'message' => 'Discount cannot exceed the amount due.',
                ], 400);
            }
            $totalDue = round($totalDue - $discount, 2);

            if ($payGiven < $totalDue) {
                return response()->json([
                    'success' => false,
                    'message' => 'Insufficient payment. Total due is ' . number_format($totalDue, 2)
                        . ', but ' . number_format($payGiven, 2) . ' was given.',
                ], 400);
            }

            $payMethod = strtolower(trim((string) $json->input('pay_method')));
            if (! in_array($payMethod, ['cash', 'digital'], true)) {
                $payMethod = 'cash';
            }

            $payRef = $json->input('pay_ref')
                ?: ('POS-' . strtoupper($payMethod) . '-' . strtoupper(Str::random(8)));

            $result = DB::transaction(function () use ($json, $order, $walkIn, $payGiven, $payRef, $payMethod, $discount) {
                $locked = Order::with(['items.bag.prodvar.product'])
                    ->where('ord_id', $order->ord_id)
                    ->lockForUpdate()
                    ->first();

                if (! $locked || $locked->ord_status !== 'processing' || $locked->items->isEmpty()) {
                    throw new \RuntimeException('POS order cannot be checked out.');
                }

                $lines = [];
                $subtotal = 0.0;
                foreach ($locked->items as $item) {
                    $bag = $item->bag;
                    if (! $bag || ! $bag->prodvar_id) continue;

                    $prodvar = Prodvar::where('prodvar_id', $bag->prodvar_id)->lockForUpdate()->first();
                    if (! $prodvar) {
                        throw new \RuntimeException('A product in the walk-in order is no longer available.');
                    }

                    $name = $prodvar->product
                        ? $prodvar->product->prod_name
                        : ('variation #' . $prodvar->prodvar_id);

                    if ((int) $prodvar->prodvar_stock < (int) $bag->bag_qty) {
                        throw new InsufficientStockException('Insufficient stock for ' . $name);
                    }

                    $lines[] = ['bag' => $bag, 'prodvar' => $prodvar, 'name' => $name];
                    $subtotal += (float) $bag->bag_amount;
                }

                $subtotal = round($subtotal, 2);
                if ($lines === []) {
                    throw new \RuntimeException('POS order cannot be checked out.');
                }
                if ($discount > $subtotal) {
                    throw new \RuntimeException('Discount cannot exceed the amount due.');
                }
                $payDue = round($subtotal - $discount, 2);
                if ($payGiven < $payDue) {
                    throw new \RuntimeException('Payment amount is below the server-calculated total.');
                }
                $payChange = round($payGiven - $payDue, 2);

                $threshold = (int) $this->settingValue('low_stock_threshold', 5);
                $lowStock = [];
                foreach ($lines as $line) {
                    $prodvar = $line['prodvar'];
                    $prodvar->prodvar_stock = (int) $prodvar->prodvar_stock - (int) $line['bag']->bag_qty;
                    $prodvar->save();

                    $line['bag']->update(['bag_placed' => DB::raw('true')]);

                    if ((int) $prodvar->prodvar_stock <= $threshold) {
                        $lowStock[] = ['name' => $line['name'], 'qty' => (int) $prodvar->prodvar_stock];
                    }
                }

                $locked->update([
                    'ord_status'    => 'claimed',
                    'ord_amount'    => $payDue,
                    'ord_discount'  => $discount,
                    'pay_reference' => $payRef,
                    'pay_received'  => $payGiven,
                    'pay_change'    => $payChange,
                ]);

                foreach ($lines as $line) {
                    $this->bumpProdsales($line['bag'], $locked, 'place', true);
                }

                $this->syncBagCounter((int) $walkIn->cust_id);

                foreach ($lowStock as $low) {
                    $this->notifyEmployeesByType(
                        ['ADMIN', 'SUPER ADMIN'],
                        '[PRIORITY] Low stock: "' . $low['name'] . '" is now down to ' . $low['qty'] . ' unit(s).'
                    );
                }

                $employee = $json->user('api');
                if ($this->isEmployee($employee)) {
                    $this->logEmployee(
                        (int) $employee->emp_id,
                        'edit',
                        'pos/checkout walk-in order #' . $locked->ord_id
                            . ' - ' . $payRef
                    );
                }

                return [
                    'order' => Order::with(['items.bag.prodvar.product', 'pickup', 'delivery'])
                        ->where('ord_id', $locked->ord_id)->first(),
                    'payment' => [
                        'pay_ref'       => $payRef,
                        'pay_reference' => $payRef,
                        'pay_method'    => $payMethod,
                        'pay_given'     => $payGiven,
                        'pay_due'       => $payDue,
                        'pay_change'    => $payChange,
                        'ord_amount'    => $payDue,
                        'ord_discount'  => $discount,
                    ],
                ];
            });

            return response()->json([
                'success' => true,
                'message' => 'POS order checked out successfully',
                'data'    => $this->checkoutResponse($result['order'], $result['payment'], $walkIn),
            ], 201);

        } catch (InsufficientStockException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 409);

        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 409);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to checkout POS order',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function posUpdateOrderDetails(Request $json)
    {
        $validator = (new DatabaseAPI())->posUpdateOrderDetails($json);
        if ($validator) return $validator;

        try {
            $order = $this->findOrder($json->input('ord_id'));
            if (! $order) {
                return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
            }
            if (! $this->isWalkInOrder($order)) {
                return response()->json(['success' => false, 'message' => 'Order is not a POS order.'], 409);
            }

            if (! $json->has('ord_status')) {
                return response()->json(['success' => false, 'message' => 'No updatable fields provided'], 400);
            }

            $status = $this->normalizeStatus((string) $json->input('ord_status'));
            if ($status === null) {
                return response()->json(['success' => false, 'message' => 'Unsupported order status.'], 422);
            }

            $priorStatus = (string) $order->ord_status;
            $allowed = [
                'processing' => ['claimed', 'received', 'cancelled'],
                'claimed'    => ['received', 'cancelled'],
                'received'   => ['cancelled'],
                'cancelled'  => [],
                'unclaimed'  => ['cancelled', 'claimed'],
            ];

            if ($status === $priorStatus) {
                return response()->json([
                    'success' => true,
                    'message' => 'POS order details updated successfully',
                    'data'    => $this->orderPayload($order->fresh(['items.bag.prodvar.product', 'pickup', 'delivery'])),
                ], 200);
            }

            if (! in_array($status, $allowed[$priorStatus] ?? [], true)) {
                return response()->json(['success' => false, 'message' => 'Invalid order status transition.'], 409);
            }

            $employee = $json->user('api');
            if (! $this->isEmployee($employee) || ! $this->isAdmin($employee)) {
                return response()->json(['success' => false, 'message' => 'Administrator access is required.'], 403);
            }

            $order->load(['items.bag.prodvar.product']);

            DB::transaction(function () use ($order, $status, $priorStatus) {
                $order->update(['ord_status' => $status]);

                if (in_array($status, ['claimed', 'received'], true) && $priorStatus === 'processing') {
                    $this->completeWalkInOrder($order);
                }

                if ($status === 'cancelled' && in_array($priorStatus, ['claimed', 'received'], true)) {
                    foreach ($order->items as $item) {
                        $bag = $item->bag;
                        if ($bag && $bag->prodvar_id) {
                            Prodvar::where('prodvar_id', $bag->prodvar_id)
                                ->increment('prodvar_stock', (int) $bag->bag_qty);
                        }
                        if ($bag) {
                            $this->bumpProdsales($bag, $order, 'cancel', true);
                        }
                    }
                }
            });

            $this->logEmployee(
                (int) $employee->emp_id,
                'edit',
                'pos/update ' . $status . ' - walk-in order #' . $order->ord_id
            );

            if ((int) $order->cust_id > 0 && $status === 'cancelled') {
                $this->notifyCustomer((int) $order->cust_id, 'Walk-in order #' . $order->ord_id . ' was cancelled.');
            }

            return response()->json([
                'success' => true,
                'message' => 'POS order details updated successfully',
                'data'    => $this->orderPayload($order->fresh(['items.bag.prodvar.product', 'pickup', 'delivery'])),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update POS order details',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    public function removeProductFromOrder(Request $json)
    {
        $validator = (new DatabaseAPI())->removeProductFromOrder($json);
        if ($validator) return $validator;

        try {
            $walkIn = $this->walkInCustomer();
            $order = $this->findOrder($json->input('ord_id'));
            if (! $order) {
                return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
            }
            if (! $this->isWalkInOrder($order) || $order->ord_status !== 'processing') {
                return response()->json(['success' => false, 'message' => 'This POS order is no longer editable.'], 409);
            }

            $prodKey = $json->input('prod_id');
            $lineBagIds = Item::where('ord_id', $order->ord_id)->pluck('bag_id');
            if ($lineBagIds->isEmpty()) {
                return response()->json(['success' => false, 'message' => 'Product not found in this POS order'], 404);
            }

            $product = $this->resolveProduct($prodKey);
            $prodvarIds = $product
                ? Prodvar::where('prod_id', $product->prod_id)->pluck('prodvar_id')->all()
                : [];

            $askedProdvar = $json->input('prodvar_id');

            $bag = Bag::with(['prodvar.product'])
                ->whereIn('bag_id', $lineBagIds)
                ->whereNull('bag_deleted')
                ->when(filled($askedProdvar) && is_numeric($askedProdvar), function ($query) use ($askedProdvar) {
                    $query->where('prodvar_id', (int) $askedProdvar);
                }, function ($query) use ($prodKey, $prodvarIds) {
                    $query->where(function ($query) use ($prodKey, $prodvarIds) {
                        $query->whereIn('prodvar_id', $prodvarIds);
                        if (is_numeric($prodKey)) {
                            $query->orWhere('prodvar_id', (int) $prodKey);
                        }
                    });
                })
                ->first();

            if (! $bag) {
                return response()->json(['success' => false, 'message' => 'Product not found in this POS order'], 404);
            }

            Item::where('bag_id', $bag->bag_id)->delete();
            $bag->update(['bag_deleted' => now(), 'bag_placed' => DB::raw('false')]);

            Order::where('ord_id', $order->ord_id)
                ->update(['ord_amount' => $this->orderTotal($order->ord_id)]);
            $this->syncBagCounter((int) $walkIn->cust_id);

            $bag->loadMissing('prodvar.product');
            $this->logPos($json, 'delete', 'pos/remove - "'
                . ($bag->prodvar->product->prod_name ?? 'product') . '" ('
                . ($this->variationLabel($bag->prodvar) ?: 'main') . ')'
                . ' - order #' . $order->ord_id);

            return response()->json([
                'success' => true,
                'message' => 'Product removed from POS order successfully',
                'data'    => [
                    'ord_id'  => $order->ord_id,
                    'bag_id'  => $bag->bag_id,
                    'prod_id' => $prodKey,
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to remove product from POS order',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    private function walkInCustomer(): Customer
    {
        if ($this->walkInCache instanceof Customer) {
            return $this->walkInCache;
        }

        $walkIn = Customer::firstOrCreate(
            ['cust_phone' => self::walkInPhone],
            [
                'cust_givname'             => 'Walk-in',
                'cust_surname'             => '',
                'cust_email'               => null,
                'cust_password'            => Hash::make(Str::random(32)),
                'cust_callcode'            => '+63',
                'cust_pronoun'             => 'they/them',
                'cust_type'                => 'guest',
                'cust_categ'               => null,
                'cust_college'             => null,
                'cust_dept'                => null,
                'cust_address'             => null,
                'cust_bday'                => null,
                'cust_avatar'              => null,
                'cust_backup_phone'        => null,
                'cust_backup_email'        => null,
                'cust_backup_ques'         => null,
                'cust_backup_answer'       => null,
                'cust_backup_code'         => '/',
                'cust_darkmode'            => DB::raw('false'),
                'cust_notif_appointremind' => 10,
                'cust_notif_email'         => DB::raw('false'),
                'cust_notif_prod'          => DB::raw('false'),
                'cust_appoint'             => 0,
                'cust_orders'              => 0,
                'cust_bag'                 => 0,
                'cust_wishlist'            => 0,
                'cust_unread'              => 0,
                'cust_created'             => now(),
            ]
        );

        if ($walkIn->wasRecentlyCreated) {
            $walkIn->refresh();
        }

        return $this->walkInCache = $walkIn;
    }

    private function findOrder($ordId): ?Order
    {
        if ($ordId === null || $ordId === '' || ! is_numeric($ordId) || (int) $ordId <= 0) {
            return null;
        }

        return Order::find((int) $ordId);
    }

    private function isWalkInOrder(Order $order): bool
    {
        if ((int) $order->cust_id !== (int) $this->walkInCustomer()->cust_id) {
            return false;
        }

        return ! $order->pickup()->exists() && ! $order->delivery()->exists();
    }

    private function draftOrder($ordId, Customer $walkIn)
    {
        $order = $this->findOrder($ordId);
        if (! $order) {
            return response()->json(['success' => false, 'message' => 'POS order not found'], 404);
        }

        if ((int) $order->cust_id !== (int) $walkIn->cust_id
            || $order->ord_status !== 'processing'
            || $order->pickup()->exists()
            || $order->delivery()->exists()) {
            return response()->json(['success' => false, 'message' => 'This POS order is no longer editable.'], 409);
        }

        return $order;
    }

    private function defaultVariation(Product $product): ?Prodvar
    {
        return Prodvar::where('prod_id', $product->prod_id)
            ->whereNull('prodvar_deleted')
            ->whereNull('prodvar_disabled')
            ->orderByDesc('prodvar_main')
            ->orderBy('prodvar_id')
            ->first();
    }

    private function retiredVariation(Product $product, Request $json): ?Prodvar
    {
        $rows = Prodvar::where('prod_id', $product->prod_id)
            ->whereNull('prodvar_deleted')
            ->get();

        $prodvarId = $json->input('prodvar_id');
        if (filled($prodvarId) && is_numeric($prodvarId)) {
            return $rows->first(fn (Prodvar $v) => (int) $v->prodvar_id === (int) $prodvarId
                && $v->prodvar_disabled !== null);
        }

        $label = trim((string) ($json->input('variant') ?? $json->input('prodvar_name') ?? ''));

        return $rows->first(function (Prodvar $variation) use ($label) {
            if ($variation->prodvar_disabled === null || $label === '') {
                return false;
            }

            return strcasecmp((string) $variation->prodvar_name, $label) === 0
                || strcasecmp($this->variationLabel($variation), $label) === 0;
        });
    }

    private function requestedVariationLabel(Request $json): string
    {
        $options = $json->input('variant_options') ?? $json->input('prodvar_options');
        if (is_array($options) && $options !== []) {
            $normalised = ProductsAPI::normalizeOptions($options);

            return $normalised === null ? 'the requested variation'
                : ProductsAPI::optionLabel($normalised, 'the requested variation');
        }

        return trim((string) ($json->input('variant') ?? $json->input('prodvar_name') ?? ''))
            ?: 'the requested variation';
    }

    private function variationChoices(Product $product): array
    {
        return Prodvar::where('prod_id', $product->prod_id)
            ->whereNull('prodvar_deleted')
            ->whereNull('prodvar_disabled')
            ->orderBy('prodvar_id')
            ->get()
            ->map(function (Prodvar $variation) use ($product) {
                $options = ProductsAPI::decodeOptions($variation->prodvar_options);

                return [
                    'prodvar_id'   => (int) $variation->prodvar_id,
                    'label'        => ProductsAPI::optionLabel(
                        $options,
                        (string) $variation->prodvar_name
                    ),
                    'prodvar_name' => (string) $variation->prodvar_name,
                    'options'      => $options,
                    'stock'        => (int) $variation->prodvar_stock,
                    'unit_price'   => round(
                        (float) $product->prod_price + (float) ($variation->prodvar_markup ?? 0),
                        2
                    ),
                ];
            })
            ->values()
            ->all();
    }

    private function resolveVariation(Product $product, Request $json): ?Prodvar
    {
        $live = fn () => Prodvar::where('prod_id', $product->prod_id)
            ->whereNull('prodvar_deleted')
            ->whereNull('prodvar_disabled');

        $prodvarId = $json->input('prodvar_id');
        if (filled($prodvarId) && is_numeric($prodvarId)) {
            $found = $live()->where('prodvar_id', (int) $prodvarId)->first();
            if ($found) {
                return $found;
            }

            return null;
        }

        $options = $json->input('variant_options') ?? $json->input('prodvar_options');
        if (is_array($options) && $options !== []) {
            $normalised = ProductsAPI::normalizeOptions($options);
            if ($normalised !== null) {
                $wanted = ProductsAPI::optionSignature($normalised);

                return $live()->get()->first(function (Prodvar $variation) use ($wanted) {
                    return ProductsAPI::optionSignature(
                        ProductsAPI::decodeOptions($variation->prodvar_options),
                        (string) $variation->prodvar_name
                    ) === $wanted;
                });
            }

            return null;
        }

        $label = trim((string) ($json->input('variant')
            ?? $json->input('prodvar_name')
            ?? ''));
        if ($label === '') {
            return $this->defaultVariation($product);
        }

        $parts = array_values(array_filter(array_map('trim', preg_split('~[,/|]~', $label))));
        if ($parts === []) {
            return $this->defaultVariation($product);
        }

        $rows = $live()->get();

        foreach ($rows as $variation) {
            if (strcasecmp((string) $variation->prodvar_name, $label) === 0) {
                return $variation;
            }
        }

        foreach ($rows as $variation) {
            $options = array_map(
                'strtolower',
                array_values(ProductsAPI::decodeOptions($variation->prodvar_options))
            );
            $names = [strtolower((string) $variation->prodvar_name)];

            if (count($parts) > count($options) + count($names)) {
                continue;
            }

            $matched = 0;
            foreach ($parts as $part) {
                $needle = strtolower($part);
                if (in_array($needle, $options, true) || in_array($needle, $names, true)) {
                    $matched++;
                }
            }

            if ($matched === count($parts)) {
                return $variation;
            }
        }

        if (count($parts) === 1) {
            foreach ($rows as $variation) {
                if (strcasecmp((string) $variation->prodvar_name, $parts[0]) === 0) {
                    return $variation;
                }
            }
        }

        return null;
    }

    private function logPos(Request $json, string $access, string $what): void
    {
        $employee = $json->user('api');
        if ($this->isEmployee($employee)) {
            $this->logEmployee((int) $employee->emp_id, $access, $what);
        }
    }

    private function orderTotal(int $ordId): float
    {
        $bagIds = Item::where('ord_id', $ordId)->pluck('bag_id');
        if ($bagIds->isEmpty()) {
            return 0.0;
        }

        return round((float) Bag::whereIn('bag_id', $bagIds)->whereNull('bag_deleted')->sum('bag_amount'), 2);
    }

    private function completeWalkInOrder(Order $order): void
    {
        $order->loadMissing('items.bag.prodvar.product');

        foreach ($order->items as $item) {
            $bag = $item->bag;
            if (! $bag || ! $bag->prodvar_id) continue;

            Prodvar::where('prodvar_id', $bag->prodvar_id)
                ->where('prodvar_stock', '>=', (int) $bag->bag_qty)
                ->decrement('prodvar_stock', (int) $bag->bag_qty);

            $bag->update(['bag_placed' => DB::raw('true')]);
            $this->bumpProdsales($bag, $order, 'place', true);
        }

        if (! $order->pay_reference) {
            $order->update(['pay_reference' => 'POS-PAY-' . strtoupper(Str::random(8))]);
        }
    }

    private function checkoutResponse(Order $order, array $payment, Customer $walkIn): array
    {
        return [
            'payment'   => $payment,
            'order'     => $this->orderPayload($order),
            'pickup_id' => null,
            'walk_in'   => $this->walkInPayload($walkIn),
            'ord_id'    => $order->ord_id,
        ];
    }

    private function walkInPayload(Customer $customer): array
    {
        return [
            'cust_id'       => $customer->cust_id,
            'cust_givname'  => $customer->cust_givname,
            'cust_surname'  => $customer->cust_surname,
            'cust_nickname' => $customer->cust_givname,
            'cust_phone'    => $customer->cust_phone,
            'cust_type'     => $customer->cust_type,
        ];
    }

    private function paymentPayload(Order $order, float $given, float $change): array
    {
        return [
            'pay_ref'       => $order->pay_reference,
            'pay_reference' => $order->pay_reference,
            'pay_method'    => \App\Http\Controllers\OrdersAPI::payMethodFromReference($order->pay_reference),
            'pay_given'     => $given,
            'pay_due'       => (float) $order->ord_amount,
            'pay_change'    => $change,
            'ord_amount'    => (float) $order->ord_amount,
            'ord_discount'  => (float) ($order->ord_discount ?? 0),
        ];
    }

    private function syncBagCounter(int $custId): void
    {
        $count = Bag::where('cust_id', $custId)
            ->whereNull('bag_deleted')
            ->whereRaw('bag_placed = false')
            ->count();

        Customer::where('cust_id', $custId)->update(['cust_bag' => $count]);
    }

    private function posNormalizeStatus(?string $raw): ?string
    {
        if ($raw === null) return null;

        $trimmed = trim($raw);
        $key = strtoupper($trimmed);

        $map = [
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
                $row->prodsales_id = $this->nextId('prodsales', 'prodsales_id');
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
        }
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
            'prodvar_options' => $prodvar ? $prodvar->prodvar_options : null,
            'prodvar_label'   => $this->variationLabel($prodvar),
            'product'      => $this->productPayload($product, $prodvar),
        ];
    }

    private function variationLabel($prodvar): ?string
    {
        if (! $prodvar) {
            return null;
        }

        return ProductsAPI::optionLabel(
            ProductsAPI::decodeOptions($prodvar->prodvar_options),
            (string) $prodvar->prodvar_name
        );
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
        $payload['option_axes'] = ProductsAPI::optionAxes($variants);
        $payload['variants'] = $variants->map(function (Prodvar $variation) use ($product) {
            $options = ProductsAPI::decodeOptions($variation->prodvar_options);

            return [
                'prodvar_id'   => (int) $variation->prodvar_id,
                'prodvar_name' => (string) $variation->prodvar_name,
                'label'        => ProductsAPI::optionLabel(
                    $options,
                    (string) $variation->prodvar_name
                ),
                'options'      => $options,
                'prodvar_pic'  => $variation->prodvar_pic,
                'prodvar_stock'=> (int) $variation->prodvar_stock,
                'prodvar_main' => (bool) $variation->prodvar_main,
                'prodvar_markup' => (float) ($variation->prodvar_markup ?? 0),
                'unit_price'   => round(
                    (float) $product->prod_price + (float) ($variation->prodvar_markup ?? 0),
                    2
                ),
                'available'    => $variation->prodvar_disabled === null,
                'preorder'     => (bool) $variation->prodvar_preorder,
            ];
        })->values()->all();

        if ($prodvar) {
            $payload['prodvar_id'] = $prodvar->prodvar_id;
            $payload['prodvar_name'] = $prodvar->prodvar_name;
            $payload['prodvar_pic'] = $prodvar->prodvar_pic;
            $payload['prodvar_markup'] = $prodvar->prodvar_markup;
            $payload['prodvar_stock'] = (int) $prodvar->prodvar_stock;
            $payload['prodvar_preorder'] = (bool) $prodvar->prodvar_preorder;
            $payload['prodvar_options'] = $prodvar->prodvar_options;
            $payload['prodvar_label'] = $this->variationLabel($prodvar);
            $payload['unit_price'] = round(
                (float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0),
                2
            );
        }

        return $payload;
    }

    private function posOrderPayload(Order $order): array
    {
        $order->loadMissing(['items.bag.prodvar.product', 'pickup', 'delivery']);

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

        return $payload;
    }

    public function createFulfillmentTrack(Request $json)
    {
        $validator = (new DatabaseAPI())->createFulfillmentTrack($json);
        if ($validator) return $validator;

        try {
            $this->sweepExpiredPickups();

            $order = $this->findOrder($json->input('ord_id'));
            if (! $order) {
                return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
            }

            $customerId = $this->customerId($json);
            if ($customerId !== null && (int) $order->cust_id !== $customerId) {
                return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
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
                    'parcel'      => null,
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

    public function updateFulfillmentStatus(Request $json)
    {
        $validator = (new DatabaseAPI())->updateFulfillmentStatus($json);
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

            $order = $this->resolveDeliveryOrder($delivery, $employee);
            if (! $order) {
                return response()->json(['success' => false, 'message' => 'Order not found.'], 404);
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

            if (in_array($status, ['to claim', 'delivering'], true)) {
                foreach ($this->stockShortages($order) as $name) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Insufficient stock for ' . $name,
                    ], 409);
                }
            }

            $deliverExpect = $json->input('deliver_expect');
            if ($status === 'delivering' && $deliverExpect !== null) {
                try {
                    $expect = \Carbon\Carbon::parse($deliverExpect);
                    if ($expect->isPast()) {
                        $expect = null;
                    }
                } catch (\Throwable $e) {
                    $expect = null;
                }
            } else {
                $expect = null;
            }

            DB::transaction(function () use ($order, $delivery, $status, $priorStatus, $expect) {
                $order->update(['ord_status' => $status]);

                if ($status === 'delivering') {
                    if ($delivery->deliver_pickedup === null) {
                        $delivery->update(['deliver_pickedup' => now()]);
                    }
                    if ($expect !== null) {
                        $delivery->update(['deliver_expect' => $expect]);
                    }
                }

                if (in_array($status, ['claimed', 'received'], true)) {
                    $delivery->update(['deliver_timestamp' => $delivery->deliver_end ?? now()]);
                    $this->fulfilOrder($order, $employee);
                }

                if ($status === 'cancelled') {
                    if ($delivery->deliver_end === null) {
                        $delivery->update(['deliver_timestamp' => now()]);
                    }
                    if (in_array($priorStatus, ['claimed', 'received'], true)) {
                        $this->restockOrder($order, $employee);
                    }
                    foreach ($this->orderBags($order) as $bag) {
                        $this->bumpProdsales($bag, $order, 'cancel', $order->isWalkIn());
                    }
                }            });

            $this->logEmployee(
                (int) $employee->emp_id,
                'edit',
                'tracking/update ' . $status . ' - order #' . $order->ord_id
            );

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

    public function closeFulfillmentTrack(Request $json)
    {
        $validator = (new DatabaseAPI())->closeFulfillmentTrack($json);
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

    public function scanCode(Request $json)
    {
        $validator = (new DatabaseAPI())->scanCode($json);
        if ($validator) return $validator;

        try {
            $code = trim((string) $json->input('code'));
            $scannedBy = trim((string) $json->input('scanned_by', ''));
            $user = $json->user('api');
            $isEmployee = $this->isEmployee($user);
            $byLabel = $scannedBy !== '' ? ' by ' . $scannedBy : '';

            $this->sweepExpiredPickups();

            $order = null;
            $delivery = null;
            $appointment = null;
            $viaDeliveryQr = false;

            $candidateDelivery = Delivery::where('deliver_qr', $code)->first();
            if ($candidateDelivery) {
                $viaDeliveryQr = true;
                $delivery = $candidateDelivery;
                $order = $this->resolveDeliveryOrder($candidateDelivery, $user);
            }

            if (! $order) {
                $candidateAppointment = Visit::where('appoint_qr', $code)->first();
                if ($candidateAppointment) {
                    $appointment = $candidateAppointment;
                    $candidatePickup = Pickup::where('appoint_id', $candidateAppointment->appoint_id)->first();
                    $order = $candidatePickup ? Order::find($candidatePickup->ord_id) : null;

                    if (! $candidatePickup && ! $order) {
                        return $this->completeVisit($json, $candidateAppointment, $byLabel, $isEmployee);
                    }
                }
            }

            if (! $order && $code !== '') {
                $order = Order::where('pay_reference', $code)->first();
            }

            if (! $order && preg_match('/^CNI-ORDER-(\d+)\./', $code, $matched)) {
                $candidate = Order::find((int) $matched[1]);
                if ($candidate && hash_equals($this->orderQr($candidate), $code)) {
                    $order = $candidate;
                }
            }

            if (! $order) {
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

            if ($delivery || ($viaDeliveryQr && ! $order->pickup)) {
                return $this->completeDelivery($json, $order, $delivery, $byLabel, $isEmployee);
            }

            return $this->completePickup($json, $order, $appointment, $byLabel, $isEmployee);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to scan QR code',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    private function completeDelivery(Request $json, Order $order, ?Delivery $delivery, string $byLabel, bool $isEmployee)
    {
        $user = $json->user('api');
        $ownsOrder = $user instanceof Customer && (int) $order->cust_id === (int) $user->cust_id;

        if (! $ownsOrder) {
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

        DB::transaction(function () use ($order, $delivery, $user) {
            $delivery->update(['deliver_timestamp' => $delivery->deliver_end ?? now()]);
            $order->update(['ord_status' => 'received']);
            $this->fulfilOrder($order, $user);
        });

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

    private function completePickup(Request $json, Order $order, ?Visit $appointment, string $byLabel, bool $isEmployee)
    {
        $user = $json->user('api');
        $pickup = $order->pickup;

        if (! $pickup) {
            return response()->json([
                'success' => false,
                'message' => $order->isWalkIn()
                    ? 'Walk-in orders are completed at the register and cannot be scanned.'
                    : 'This order has no pickup appointment.',
            ], 409);
        }

        $ownsOrder = $user instanceof Customer && (int) $order->cust_id === (int) $user->cust_id;

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

        $late = $appointment->appoint_end !== null && $appointment->appoint_end->isPast();

        DB::transaction(function () use ($order, $appointment, $late, $user, $isEmployee) {
            $appointment->update([
                'appoint_status' => $late ? 'absent' : 'done',
                'appoint_closed' => now(),
                'appoint_qr'     => null,
            ]);

            $order->update(['ord_status' => 'claimed']);
            $this->fulfilOrder($order, $isEmployee ? $user : null);
        });

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
        $pickup->setRelation('appointment', $appointment);

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

    private function completeVisit(Request $json, Visit $appointment, string $byLabel, bool $isEmployee)
    {
        $user = $json->user('api');
        $ownsAppointment = $user instanceof Customer && (int) $appointment->cust_id === (int) $user->cust_id;

        if (! $ownsAppointment && ! $isEmployee) {
            $this->notifyAllEmployees('[PRIORITY] Failed QR scan' . $byLabel
                . ': appointment #' . $appointment->appoint_id . ' was scanned by a non-owner.');
            $this->logScanAttempt($user, (string) $json->input('code'), false, 'appointment code without owner match');

            return response()->json([
                'success' => false,
                'message' => 'Only store employees or the booking customer can check in with this code',
            ], 403);
        }

        $final = (string) $appointment->appoint_status;
        if ($appointment->appoint_closed !== null || in_array($final, ['done', 'absent', 'cancelled'], true)) {
            $this->logScanAttempt($user, (string) $json->input('code'), false, 'appointment already ' . $final);

            return response()->json([
                'success' => false,
                'message' => 'Appointment has already been ' . ($final !== '' ? $final : 'closed'),
            ], 409);
        }

        $late = $appointment->appoint_end !== null && $appointment->appoint_end->isPast();
        $status = $late ? 'absent' : 'done';

        DB::transaction(function () use ($appointment, $status) {
            $appointment->update([
                'appoint_status' => $status,
                'appoint_closed' => now(),
                'appoint_qr'     => null,
            ]);
        });

        $this->logScanAttempt($user, (string) $json->input('code'), true,
            'appointment #' . $appointment->appoint_id . ' ' . $status);

        if ($isEmployee) {
            $this->logEmployee((int) $user->emp_id, 'edit',
                'tracking/scan appointment #' . $appointment->appoint_id . ' - ' . $status
                . ($late ? ' (late)' : ''));
        } elseif ((int) $appointment->cust_id > 0) {
            $this->logCustomer((int) $appointment->cust_id, 'edit',
                'tracking/scan appointment #' . $appointment->appoint_id . ' - ' . $status);
        }

        try {
            $this->notifyCustomer((int) $appointment->cust_id, $status === 'done'
                ? '[PRIORITY] Your visit appointment #' . $appointment->appoint_id . ' was checked in. Thank you for coming!'
                : '[PRIORITY] Your visit appointment #' . $appointment->appoint_id
                    . ' was checked in after the slot ended and has been marked as a no-show.');
        } catch (\Throwable $e) {
        }

        $appointment->refresh();

        return response()->json([
            'success' => true,
            'message' => $status === 'done'
                ? 'Appointment checked in successfully'
                : 'Appointment checked in late and marked as absent',
            'data' => [
                'track_type'  => 'APPOINTMENT',
                'appointment' => $this->appointmentPayload($appointment),
                'appoint_id'  => $appointment->appoint_id,
                'appoint_status' => $appointment->appoint_status,
                'status'      => $appointment->appoint_status,
            ],
        ], 200);
    }

    public function sweepExpiredPickups(): void
    {
        $appointments = Visit::whereRaw('LOWER(appoint_type) IN (?, ?)', ['pickup', 'claim'])
            ->where('appoint_status', 'upcoming')
            ->whereNotNull('appoint_qr')
            ->where('appoint_end', '<', now()->subMinutes(10))
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

            try {
                if (! empty($appointment->emp_id)) {
                    $this->logEmployee((int) $appointment->emp_id, 'auto-close',
                        'Pickup window expired - order #' . $order->ord_id . ' marked unclaimed');
                }
            } catch (\Throwable $e) {
            }

            if ((int) $order->cust_id > 0) {
                $this->notifyCustomer(
                    (int) $order->cust_id,
                    '[PRIORITY] Order #' . $order->ord_id
                        . ' was not claimed within its pickup window. Please contact the store.'
                );
            }
        }
    }

    public function sweepUpcomingDeliveries(): void
    {
        $deliveries = Delivery::whereNotNull('deliver_expect')
            ->where('deliver_expect', '<=', now()->addDay())
            ->where('deliver_expect', '>=', now()->subDay())
            ->get();

        foreach ($deliveries as $delivery) {
            $order = $this->resolveDeliveryOrder($delivery);
            if (! $order || $order->ord_status !== 'delivering') continue;
            if (! $this->orderIsPaid($order)) continue;

            $order->update(['ord_status' => 'to receive']);

            if ((int) $order->cust_id > 0) {
                $this->notifyCustomer(
                    (int) $order->cust_id,
                    'Order #' . $order->ord_id . ' is arriving soon. Please prepare to receive it.'
                );
            }
        }
    }

    private function resolveOrderFromIds(Request $json): ?Order
    {
        $ordId = (int) $json->input('ord_id', 0);

        if ($ordId <= 0) {
            $deliverId = (int) $json->input('deliver_id', 0);

            if ($deliverId > 0) {
                $delivery = Delivery::find($deliverId);
                if ($delivery) {
                    $order = $this->resolveDeliveryOrder($delivery);
                    if ($order) {
                        return $order;
                    }
                }
            }

            return null;
        }

        return Order::find($ordId);
    }

    private function deliveryForOrder(Order $order): ?Delivery
    {
        $delivery = Delivery::where('ord_id', $order->ord_id)->first();
        if ($delivery) {
            return $delivery;
        }

        try {
            $parcel = Parcel::where('ord_id', $order->ord_id)->first();
        } catch (\Throwable $e) {
            return null;
        }

        return $parcel ? Delivery::find($parcel->deliver_id) : null;
    }

    private function resolveDeliveryOrder(Delivery $delivery, $user = null): ?Order
    {
        if (is_numeric($delivery->ord_id) && (int) $delivery->ord_id > 0) {
            return Order::find((int) $delivery->ord_id);
        }

        try {
            $parcel = Parcel::where('deliver_id', $delivery->deliver_id)->first();
        } catch (\Throwable $e) {
            $parcel = null;
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

        $active = (clone $candidates)
            ->whereIn('ord_status', ['delivering', 'to receive', 'to claim'])
            ->first();

        return $active ?? $candidates->first();
    }

    private function fulfilOrder(Order $order, $employee = null): void
    {
        $order->loadMissing('items.bag.prodvar.product');
        $walkIn = $order->isWalkIn();
        $threshold = (int) $this->settingValue('low_stock_threshold', 5);
        $lowStock = [];
        $deducted = [];

        foreach ($order->items as $item) {
            $bag = $item->bag;
            if (! $bag || ! $bag->prodvar_id) continue;

            $prodvar = $bag->prodvar;

            if ($prodvar && (int) $prodvar->prodvar_preorder === 1) {
                $take    = min((int) $prodvar->prodvar_stock, (int) $bag->bag_qty);
                $newStock = (int) $prodvar->prodvar_stock - $take;
                Prodvar::where('prodvar_id', $bag->prodvar_id)
                    ->update(['prodvar_stock' => $newStock]);
                $prodvar->prodvar_stock = $newStock;

                if ($take > 0) {
                    $deducted[] = ($prodvar->product ? $prodvar->product->prod_name : 'variation #' . $prodvar->prodvar_id)
                        . ' (#' . $prodvar->prodvar_id . ') -' . $take;
                }
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

        if ($deducted !== [] && $this->isEmployee($employee)) {
            $this->logEmployee(
                (int) $employee->emp_id,
                'edit',
                'stock claim - order #' . $order->ord_id . ' - ' . implode(', ', $deducted)
            );
        }
    }

    private function restockOrder(Order $order, $employee = null): void
    {
        $restocked = [];
        foreach ($this->orderBags($order) as $bag) {
            Prodvar::where('prodvar_id', $bag->prodvar_id)
                ->increment('prodvar_stock', (int) $bag->bag_qty);
            $restocked[] = ($bag->prodvar?->product?->prod_name ?? 'variation #' . $bag->prodvar_id)
                . ' (#' . $bag->prodvar_id . ') +' . (int) $bag->bag_qty;
        }

        if ($restocked !== [] && $this->isEmployee($employee)) {
            $this->logEmployee(
                (int) $employee->emp_id,
                'edit',
                'stock restock - order #' . $order->ord_id . ' - ' . implode(', ', $restocked)
            );
        }
    }

    private function orderBags(Order $order): array
    {
        $order->loadMissing('items.bag');
        $bagIds = $order->items->pluck('bag_id')->filter()->unique()->values()->all();
        if ($bagIds === []) {
            return [];
        }

        return Bag::whereIn('bag_id', $bagIds)->whereNull('bag_deleted')->get()->all();
    }

    public function stockShortages(Order $order): array
    {
        $order->loadMissing('items.bag.prodvar.product');

        $openStatuses = ['processing', 'to cancel', 'to claim', 'unclaimed', 'delivering', 'to receive'];

        $short = [];
        foreach ($order->items as $item) {
            $bag = $item->bag;
            if (! $bag || ! $bag->prodvar) continue;
            if ((int) $bag->prodvar->prodvar_preorder !== 1) continue;

            $stock  = (int) $bag->prodvar->prodvar_stock;
            $needed = (int) $bag->bag_qty;

            $reserved = (int) DB::table('items')
                ->join('orders', 'orders.ord_id', '=', 'items.ord_id')
                ->join('bag', 'bag.bag_id', '=', 'items.bag_id')
                ->where('bag.prodvar_id', $bag->prodvar_id)
                ->whereNull('bag.bag_deleted')
                ->where('items.ord_id', '!=', $order->ord_id)
                ->whereIn('orders.ord_status', $openStatuses)
                ->sum('bag.bag_qty');

            if (max(0, $stock - $reserved) < $needed) {
                $short[] = $bag->prodvar->product
                    ? $bag->prodvar->product->prod_name
                    : ('variation #' . $bag->prodvar_id);
            }
        }

        return $short;
    }

    private function trackingBumpProdsales(Bag $bag, Order $order, string $mode, bool $walkIn): void
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
                $row->prodsales_id = $this->nextId('prodsales', 'prodsales_id');
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
        }
    }

    public function transitions(): array
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

    public function trackingNormalizeStatus(?string $raw): ?string
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

    private function trackingFindOrder($ordId): ?Order
    {
        if ($ordId === null || $ordId === '' || ! is_numeric($ordId) || (int) $ordId <= 0) {
            return null;
        }

        return Order::find((int) $ordId);
    }

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

    private function orderQr(Order $order): string
    {
        $payload = 'CNI-ORDER-' . $order->ord_id;
        $signature = hash_hmac('sha256', $payload, (string) config('app.key'));

        return $payload . '.' . $signature;
    }

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
        $payload['delivery_ref'] = $delivery->deliver_qr;
        $payload['deliver_date'] = $delivery->deliver_expect;
        $payload['deliver_deleted'] = $delivery->deliver_end;
        $payload['deliver_status'] = $this->legacyDeliverStatus(
            $order ? (string) $order->ord_status : 'processing'
        );
        $payload['ord_status'] = $order ? $order->ord_status : null;
        $payload['status'] = $order ? $order->ord_status : null;

        $courier = $delivery->courier();
        $payload['deliver_share_link'] = $courier['url'];
        $payload['courier'] = [
            'provider'  => $delivery->deliver_env ? 'lalamove' : null,
            'order_id'  => $courier['id'],
            'share_url' => $courier['url'],
            'status'    => $courier['status'],
            'booked'    => $delivery->isBooked(),
            'environment'=> $delivery->deliver_env,
        ];
        $payload['deliver_fee_charged'] = $delivery->deliver_fee_charged !== null
            ? (float) $delivery->deliver_fee_charged : null;
        $payload['deliver_fee_actual'] = $delivery->deliver_fee_actual !== null
            ? (float) $delivery->deliver_fee_actual : null;
        $payload['deliver_env'] = $delivery->deliver_env;
        $payload['lalamove_configured'] = LalamoveService::isConfigured();

        return $payload;
    }

    private function appointmentPayload(?Visit $appointment): ?array
    {
        if (! $appointment) {
            return null;
        }

        $payload = $appointment->toArray();
        $payload['appoint_date'] = $appointment->appoint_start;
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
            : null;
        $payload['appointment'] = $this->appointmentPayload($pickup->appointment);
        $payload['ord_status'] = $order ? $order->ord_status : null;
        $payload['status'] = $order ? $order->ord_status : null;

        return $payload;
    }

    private function trackingPaymentPayload(Order $order): array
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

    private function trackingOrderPayload(Order $order): array
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

    private function trackingBagItemArray(Bag $bag): array
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
            'prodvar_options' => $prodvar ? $prodvar->prodvar_options : null,
            'prodvar_label'   => $this->variationLabel($prodvar),
            'product'      => $this->productPayload($product, $prodvar),
        ];
    }

    private function trackingProductPayload($product, $prodvar = null): ?array
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
