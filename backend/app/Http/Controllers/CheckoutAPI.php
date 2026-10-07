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
use App\Models\Prodvar;
use App\Services\PayMongoService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * DOMAIN 26 (ORDER CHECKOUT) - assembled against the restored live schema.
 *
 * The cart is the `bag` table (bag_deleted IS NULL, bag_placed = false).
 * One checkout cuts the selected rows into ONE order:
 *
 *   bag rows --(bag_id)--> items(ord_id, bag_id) --> orders
 *   orders   : ord_status 'processing', ord_claiming 'pickup'|'delivery',
 *              ord_amount = goods subtotal + dispatch fee,
 *              pay_reference / pay_received / pay_change
 *   payment  : pay_ref, pay_given, pay_due, pay_change (one row per checkout)
 *   pickup   : pickup(appoint_id, ord_id) + the claim appointment created in
 *              the same transaction (FLOW-CHECKOUT-06)
 *   delivery : delivery(ord_id, cust_id, deliver_address, deliver_phone,
 *              deliver_qr, deliver_expect) + parcel(ord_id, deliver_id, pay_id)
 *   stock    : prodvar.prodvar_stock - bag_qty per line
 *   counters : customer.cust_orders + 1 (the bag badge is customer.cust_bag)
 *   messages : custnotif / empnotif identify the order by ord_id only
 *
 * Endpoints
 *   POST /checkout/dispatch        fee/ETA preview - no writes, no OTP
 *   POST /checkout/payment         OTP purpose `checkout`, ONE transaction
 *   POST /checkout/payment/intent  the same assembly plus a PayMongo intent
 *                                  whose metadata is `order:<ord_id>`
 *   POST /checkout/payment/webhook public (outside auth:api), marks THAT order
 *                                  paid: orders.pay_reference / pay_received +
 *                                  the payment row (REQ-CHECKOUT-03)
 *
 * Cart selection: `bag_ids` (the checked rows) or nothing = every live bag
 * row (REQ-CHECKOUT-01).
 */
class CheckoutAPI extends Controller
{
    /** Delivery tier fees in PHP; pickup is always free. */
    const DISPATCH_FEES = ['priority' => 100.0, 'standard' => 50.0, 'saver' => 30.0];

    // ==========================================
    // DISPATCH DETAILS (preview only, no DB writes)
    // ==========================================

    /*
        Determining dispatch details
        ----------
        JSON REQUEST

        bag_ids        - array (opt: checked bag rows; empty = all live rows)
        dispatch_type  - string (req: pickup | delivery)
        speed          - string (opt: priority | standard | saver, default: standard)
        deliver_address- string (opt: falls back to customer.cust_address)
        deliver_expect - string/datetime (opt: delivery date)
        appoint_id     - integer (opt: an already booked claim appointment)
        appoint_start  - string/datetime (opt: requested slot start)
    */
    public function determineDispatchDetails(Request $json)
    {
        $validator = (new InputValidatorAPI())->determineDispatchDetails($json);
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
            $dispatchFee = $this->dispatchFee($dispatchType, $speed);
            $totalDue    = round($subtotal + $dispatchFee, 2);

            if ($dispatchType === 'pickup') {
                $slotStart = $this->slotStartFrom($json) ?? $this->defaultSlotStart();
                $slotEnd   = $slotStart->copy()->addMinutes($this->slotMinutes());
                $appointId = (int) $json->input('appoint_id', 0);

                if ($appointId > 0) {
                    $appointment = Appointment::find($appointId);

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
                ];
            }

            return response()->json([
                'success' => true,
                'message' => 'Dispatch details determined successfully',
                'data'    => [
                    'bag_ids'          => $bags->pluck('bag_id')->all(),
                    'subtotal'         => $subtotal,
                    'dispatch_fee'     => $dispatchFee,
                    'total_due'        => $totalDue,
                    'total'            => $totalDue,
                    'cart_count'       => CartAPI::cartCount($custId),
                    'items'            => $bags->map(fn ($bag) => OrdersAPI::lineFromBag($bag))->values()->all(),
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

    // ==========================================
    // INTEGRATE PAYMENT (place the order)
    // ==========================================

    /*
        Integrating payment = placing the order (DOMAIN 26)
        ----------
        JSON REQUEST

        bag_ids         - array (opt: checked bag rows; empty = all live rows)
        pay_given       - numeric (req: cash / on-hand amount tendered)
        pay_ref         - string (opt: reference stamped on the payment row)
        dispatch_type   - string (req: pickup | delivery)
        speed           - string (opt: priority | standard | saver)
        deliver_address - string (opt)
        deliver_expect  - string/datetime (opt: delivery date)
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
            $payGiven     = round((float) $json->input('pay_given'), 2);

            $custId = $this->customerId($json);
            if ($custId === null) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer authentication is required.',
                ], 403);
            }

            // FLOW-CHECKOUT-08: the phone OTP gates the order placement.
            $gate = $this->otpGate($json, 'checkout');
            if ($gate) return $gate;

            $scope = $this->resolveBagScope($json, $custId);
            if (isset($scope['error'])) {
                return response()->json(['success' => false, 'message' => $scope['error'][0]], $scope['error'][1]);
            }

            $bags        = $scope['bags'];
            $subtotal    = $this->bagSubtotal($bags);
            $dispatchFee = $this->dispatchFee($dispatchType, $speed);
            $totalDue    = round($subtotal + $dispatchFee, 2);

            if ($payGiven < $totalDue) {
                return response()->json([
                    'success' => false,
                    'message' => 'Insufficient payment given. Total due is ' . number_format($totalDue, 2)
                        . ', but only ' . number_format($payGiven, 2) . ' was provided.',
                ], 400);
            }

            $payRef    = $json->input('pay_ref') ?: ('PAY-' . strtoupper(Str::random(16)));
            $payChange = round($payGiven - $totalDue, 2);

            $result = $this->placeOrder($json, $custId, $dispatchType, $speed,
                function (Order $order, float $due) use ($payRef, $payGiven, $payChange) {
                    return [
                        'pay_ref' => $payRef,
                        'paid'    => true,
                        'given'   => $payGiven,
                        'due'     => $due,
                        'change'  => $payChange,
                    ];
                });

            // The verification is burned only once the order exists.
            $this->consumeOtp($json, 'checkout');

            // REQ-ACCESS_LOG-01/03: placing an order is recorded on the account.
            $this->logCustomer($custId, 'edit',
                'POST /api/checkout/payment - order #' . $result['order']->ord_id);

            return response()->json([
                'success' => true,
                'message' => 'Payment integrated and order checkout completed successfully',
                'data'    => [
                    'ord_id'     => $result['order']->ord_id,
                    'bag_ids'    => $result['bag_ids'],
                    'cart_count' => CartAPI::cartCount($custId),
                    'payment'    => $result['payment'],
                    'dispatch'   => $result['dispatch'],
                    'order'      => OrdersAPI::orderPayload($result['order']),
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
        Create PayMongo Payment Intent (REQ-CHECKOUT-03)
        ----------
        Assembles the order first so the intent metadata can identify it as
        `order:<ord_id>`; the webhook then marks exactly that order paid.

        JSON REQUEST

        bag_ids        - array (opt: checked bag rows; empty = all live rows)
        gateway        - string (req: paymongo)
        dispatch_type  - string (opt: pickup | delivery, default: pickup)
        speed          - string (opt)
        deliver_address- string (opt)
        appoint_id     - integer (opt)
        appoint_start  - string/datetime (opt)
    */
    public function createPaymentIntent(Request $json)
    {
        $validator = (new InputValidatorAPI())->createPaymentIntent($json);
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

            // Same gate as the cash path: this endpoint also places the order.
            $gate = $this->otpGate($json, 'checkout');
            if ($gate) return $gate;

            $result = $this->placeOrder($json, $custId, $dispatchType, $speed,
                function (Order $order, float $due) {
                    $paymongo = new PayMongoService();
                    $intent   = $paymongo->createPaymentIntent(
                        $due,
                        'order:' . $order->ord_id,
                        'Payment for order #' . $order->ord_id
                    );

                    return [
                        'pay_ref' => $intent['payment_intent_id'],
                        'paid'    => false,
                        'given'   => 0.0,
                        'due'     => $due,
                        'change'  => 0.0,
                        'intent'  => $intent,
                    ];
                });

            $this->consumeOtp($json, 'checkout');

            $intent = $result['reference']['intent'] ?? [];

            // REQ-ACCESS_LOG-01/03: opening an online checkout is recorded.
            $this->logCustomer($custId, 'edit',
                'POST /api/checkout/payment/intent - order #' . $result['order']->ord_id);

            return response()->json([
                'success' => true,
                'message' => 'Payment intent created successfully',
                'data'    => [
                    'checkout_url'      => $intent['checkout_url'] ?? null,
                    'payment_intent_id' => $intent['payment_intent_id'] ?? null,
                    'client_key'        => $intent['client_key'] ?? null,
                    'ord_id'            => $result['order']->ord_id,
                    'bag_ids'           => $result['bag_ids'],
                    'total_due'         => $result['payment']['pay_due'],
                    'cart_count'        => CartAPI::cartCount($custId),
                    'payment'           => $result['payment'],
                    'dispatch'          => $result['dispatch'],
                    'order'             => OrdersAPI::orderPayload($result['order']),
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

    // ==========================================
    // PAYMONGO WEBHOOK (public - REQ-CHECKOUT-03)
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

            $event      = json_decode($payload, true);
            $attributes = $event['data']['attributes']['data']['attributes'] ?? [];
            if ($attributes === []) {
                $candidate = $event['data']['attributes'] ?? [];
                if (isset($candidate['status']) || isset($candidate['metadata'])) {
                    $attributes = $candidate;
                }
            }

            // The intent metadata carries `order:<ord_id>` (REQ-CHECKOUT-03).
            $reference = (string) ($attributes['metadata']['order_id'] ?? '');
            $paid      = ($attributes['status'] ?? '') === 'succeeded';

            if (! str_starts_with($reference, 'order:') || ! $paid) {
                return response()->json(['success' => true, 'message' => 'Event acknowledged'], 200);
            }

            $order = Order::find((int) substr($reference, 6));
            if (! $order) {
                Log::warning('PayMongo webhook: order not found', ['reference' => $reference]);
                return response()->json(['success' => true, 'message' => 'Event acknowledged'], 200);
            }

            $payment = $this->markOrderPaid($order, $attributes);

            // REQ-ACCESS_LOG-01/03: the paid order is recorded on the account.
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
            return response()->json(['success' => true, 'message' => 'Event acknowledged'], 200);
        }
    }

    // ==========================================
    // ORDER ASSEMBLY (REQ-CHECKOUT-02 - ONE transaction)
    // ==========================================

    /**
     * Validates the selected bag rows, then writes the whole checkout:
     * order, items, bag_placed, stock, payment, pickup/delivery + parcel,
     * counters and notifications - all inside ONE transaction, so any failure
     * leaves the bag exactly as it was (REQ-CHECKOUT-02).
     *
     * The $resolveReference callback runs after the order row exists and
     * before the payment row: the cash path returns the tendered amounts,
     * the PayMongo path creates the intent tagged `order:<ord_id>`.
     *
     * @return array{order: Order, payment: array, dispatch: array,
     *               bag_ids: array, reference: array}
     */
    protected function placeOrder(Request $json, int $custId, string $dispatchType, string $speed, callable $resolveReference): array
    {
        return DB::transaction(function () use ($json, $custId, $dispatchType, $speed, $resolveReference) {
            // 1. Lock the selected bag rows for the duration of the checkout.
            $bags = $this->lockBagRows($json, $custId);

            // 2. Validate every variation still holds its stock.
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

                // The in-stock and the pre-order lines are deducted at different
                // moments: on-hand stock leaves the shelf at placement, while a
                // pre-order is only fulfilled once the goods arrive (the claim /
                // delivery receipt deducts it, TrackingAPI::fulfilOrder).
                if ((bool) $prodvar->prodvar_preorder) {
                    $preorderLines[(int) $bag->prodvar_id] = true;
                }

                $subtotal += round((float) $bag->bag_amount * $qty, 2);
            }

            $subtotal    = round($subtotal, 2);
            $dispatchFee = $this->dispatchFee($dispatchType, $speed);
            $totalDue    = round($subtotal + $dispatchFee, 2);

            // 3. The order itself (FLOW-CHECKOUT-02: one order per checkout).
            $order = Order::create([
                // No sequence for ord_id on the live table; allocated inside
                // this checkout transaction (see Controller::nextId).
                'ord_id'      => $this->nextId('orders', 'ord_id'),
                'cust_id'      => $custId,
                'ord_amount'   => $totalDue,
                'ord_status'   => 'processing',
                'ord_claiming' => $dispatchType === 'pickup' ? 'pickup' : 'delivery',
                'ord_created'  => now(),
            ]);

            // 4. The payment reference (cash amounts or the PayMongo intent).
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

            // 5. One items row per bag row, the bag rows become placed and the
            //    variation stock comes down (items carry no quantities). In-stock
            //    lines are deducted now; pre-order lines are booked without
            //    touching stock and deducted when the claim/receipt fulfils the
            //    order (TrackingAPI::fulfilOrder) - so each line is deducted
            //    exactly once across the two moments.
            foreach ($bags as $bag) {
                Item::create([
                    // No sequence for item_id on the live table.
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

            // 6. Claiming details - the appointment is created here too
            //    (FLOW-CHECKOUT-06: appointments are saved with the order).
            $customer = Customer::find($custId);
            $dispatch  = [];

            if ($dispatchType === 'pickup') {
                $appointment = $this->bookingAppointment($json, $custId);
                $pickup      = Pickup::create([
                    // No sequence for pickup_id on the live table.
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

                $delivery = Delivery::create([
                    // No sequence for deliver_id on the live table.
                    'deliver_id'     => $this->nextId('delivery', 'deliver_id'),
                    'ord_id'         => $order->ord_id,
                    'cust_id'        => $custId,
                    'deliver_address'=> $address,
                    'deliver_phone'  => (string) ($customer->cust_phone ?? ''),
                    'deliver_qr'     => 'QR-DEL-' . strtoupper(Str::random(10)),
                    'deliver_expect' => $expect,
                    'deliver_created'=> now(),
                ]);

                $parcel = Parcel::create([
                    'ord_id'         => $order->ord_id,
                    'deliver_id'     => $delivery->deliver_id,
                    'pay_id'         => $payment->pay_id,
                    'parcel_created' => now(),
                ]);

                $dispatch = [
                    'modality'        => 'DELIVERY',
                    'delivery_id'     => $delivery->deliver_id,
                    'parcel_id'       => $parcel->parcel_id,
                    'deliver_qr'      => $delivery->deliver_qr,
                    'deliver_address' => $delivery->deliver_address,
                    'deliver_phone'   => $delivery->deliver_phone,
                    'deliver_expect'  => $delivery->deliver_expect,
                ];
                $placedNote = 'It is expected to arrive by '
                    . ($delivery->deliver_expect
                        ? $delivery->deliver_expect->format('M j, Y')
                        : 'the estimated date') . '.';
            }

            // 7. Customer counter (REQ-BAG-03 keeps the bag badge on cust_bag).
            Customer::where('cust_id', $custId)->increment('cust_orders');

            // 8. Messages identify the order by ord_id - never by a tag.
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

    // ==========================================
    // CHECKOUT HELPERS
    // ==========================================

    /**
     * The bag rows this request wants to check out: the explicit `bag_ids`,
     * or every live bag row when none were sent (REQ-CHECKOUT-01).
     *
     * @return array{bags?: \Illuminate\Support\Collection, error?: array{0: string, 1: int}}
     */
    protected function resolveBagScope(Request $json, int $custId): array
    {
        $query  = CartAPI::bagQuery($custId);
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

    /**
     * Same selection again, but with the rows locked for the transaction.
     */
    protected function lockBagRows(Request $json, int $custId)
    {
        $scope = $this->resolveBagScope($json, $custId);
        if (isset($scope['error'])) {
            throw new \RuntimeException($scope['error'][0]);
        }

        $ids  = $scope['bags']->pluck('bag_id')->all();
        $bags = CartAPI::bagQuery($custId)
            ->whereIn('bag_id', $ids)
            ->orderByDesc('bag_created')
            ->lockForUpdate()
            ->get();

        if ($bags->count() !== count($ids)) {
            throw new \RuntimeException('One or more bag items are no longer available.');
        }

        return $bags;
    }

    /** FLOW-BAG-06: subtotal = sum(bag_amount * bag_qty) over the selection. */
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

        return self::DISPATCH_FEES[$speed] ?? self::DISPATCH_FEES['standard'];
    }

    /**
     * FLOW-CHECKOUT-04..06: reuse the claim appointment the customer booked on
     * `/book`, otherwise create it right here - inside the checkout
     * transaction, so the appointment only exists once the order does.
     */
    protected function bookingAppointment(Request $json, int $custId): Appointment
    {
        $slotStart = $this->slotStartFrom($json) ?? $this->defaultSlotStart();
        $slotEnd   = $slotStart->copy()->addMinutes($this->slotMinutes());

        if ($slotStart->isPast()) {
            throw new \RuntimeException('Appointment slots must be booked for a future time.');
        }

        $appointId = (int) $json->input('appoint_id', 0);
        $existing  = $appointId > 0 ? Appointment::find($appointId) : null;

        if ($appointId > 0) {
            if (! $existing || ! $this->usableAppointment($existing, $custId)) {
                throw new \RuntimeException('A valid order-claiming appointment is required.');
            }
        }

        if ($existing) {
            $existing->update([
                'appoint_start' => $slotStart,
                'appoint_end'   => $slotEnd,
                'appoint_qr'    => $existing->appoint_qr ?: ('APPT-' . strtoupper(Str::random(16))),
            ]);

            return $existing->refresh();
        }

        if (! $this->slotHasCapacity($slotStart, $slotEnd)) {
            throw new \RuntimeException('The selected pickup slot is already full. Please pick another slot.');
        }

        return Appointment::create([
            // No sequence for appoint_id on the live `appointments` table.
            // NOTE: `payment`, `parcel` and the legacy singular `appointment`
            // table own sequences and must not be allocated manually here.
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

    /** An appointment may only carry one order and must still be open. */
    protected function usableAppointment(Appointment $appointment, int $custId): bool
    {
        return (int) $appointment->cust_id === $custId
            && $appointment->appoint_closed === null
            && $appointment->appoint_status !== 'cancelled'
            && in_array(strtolower((string) $appointment->appoint_type), ['pickup', 'claim'], true)
            && ! Pickup::where('appoint_id', $appointment->appoint_id)->exists();
    }

    /** D8: a slot holds at most `pickup_slot_capacity` claim appointments. */
    protected function slotHasCapacity(Carbon $start, Carbon $end, ?int $ignoreAppointId = null): bool
    {
        $capacity = max(1, (int) $this->settingValue('pickup_slot_capacity', 5));

        $query = Appointment::whereRaw("LOWER(appoint_type) IN ('pickup', 'claim')")
            ->whereNull('appoint_closed')
            ->where('appoint_start', '<', $end)
            ->where('appoint_end', '>', $start);

        if ($ignoreAppointId) {
            $query->where('appoint_id', '!=', $ignoreAppointId);
        }

        return $query->count() < $capacity;
    }

    /**
     * `appointments.emp_id` is NOT NULL in the live schema, so every claim
     * appointment needs a staff owner: prefer an admin, else any active
     * employee (the restored database ships no roster rows yet).
     */
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

    /** Slots snap to whole minutes; seconds/milliseconds never reach the DB. */
    protected function normalizeSlotStart(Carbon $slot): Carbon
    {
        return $slot->copy()->second(0)->millisecond(0);
    }

    protected function defaultSlotStart(): Carbon
    {
        return $this->normalizeSlotStart(
            Carbon::parse(now()->addMinutes((int) $this->settingValue('booking_lead_minutes', 30))->format('Y-m-d H:00'))
        );
    }

    protected function slotMinutes(): int
    {
        return max(1, (int) $this->settingValue('slot_minutes', 10));
    }

    /**
     * FLOW-CHECKOUT-07: the delivery date the form sends, else the tier
     * estimate for the selected speed.
     */
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

    /** The saved customer address is the fallback for the delivery branch. */
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

    /** Orders the payment row for an online payment (REQ-CHECKOUT-03). */
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

    /** REQ-IM-03: stock at/below the threshold raises a priority admin alert. */
    protected function lowStockAlerts($bags): void
    {
        $threshold = (int) $this->settingValue('low_stock_threshold', 5);
        $alerts    = [];

        foreach ($bags as $bag) {
            $prodvar = $bag->prodvar;
            if (! $prodvar || (int) $prodvar->prodvar_stock > $threshold) continue;

            $alerts[] = [
                'name'  => $prodvar->product
                    ? $prodvar->product->prod_name
                    : ('variation #' . $bag->prodvar_id),
                'stock' => (int) $prodvar->prodvar_stock,
            ];
        }

        foreach ($alerts as $alert) {
            $this->alertAdmins('[PRIORITY] Low stock: "' . $alert['name'] . '" is now down to '
                . $alert['stock'] . ' unit(s).');
        }
    }

    /**
     * A notification inbox write must never roll back a placed order, so the
     * admin broadcast is best-effort (see the handoff note on
     * Controller::notifyEmployeesByType).
     */
    protected function alertAdmins(string $message): void
    {
        try {
            $this->notifyEmployeesByType(['ADMIN', 'SUPER ADMIN'], $message);
        } catch (\Throwable $e) {
            Log::warning('Checkout admin notification failed', ['error' => $e->getMessage()]);
        }
    }

    /** Best-effort customer inbox write (logCustomer-style tolerance). */
    protected function announce(int $custId, string $message): void
    {
        if ($custId <= 0) return;

        try {
            $this->notifyCustomer($custId, $message);
        } catch (\Throwable $e) {
            Log::warning('Checkout customer notification failed', ['error' => $e->getMessage()]);
        }
    }
}
