<?php

namespace App\Http\Controllers;

use App\Exceptions\InsufficientStockException;
use App\Models\Appointment;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Employee;
use App\Models\Item;
use App\Models\Order;
use App\Models\Parcel;
use App\Models\Payment;
use App\Models\Pickup;
use App\Models\Product;
use App\Models\Schedule;
use App\Services\PayMongoService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * DOMAIN 26 (ORDER CHECKOUT).
 *
 * Live database schema (no bag/prodvar/prodsales tables):
 *   - Cart lines: orders with ord_tag CART-* and ord_status CART
 *   - Items: items table (item_id, ord_id, prod_id, item_qty, item_amount)
 *   - Payment: payment table (pay_id, pay_created, pay_ref, pay_given, pay_due, pay_change)
 *   - Pickup: pickup table (pickup_id, ord_id, appoint_id, pay_id, pickup_created, pickup_completed)
 *   - Delivery: delivery table (deliver_id, deliver_created, delivery_ref, deliver_date,
 *               deliver_address, deliver_status, deliver_qr, deliver_deleted)
 *   - Parcel: parcel table (parcel_id, ord_id, deliver_id, pay_id, parcel_created, parcel_completed)
 *
 * Checkout flow:
 *   1. POST /checkout/dispatch → fee/ETA preview (no DB writes)
 *   2. POST /checkout/payment  → atomic: promote CART-* orders to ORD-*,
 *      create items on the new order, create payment row, create pickup or
 *      delivery+parcel rows, decrement stock, notify.
 *
 * The frontend sends ord_ids (the CART-* order ids) as `ord_id` (single)
 * or `bag_ids` (array). CheckoutAPI uses these to load the cart lines.
 */
class CheckoutAPI extends Controller
{
    // ==========================================
    // DISPATCH DETAILS (preview only, no DB writes)
    // ==========================================

    /*
        Determining dispatch details
        ----------
        JSON REQUEST

        ord_id         - integer (req: a CART-* order id, or an already created order)
        bag_ids        - array (opt: explicit selection of CART-* order ids)
        dispatch_type  - string (req: pickup | delivery)
        speed          - string (opt: priority | standard | saver, default: standard)
        deliver_address- string (opt)
        appoint_id     - integer (opt)
        appoint_start  - string/datetime (opt)
    */
    public function determineDispatchDetails(Request $json)
    {
        $validator = (new InputValidatorAPI())->determineDispatchDetails($json);
        if ($validator) return $validator;

        try {
            $dispatchType = strtolower($json->input('dispatch_type'));
            $speed = strtolower($json->input('speed', 'standard'));

            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $scope = $this->resolveCheckoutScope($json, $custId);
            if (isset($scope['error'])) {
                return response()->json(['success' => false, 'message' => $scope['error'][0]], $scope['error'][1]);
            }
            if (isset($scope['order'])) {
                return response()->json(['success' => false, 'message' => 'Order has already been checked out.'], 409);
            }

            $cartOrders = $scope['cartOrders'];
            $subtotal   = $this->cartSubtotal($cartOrders);

            $feeMap = ['priority' => 100.00, 'standard' => 50.00, 'saver' => 30.00];
            $dispatchFee = $dispatchType === 'pickup' ? 0.00 : ($feeMap[$speed] ?? 50.00);
            $totalDue    = round($subtotal + $dispatchFee, 2);

            $dispatchDetails = [];

            if ($dispatchType === 'pickup') {
                $appointId  = (int) $json->input('appoint_id', 0);
                $slotStart  = $this->slotStartFrom($json);

                if ($appointId > 0) {
                    $appointment = Appointment::find($appointId);
                    $usable = $appointment
                        && (int) $appointment->cust_id === $custId
                        && $appointment->appoint_closed === null
                        && in_array(strtolower((string) $appointment->appoint_type), ['pickup', 'claim'], true)
                        && ! Pickup::where('appoint_id', $appointment->appoint_id)->exists();

                    if (! $usable) {
                        return response()->json([
                            'success' => false,
                            'message' => 'A valid order-claiming appointment is required.',
                        ], 422);
                    }
                    $slotStart = $slotStart ?? $this->defaultSlotStart();
                }

                $slotStart = $slotStart ?? $this->defaultSlotStart();

                $dispatchDetails = [
                    'type'             => 'PICKUP',
                    'appoint_id'       => $appointId ?: null,
                    'appointment_date' => $slotStart,
                    'appoint_start'    => $slotStart,
                    'appoint_end'      => $slotStart
                        ? $slotStart->copy()->addMinutes((int) $this->settingValue('slot_minutes', 10))
                        : null,
                    'location' => 'Tindahan ni Isko Physical Store',
                ];
            } else {
                $deliverAddress = $json->input('deliver_address');
                if (! $deliverAddress) {
                    $customer = Customer::find($custId);
                    // Build address from separate fields (live schema has no cust_address column)
                    $deliverAddress = $customer
                        ? implode(', ', array_filter([
                            $customer->cust_brgy,
                            $customer->cust_city,
                            $customer->cust_province,
                            $customer->cust_country,
                        ]))
                        : null;
                }
                if (empty($deliverAddress)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'A delivery address is required.',
                    ], 422);
                }

                $estDate = $this->deliveryExpect($speed);

                $dispatchDetails = [
                    'type'               => 'DELIVERY',
                    'speed'              => strtoupper($speed),
                    'deliver_address'    => $deliverAddress,
                    'estimated_delivery' => $estDate->toDateTimeString(),
                    'deliver_expect'     => $estDate,
                ];
            }

            $ordIds = $cartOrders->pluck('ord_id')->all();

            return response()->json([
                'success' => true,
                'message' => 'Dispatch details determined successfully',
                'data'    => [
                    'ord_id'           => $ordIds[0] ?? null,
                    'bag_ids'          => $ordIds,
                    'subtotal'         => $subtotal,
                    'dispatch_fee'     => $dispatchFee,
                    'total_due'        => $totalDue,
                    'total'            => $totalDue,
                    'dispatch_details' => $dispatchDetails,
                    'items'            => $cartOrders->flatMap(fn ($o) => $o->items)->map(fn ($item) => [
                        'item_id'     => $item->item_id,
                        'ord_id'      => $item->ord_id,
                        'prod_id'     => $item->prod_id,
                        'item_qty'    => (int) $item->item_qty,
                        'item_amount' => (float) $item->item_amount,
                        'product'     => $item->product ? $item->product->toArray() : null,
                    ])->values()->all(),
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

    // ==========================================
    // INTEGRATE PAYMENT (place the order)
    // ==========================================

    /*
        Integrating payment = placing the order (DOMAIN 26)
        ----------
        JSON REQUEST

        ord_id          - integer (req: a CART-* order id)
        bag_ids         - array (opt: explicit CART-* order ids)
        pay_given       - numeric (req)
        dispatch_type   - string (req: pickup | delivery)
        speed           - string (opt: priority | standard | saver)
        deliver_address - string (opt)
        appoint_id      - integer (opt)
        appoint_start   - string/datetime (opt)
    */
    public function integratePayment(Request $json)
    {
        $validator = (new InputValidatorAPI())->integratePayment($json);
        if ($validator) return $validator;

        try {
            $dispatchType = strtolower($json->input('dispatch_type'));
            $speed        = strtolower($json->input('speed', 'standard'));
            $payGiven     = (float) $json->input('pay_given');

            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $scope = $this->resolveCheckoutScope($json, $custId);
            if (isset($scope['error'])) {
                return response()->json(['success' => false, 'message' => $scope['error'][0]], $scope['error'][1]);
            }

            // Idempotent: order already checked out
            if (isset($scope['order'])) {
                $existing  = $scope['order'];
                $pickup    = Pickup::where('ord_id', $existing->ord_id)->first();
                $parcel    = Parcel::where('ord_id', $existing->ord_id)->first();
                $alreadyDone = $pickup || $parcel;

                return response()->json([
                    'success' => true,
                    'message' => $alreadyDone
                        ? 'Order checkout was already completed.'
                        : 'Order has already been checked out.',
                    'data'    => ['ord_id' => $existing->ord_id],
                ], $alreadyDone ? 200 : 409);
            }

            $cartOrders = $scope['cartOrders'];
            $ordIds     = $cartOrders->pluck('ord_id')->all();

            $feeMap      = ['priority' => 100.0, 'standard' => 50.0, 'saver' => 30.0];
            $dispatchFee = $dispatchType === 'pickup' ? 0.0 : ($feeMap[$speed] ?? 50.0);
            $subtotal    = $this->cartSubtotal($cartOrders);
            $totalDue    = round($subtotal + $dispatchFee, 2);

            if ($payGiven < $totalDue) {
                return response()->json([
                    'success' => false,
                    'message' => 'Insufficient payment given. Total due is ' . number_format($totalDue, 2)
                        . ', but only ' . number_format($payGiven, 2) . ' was provided.',
                ], 400);
            }

            $payRef    = 'PAY-' . strtoupper(Str::random(16));
            $payChange = round($payGiven - $totalDue, 2);

            // REQ-CHECKOUT-02: everything in one transaction
            $result = DB::transaction(function () use (
                $json, $custId, $dispatchType, $speed, $payGiven, $payRef,
                $payChange, $ordIds, $dispatchFee, $totalDue, $subtotal
            ) {
                // Lock the cart orders for the duration
                $cartOrders = Order::with(['items.product'])
                    ->whereIn('ord_id', $ordIds)
                    ->where('cust_id', $custId)
                    ->where('ord_status', 'CART')
                    ->whereRaw("ord_tag LIKE 'CART-%'")
                    ->lockForUpdate()
                    ->get();

                if ($cartOrders->count() !== count($ordIds)) {
                    throw new \RuntimeException('One or more cart items are no longer available.');
                }

                // Validate products are still buyable
                foreach ($cartOrders as $cartOrder) {
                    foreach ($cartOrder->items as $item) {
                        $product = $item->product;
                        if (! $product || ! $product->isBuyable()) {
                            throw new InsufficientStockException(
                                'Product "' . ($product?->prod_name ?? $item->prod_id) . '" is no longer available.'
                            );
                        }
                        $qty = (int) $item->item_qty;
                        if (! $product->prod_preorder && (int) $product->prod_qty < $qty) {
                            throw new InsufficientStockException(
                                '"' . $product->prod_name . '" only has ' . $product->prod_qty . ' unit(s) in stock.'
                            );
                        }
                    }
                }

                $recalc = 0.0;
                foreach ($cartOrders as $co) {
                    foreach ($co->items as $item) {
                        $recalc += (float) $item->item_amount;
                    }
                }
                $recalc = round($recalc, 2);

                // 1. ONE new ORD-* order absorbs all cart lines
                $newOrdTag = 'ORD-' . strtoupper(Str::random(12));
                $order = Order::create([
                    'cust_id'     => $custId,
                    'ord_created' => now(),
                    'ord_tag'     => $newOrdTag,
                    'ord_status'  => $dispatchType === 'pickup' ? 'TO CLAIM' : 'TO RECEIVE',
                ]);

                // 2. Migrate items from each CART-* order to the new ORD-* order
                foreach ($cartOrders as $cartOrder) {
                    foreach ($cartOrder->items as $item) {
                        Item::create([
                            'ord_id'      => $order->ord_id,
                            'prod_id'     => $item->prod_id,
                            'item_qty'    => $item->item_qty,
                            'item_amount' => $item->item_amount,
                        ]);

                        // Decrement product stock
                        Product::where('prod_id', $item->prod_id)
                            ->decrement('prod_qty', $item->item_qty);
                    }
                    // Delete old cart items and the CART-* order
                    Item::where('ord_id', $cartOrder->ord_id)->delete();
                    $cartOrder->delete();
                }

                // 3. Payment row
                $payment = Payment::create([
                    'pay_created' => now(),
                    'pay_ref'     => $payRef,
                    'pay_given'   => $payGiven,
                    'pay_due'     => $totalDue,
                    'pay_change'  => $payChange,
                ]);

                $dispatchResult = [];

                // 4a. Pickup
                if ($dispatchType === 'pickup') {
                    $appointment = $this->bookingAppointment($json, $custId);
                    $pickup = Pickup::create([
                        'ord_id'         => $order->ord_id,
                        'appoint_id'     => $appointment->appoint_id,
                        'pay_id'         => $payment->pay_id,
                        'pickup_created' => now(),
                    ]);

                    $dispatchResult = [
                        'modality'    => 'PICKUP',
                        'pickup_id'   => $pickup->pickup_id,
                        'appoint_id'  => $appointment->appoint_id,
                        'appoint_qr'  => $appointment->appoint_qr,
                        'appoint_date'=> $appointment->appoint_date,
                    ];
                } else {
                    // 4b. Delivery + Parcel
                    $customer = Customer::find($custId);
                    $deliverAddress = $json->input('deliver_address')
                        ?: ($customer
                            ? implode(', ', array_filter([
                                $customer->cust_brgy,
                                $customer->cust_city,
                                $customer->cust_province,
                                $customer->cust_country,
                            ]))
                            : null);

                    if (empty($deliverAddress)) {
                        throw new \RuntimeException('A delivery address is required.');
                    }

                    $deliverRef = 'DEL-' . strtoupper(Str::random(8));
                    $delivery = Delivery::create([
                        'deliver_created' => now(),
                        'delivery_ref'    => $deliverRef,
                        'deliver_date'    => $this->deliveryExpect($speed),
                        'deliver_address' => $deliverAddress,
                        'deliver_status'  => 'PENDING',
                        'deliver_qr'      => 'QR-DEL-' . strtoupper(Str::random(10)),
                    ]);

                    $parcel = Parcel::create([
                        'ord_id'         => $order->ord_id,
                        'deliver_id'     => $delivery->deliver_id,
                        'pay_id'         => $payment->pay_id,
                        'parcel_created' => now(),
                    ]);

                    $dispatchResult = [
                        'modality'       => 'DELIVERY',
                        'delivery_id'    => $delivery->deliver_id,
                        'delivery_ref'   => $deliverRef,
                        'deliver_qr'     => $delivery->deliver_qr,
                        'deliver_address'=> $delivery->deliver_address,
                        'deliver_date'   => $delivery->deliver_date,
                    ];
                }

                // 5. Update customer counters
                Customer::where('cust_id', $custId)->increment('cust_orders');
                // Reset cart counter (all CART-* orders for this customer are now gone)
                $cartCount = Order::where('cust_id', $custId)
                    ->where('ord_status', 'CART')
                    ->whereRaw("ord_tag LIKE 'CART-%'")
                    ->count();
                Customer::where('cust_id', $custId)->update(['cust_cart' => $cartCount]);

                return [
                    'order'    => $order,
                    'dispatch' => $dispatchResult,
                    'payment'  => [
                        'pay_id'        => $payment->pay_id,
                        'pay_ref'       => $payRef,
                        'pay_reference' => $payRef,
                        'pay_given'     => $payGiven,
                        'pay_due'       => $totalDue,
                        'pay_change'    => $payChange,
                        'ord_amount'    => $recalc,
                        'pay_created'   => now(),
                    ],
                    'ord_ids' => $ordIds,
                ];
            });

            // 6. Low-stock alerts for admins (REQ-IM-03)
            $freshOrder = $result['order']->fresh(['items.product']);
            $lowThreshold = (int) $this->settingValue('low_stock_threshold', 5);
            foreach ($freshOrder->items as $item) {
                $prod = $item->product;
                if ($prod && (int) $prod->prod_qty <= $lowThreshold) {
                    $this->notifyEmployeesByType(
                        ['ADMIN', 'SUPER ADMIN'],
                        '[PRIORITY] Low stock: "' . $prod->prod_name . '" is now down to ' . $prod->prod_qty . ' unit(s).'
                    );
                }
            }

            // 7. Customer notification (non-silent status)
            $this->notifyCustomer(
                $custId,
                'Your order #' . $result['order']->ord_tag . ' has been placed and payment received. '
                . ($result['dispatch']['modality'] === 'PICKUP'
                    ? 'Please proceed to your pickup appointment.'
                    : 'Your order is on its way!')
            );

            return response()->json([
                'success' => true,
                'message' => 'Payment integrated and order checkout completed successfully',
                'data'    => [
                    'payment'  => $result['payment'],
                    'dispatch' => $result['dispatch'],
                    'order'    => $this->orderPayload($result['order']->fresh()),
                    'ord_id'   => $result['order']->ord_id,
                    'bag_ids'  => $result['ord_ids'],
                ],
            ], 201);

        } catch (InsufficientStockException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 409);
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 409);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to integrate payment',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // ==========================================
    // PAYMONGO PAYMENT INTENT
    // ==========================================

    /*
        Create PayMongo Payment Intent
        ----------
        JSON REQUEST

        ord_id   - integer (req)
        gateway  - string (req: paymongo)
    */
    public function createPaymentIntent(Request $json)
    {
        $validator = (new InputValidatorAPI())->createPaymentIntent($json);
        if ($validator) return $validator;

        try {
            $gateway = strtolower($json->input('gateway'));

            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            $scope = $this->resolveCheckoutScope($json, $custId);
            if (isset($scope['error'])) {
                return response()->json(['success' => false, 'message' => $scope['error'][0]], $scope['error'][1]);
            }
            if (isset($scope['order'])) {
                return response()->json(['success' => false, 'message' => 'Order has already been checked out.'], 409);
            }

            $cartOrders  = $scope['cartOrders'];
            $dispatchType= strtolower($json->input('dispatch_type', 'pickup'));
            $speed       = strtolower($json->input('speed', 'standard'));
            $subtotal    = $this->cartSubtotal($cartOrders);
            $dispatchFee = $dispatchType === 'delivery'
                ? (['priority' => 100.00, 'standard' => 50.00, 'saver' => 30.00][$speed] ?? 50.00)
                : 0.00;
            $totalDue    = round($subtotal + $dispatchFee, 2);

            if ($gateway === 'paymongo') {
                $metadataId = 'cart:' . implode(',', $cartOrders->pluck('ord_id')->all());
                $paymongo   = new PayMongoService();
                $result     = $paymongo->createPaymentIntent(
                    $totalDue,
                    $metadataId,
                    'Order payment (' . $cartOrders->count() . ' cart line(s))'
                );

                return response()->json([
                    'success' => true,
                    'message' => 'Payment intent created successfully',
                    'data'    => [
                        'checkout_url'      => $result['checkout_url'],
                        'payment_intent_id' => $result['payment_intent_id'],
                        'client_key'        => $result['client_key'],
                        'total_due'         => $totalDue,
                        'bag_ids'           => $cartOrders->pluck('ord_id')->all(),
                    ],
                ], 200);
            }

            return response()->json(['success' => false, 'message' => 'Unsupported payment gateway'], 400);

        } catch (\Exception $e) {
            Log::error('PayMongo createPaymentIntent error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to create payment intent',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    // ==========================================
    // PAYMONGO WEBHOOK
    // ==========================================

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

            $event         = json_decode($payload, true);
            $paymentIntent = $event['data']['attributes']['data']['attributes'] ?? [];
            $metadata      = $paymentIntent['metadata'] ?? [];
            $orderId       = $metadata['order_id'] ?? null;
            $paymentStatus = $paymentIntent['status'] ?? '';

            if (! $orderId || $paymentStatus !== 'succeeded') {
                return response()->json(['success' => true, 'message' => 'Event acknowledged'], 200);
            }

            // Cart-keyed intents (no order yet) — nothing to stamp
            if (str_starts_with((string) $orderId, 'cart:')) {
                return response()->json(['success' => true, 'message' => 'Event acknowledged'], 200);
            }

            $order = Order::where('ord_id', $orderId)->first();
            if (! $order) {
                Log::warning('PayMongo webhook: order not found', ['order_id' => $orderId]);
                return response()->json(['success' => true, 'message' => 'Event acknowledged'], 200);
            }

            $paymentIntentId = $paymentIntent['id'] ?? null;
            $amount = isset($paymentIntent['amount']) ? (float) $paymentIntent['amount'] / 100 : 0;

            // Update or create the payment row linked to this order's pickup
            $pickup = Pickup::where('ord_id', $order->ord_id)->first();
            if ($pickup) {
                if ($pickup->pay_id) {
                    Payment::where('pay_id', $pickup->pay_id)->update([
                        'pay_ref'   => $paymentIntentId ?? $pickup->payment?->pay_ref,
                        'pay_given' => $amount,
                    ]);
                } else {
                    $payment = Payment::create([
                        'pay_created' => now(),
                        'pay_ref'     => $paymentIntentId ?? ('PM-' . strtoupper(Str::random(16))),
                        'pay_given'   => $amount,
                        'pay_due'     => $amount,
                        'pay_change'  => 0,
                    ]);
                    $pickup->update(['pay_id' => $payment->pay_id]);
                }
            }

            $order->update(['ord_status' => 'TO CLAIM']);

            $this->notifyCustomer(
                (int) $order->cust_id,
                '[PRIORITY] Payment confirmed for order #' . $order->ord_tag . '. Your order is being processed.'
            );
            $this->notifyEmployeesByType(
                ['ADMIN', 'SUPER ADMIN'],
                '[PRIORITY] Online payment received for order #' . $order->ord_tag . '.'
            );

            return response()->json(['success' => true, 'message' => 'Payment confirmed'], 200);

        } catch (\Exception $e) {
            Log::error('PayMongo webhook error', ['error' => $e->getMessage()]);
            return response()->json(['success' => true, 'message' => 'Event acknowledged'], 200);
        }
    }

    // ==========================================
    // CHECKOUT HELPERS
    // ==========================================

    /**
     * Resolve the set of CART-* orders (or an already-placed order) the
     * request wants to check out.
     *
     * Returns:
     *   ['cartOrders' => Collection]  – cart lines ready to check out
     *   ['order'      => Order]       – already placed order (idempotent)
     *   ['error'      => [msg, code]] – validation error
     */
    protected function resolveCheckoutScope(Request $json, int $custId): array
    {
        $bagIds = $json->input('bag_ids');
        if (is_array($bagIds) && count($bagIds)) {
            $unique = array_values(array_unique(array_map('intval', $bagIds)));

            $cartOrders = Order::with(['items.product'])
                ->whereIn('ord_id', $unique)
                ->where('cust_id', $custId)
                ->where('ord_status', 'CART')
                ->whereRaw("ord_tag LIKE 'CART-%'")
                ->get();

            if ($cartOrders->count() !== count($unique)) {
                return ['error' => ['One or more cart items are no longer available.', 409]];
            }

            return ['cartOrders' => $cartOrders];
        }

        $id = (int) $json->input('ord_id');

        if ($id > 0) {
            // Check if it is already a placed order
            $placed = Order::find($id);
            if ($placed && (int) $placed->cust_id === $custId) {
                if (! str_starts_with((string) $placed->ord_tag, 'CART-')) {
                    return ['order' => $placed];
                }
                // It is still a cart order — treat as a single-item checkout
                $placed->loadMissing(['items.product']);
                if ($placed->ord_status === 'CART') {
                    return ['cartOrders' => collect([$placed])];
                }
                return ['order' => $placed];
            }

            if ($placed && (int) $placed->cust_id !== $custId) {
                return ['error' => ['Order not found', 404]];
            }
        }

        return ['error' => ['Order not found', 404]];
    }

    /**
     * Sum item_amount across all items in all cart orders.
     */
    protected function cartSubtotal($cartOrders): float
    {
        $total = 0.0;
        foreach ($cartOrders as $order) {
            $order->loadMissing('items');
            foreach ($order->items as $item) {
                $total += (float) $item->item_amount;
            }
        }
        return round($total, 2);
    }

    /**
     * FLOW-CHECKOUT-04..06: booking or re-using the pickup appointment.
     * Uses `appoint_date` (live column) instead of non-existent `appoint_start`.
     */
    protected function bookingAppointment(Request $json, int $custId): Appointment
    {
        $slotMinutes = (int) $this->settingValue('slot_minutes', 10);
        $slotStart   = $this->slotStartFrom($json);

        $appointId = (int) $json->input('appoint_id', 0);
        $existing  = $appointId > 0 ? Appointment::find($appointId) : null;

        $reusable = $existing
            && (int) $existing->cust_id === $custId
            && $existing->appoint_closed === null
            && in_array(strtolower((string) $existing->appoint_type), ['pickup', 'claim'], true)
            && ! Pickup::where('appoint_id', $existing->appoint_id)->exists();

        if ($reusable) {
            $start = $slotStart ?? $this->defaultSlotStart();
            if (! $this->slotHasCapacity($start, $existing->appoint_id)) {
                throw new \RuntimeException('The selected pickup slot is already full. Please pick another slot.');
            }
            $existing->update([
                'appoint_type'   => 'CLAIM',
                'appoint_closed' => null,
                'appoint_qr'     => $existing->appoint_qr ?: ('APPT-' . strtoupper(Str::random(16))),
                'appoint_date'   => $start,
            ]);
            return $existing->refresh();
        }

        $start = $slotStart ?? $this->defaultSlotStart();
        if ($start->isPast()) {
            throw new \RuntimeException('Appointment slots must be booked for a future time.');
        }
        if (! $this->slotHasCapacity($start)) {
            throw new \RuntimeException('The selected pickup slot is already full. Please pick another slot.');
        }

        return Appointment::create([
            'cust_id'        => $custId,
            'appoint_created'=> now(),
            'appoint_closed' => null,
            'appoint_date'   => $start,
            'appoint_type'   => 'CLAIM',
            'appoint_qr'     => 'APPT-' . strtoupper(Str::random(16)),
            'appoint_desc'   => 'Order pickup appointment',
        ]);
    }

    protected function slotStartFrom(Request $json): ?Carbon
    {
        $raw = $json->input('appoint_start') ?? $json->input('appoint_date');
        if (empty($raw)) return null;
        try {
            return Carbon::parse($raw);
        } catch (\Throwable $e) {
            throw new \RuntimeException('A valid appointment slot is required.');
        }
    }

    protected function defaultSlotStart(): Carbon
    {
        return Carbon::parse(
            now()->addMinutes((int) $this->settingValue('booking_lead_minutes', 30))->format('Y-m-d H:00')
        );
    }

    /** D8: a slot holds at most `pickup_slot_capacity` pickup appointments. */
    protected function slotHasCapacity(Carbon $start, ?int $ignoreAppointId = null): bool
    {
        $capacity = max(1, (int) $this->settingValue('pickup_slot_capacity', 5));

        $query = Appointment::where('appoint_type', 'CLAIM')
            ->whereNull('appoint_closed')
            ->where('appoint_date', $start);

        if ($ignoreAppointId) {
            $query->where('appoint_id', '!=', $ignoreAppointId);
        }

        return $query->count() < $capacity;
    }

    protected function deliveryExpect(string $speed): Carbon
    {
        return match ($speed) {
            'priority' => now()->addHours(24),
            'saver'    => now()->addDays(5),
            default    => now()->addDays(2),
        };
    }

    /** Render a placed (ORD-*) order for the frontend. */
    protected function orderPayload(Order $order): array
    {
        $order->loadMissing(['items.product', 'pickup.appointment', 'pickup.payment', 'parcel.delivery', 'parcel.payment']);

        $items = $order->items->map(fn ($item) => [
            'item_id'     => $item->item_id,
            'ord_id'      => $item->ord_id,
            'prod_id'     => $item->prod_id,
            'item_qty'    => (int) $item->item_qty,
            'item_amount' => (float) $item->item_amount,
            'product'     => $item->product ? $item->product->toArray() : null,
        ])->values()->all();

        $total   = $order->items->sum(fn ($item) => (float) $item->item_amount);
        $payload = $order->toArray();
        $payload['items']      = $items;
        $payload['status']     = $order->ord_status;
        $payload['ord_amount'] = round($total, 2);
        $payload['amount']     = $payload['ord_amount'];

        $payment = $order->pickup?->payment ?? $order->parcel?->payment ?? null;
        if ($payment) {
            $payload['pay_ref']       = $payment->pay_ref;
            $payload['pay_reference'] = $payment->pay_ref;
            $payload['pay_given']     = (float) $payment->pay_given;
            $payload['pay_due']       = (float) $payment->pay_due;
            $payload['pay_change']    = (float) $payment->pay_change;
        }

        if ($order->pickup && $order->pickup->appointment) {
            $payload['dispatch_type'] = 'pickup';
            $payload['appoint_id']    = $order->pickup->appointment->appoint_id;
            $payload['appoint_date']  = $order->pickup->appointment->appoint_date;
            $payload['appoint_qr']    = $order->pickup->appointment->appoint_qr;
        }

        if ($order->parcel && $order->parcel->delivery) {
            $delivery = $order->parcel->delivery;
            $payload['dispatch_type']   = 'delivery';
            $payload['deliver_qr']      = $delivery->deliver_qr;
            $payload['deliver_address'] = $delivery->deliver_address;
            $payload['deliver_status']  = $delivery->deliver_status;
            $payload['deliver_date']    = $delivery->deliver_date;
            $payload['delivery_ref']    = $delivery->delivery_ref;
        }

        $payload['is_preorder'] = $order->pickup !== null || $order->parcel !== null;

        return $payload;
    }
}
