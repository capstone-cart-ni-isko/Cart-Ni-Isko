<?php

    namespace App\Http\Controllers;

    use App\Exceptions\InsufficientStockException;
    use App\Models\Appointment;
    use App\Models\Customer;
    use App\Models\Delivery;
    use App\Models\Item;
    use App\Models\Order;
    use App\Models\Parcel;
    use App\Models\Payment;
    use App\Models\Pickup;
    use App\Models\Product;
    use App\Services\PayMongoService;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;
    use Illuminate\Support\Facades\Log;
    use Illuminate\Support\Str;

    class CheckoutAPI extends Controller
    {
        /*
            Determining dispatch details
            ----------
            JSON REQUEST

            ord_id - integer (req)
            dispatch_type - string (req: pickup | delivery)
            speed - string (opt: priority | standard | saver, default: standard)
            deliver_address - string (opt)
            appoint_id - integer (opt)
        */
        public function determineDispatchDetails(Request $json)
        {
            $validator = (new InputValidatorAPI())->determineDispatchDetails($json);
            if ($validator) return $validator;

            try {
                $ordId = $json->input('ord_id');
                $dispatchType = strtolower($json->input('dispatch_type'));
                $speed = strtolower($json->input('speed', 'standard'));

                $order = Order::with(['items.product', 'customer'])->where('ord_id', $ordId)->first();
                if (! $order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }
                $customerId = $this->customerId($json);
                if ($customerId === null || (int) $order->cust_id !== $customerId) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }
                if (! str_starts_with(strtoupper((string) $order->ord_tag), 'CART-')) {
                    return response()->json(['success' => false, 'message' => 'Order has already been checked out.'], 409);
                }

                $subtotal = (float) $order->items->sum(
                    fn ($item) => (float) $item->product->prod_price * (int) $item->item_qty
                );
                $dispatchFee = 0.00;
                $dispatchDetails = [];

                if ($dispatchType === 'pickup') {
                    $appointId = $json->input('appoint_id');
                    $appointment = null;
                    if ($appointId) {
                        $appointment = Appointment::where('appoint_id', $appointId)
                            ->where('cust_id', $customerId)
                            ->whereNull('appoint_closed')
                            ->first();
                    }
                    if (! $appointment || $appointment->appoint_type !== 'CLAIM') {
                        return response()->json([
                            'success' => false,
                            'message' => 'A valid order-claiming appointment is required.',
                        ], 422);
                    }

                    $dispatchFee = 0.00;
                    $dispatchDetails = [
                        'type'             => 'PICKUP',
                        'appoint_id'       => $appointId,
                        'appointment_date' => $appointment ? $appointment->appoint_date : null,
                        'location'         => 'Tindahan ni Isko Physical Store',
                    ];
                } else {
                    $feeMap = [
                        'priority' => 100.00,
                        'standard' => 50.00,
                        'saver'    => 30.00,
                    ];
                    $dispatchFee = $feeMap[$speed] ?? 50.00;

                    $deliverAddress = $json->input('deliver_address');
                    if (!$deliverAddress && $order->customer) {
                        $c = $order->customer;
                        $deliverAddress = trim(($c->cust_brgy ?? '') . ', ' . ($c->cust_city ?? '') . ', ' . ($c->cust_province ?? ''), ', ');
                    }
                    if (empty($deliverAddress)) {
                        return response()->json([
                            'success' => false,
                            'message' => 'A delivery address is required.',
                        ], 422);
                    }

                    $estDate = ($speed === 'priority')
                        ? now()->addHours(24)->toDateTimeString()
                        : (($speed === 'saver') ? now()->addDays(5)->toDateTimeString() : now()->addDays(2)->toDateTimeString());

                    $dispatchDetails = [
                        'type'               => 'DELIVERY',
                        'speed'              => strtoupper($speed),
                        'deliver_address'    => $deliverAddress,
                        'estimated_delivery' => $estDate,
                    ];
                }

                $totalDue = round($subtotal + $dispatchFee, 2);

                return response()->json([
                    'success' => true,
                    'message' => 'Dispatch details determined successfully',
                    'data' => [
                        'ord_id'           => $ordId,
                        'subtotal'         => $subtotal,
                        'dispatch_fee'     => $dispatchFee,
                        'total_due'        => $totalDue,
                        'dispatch_details' => $dispatchDetails,
                        'items'            => $order->items
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to determine dispatch details',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Integrating payment
            ----------
            JSON REQUEST

            ord_id - integer (req)
            pay_given - numeric (req)
            pay_ref - string (opt)
            dispatch_type - string (req: pickup | delivery)
            speed - string (opt: priority | standard | saver)
            deliver_address - string (opt)
            appoint_id - integer (opt)
        */
        public function integratePayment(Request $json)
        {
            $validator = (new InputValidatorAPI())->integratePayment($json);
            if ($validator) return $validator;

            try {
                $ordId = $json->input('ord_id');
                $dispatchType = strtolower($json->input('dispatch_type'));
                $speed = strtolower($json->input('speed', 'standard'));
                $payGiven = (float) $json->input('pay_given');

                $order = Order::with(['items.product', 'customer'])->where('ord_id', $ordId)->first();
                if (! $order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }
                $customerId = $this->customerId($json);
                if ($customerId === null || (int) $order->cust_id !== $customerId) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }
                if (! str_starts_with(strtoupper((string) $order->ord_tag), 'CART-')) {
                    return response()->json(['success' => false, 'message' => 'Order has already been checked out.'], 409);
                }

                $subtotal = (float) $order->items->sum(
                    fn ($item) => (float) $item->product->prod_price * (int) $item->item_qty
                );
                $dispatchFee = 0.00;

                if ($dispatchType === 'pickup') {
                    $dispatchFee = 0.00;
                    $appointment = Appointment::where('appoint_id', $json->input('appoint_id'))
                        ->where('cust_id', $customerId)
                        ->whereNull('appoint_closed')
                        ->first();
                    if (! $appointment || $appointment->appoint_type !== 'CLAIM') {
                        return response()->json([
                            'success' => false,
                            'message' => 'A valid order-claiming appointment is required.',
                        ], 422);
                    }
                } else {
                    $feeMap = [
                        'priority' => 100.00,
                        'standard' => 50.00,
                        'saver'    => 30.00,
                    ];
                    $dispatchFee = $feeMap[$speed] ?? 50.00;
                }

                $totalDue = round($subtotal + $dispatchFee, 2);

                if ($payGiven < $totalDue) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Insufficient payment given. Total amount due is ' . number_format($totalDue, 2) . ', but only ' . number_format($payGiven, 2) . ' was provided.'
                    ], 400);
                }

                $payChange = round($payGiven - $totalDue, 2);
                $payRef = 'PAY-' . strtoupper(Str::random(16));

                // REQ-OC-02: the whole checkout runs in a single transaction,
                // so any failure below rolls the cart back to its original
                // pre-checkout state
                $result = DB::transaction(function () use ($json, $order, $dispatchType, $speed, $payGiven, $payChange, $payRef, $totalDue) {
                    $order = Order::with(['items.product', 'customer'])
                        ->where('ord_id', $order->ord_id)
                        ->lockForUpdate()
                        ->first();
                    if (! $order) {
                        throw new \RuntimeException('Order not found.');
                    }
                    if ($order->ord_status !== 'TO PROCESS' || ! str_starts_with((string) $order->ord_tag, 'CART-')) {
                        $pickup = Pickup::where('ord_id', $order->ord_id)->first();
                        $parcel = Parcel::where('ord_id', $order->ord_id)->first();
                        $paymentId = $pickup?->pay_id ?? $parcel?->pay_id;
                        if (! $paymentId) {
                            throw new \RuntimeException('Order checkout is no longer available.');
                        }
                        return [
                            'already_completed' => true,
                            'payment' => Payment::find($paymentId),
                            'dispatch' => ['modality' => $pickup ? 'PICKUP' : 'DELIVERY'],
                            'order' => $order,
                        ];
                    }

                    $checkoutSubtotal = 0.0;
                    foreach ($order->items as $item) {
                        $product = Product::where('prod_id', $item->prod_id)->lockForUpdate()->first();
                        if (! $product || $product->prod_disabled || $product->prod_deleted) {
                            throw new InsufficientStockException('A product in the cart is no longer available.');
                        }
                        $lineTotal = round((float) $product->prod_price * (int) $item->item_qty, 2);
                        $checkoutSubtotal += $lineTotal;
                        $item->update(['item_amount' => $lineTotal]);
                    }
                    $checkoutFeeMap = ['priority' => 100.0, 'standard' => 50.0, 'saver' => 30.0];
                    $checkoutFee = $dispatchType === 'pickup' ? 0.0 : ($checkoutFeeMap[$speed] ?? 50.0);
                    $totalDue = round($checkoutSubtotal + $checkoutFee, 2);
                    if ($payGiven < $totalDue) {
                        throw new \RuntimeException('Payment amount is below the server-calculated total.');
                    }
                    $payChange = round($payGiven - $totalDue, 2);

                    // 1. Create Payment Record
                    $payment = Payment::create([
                        'pay_created' => now(),
                        'pay_ref'     => $payRef,
                        'pay_given'   => $payGiven,
                        'pay_due'     => $totalDue,
                        'pay_change'  => $payChange,
                    ]);

                    $dispatchResult = [];

                    // 2. Process Dispatch Modality (drives the status change)
                    if ($dispatchType === 'pickup') {
                        $appointId = $json->input('appoint_id');
                        $pickup = Pickup::create([
                            'ord_id'           => $order->ord_id,
                            'appoint_id'       => $appointId,
                            'pay_id'           => $payment->pay_id,
                            'pickup_created'   => now(),
                            'pickup_completed' => null,
                        ]);

                        $order->ord_status = 'TO CLAIM';

                        $dispatchResult = [
                            'modality'   => 'PICKUP',
                            'pickup_id'  => $pickup->pickup_id,
                            'appoint_id' => $appointId,
                        ];
                    } else {
                        $deliverAddress = $json->input('deliver_address');
                        if (!$deliverAddress && $order->customer) {
                            $c = $order->customer;
                            $deliverAddress = trim(($c->cust_brgy ?? '') . ', ' . ($c->cust_city ?? '') . ', ' . ($c->cust_province ?? ''), ', ');
                        }
                        if (empty($deliverAddress)) {
                            throw new \RuntimeException('A delivery address is required.');
                        }

                        $estDate = ($speed === 'priority')
                            ? now()->addHours(24)
                            : (($speed === 'saver') ? now()->addDays(5) : now()->addDays(2));

                        $delivery = Delivery::create([
                            'deliver_created' => now(),
                            'deliver_deleted' => null,
                            'delivery_ref'    => 'DEL-' . strtoupper(Str::random(8)),
                            'deliver_date'    => $estDate,
                            'deliver_address' => $deliverAddress,
                            'deliver_status'  => 'PENDING',
                            'deliver_qr'      => 'QR-DEL-' . strtoupper(Str::random(10)),
                        ]);

                        $parcel = Parcel::create([
                            'ord_id'           => $order->ord_id,
                            'deliver_id'       => $delivery->deliver_id,
                            'pay_id'           => $payment->pay_id,
                            'parcel_created'   => now(),
                            'parcel_completed' => null,
                        ]);

                        $order->ord_status = 'TO RECEIVE';

                        $dispatchResult = [
                            'modality'        => 'DELIVERY',
                            'delivery_id'     => $delivery->deliver_id,
                            'parcel_id'       => $parcel->parcel_id,
                            'delivery_ref'    => $delivery->delivery_ref,
                            'deliver_address' => $delivery->deliver_address,
                            'deliver_date'    => $delivery->deliver_date,
                            'deliver_qr'      => $delivery->deliver_qr,
                        ];
                    }

                    // 3. Verify stock before touching inventory, then update
                    //    stocks & peak sales (REQ-IM-02 / REQ-IM-03)
                    $lowStockThreshold = (int) $this->settingValue('low_stock_threshold', 5);
                    $lowStockProducts = [];

                    foreach ($order->items as $item) {
                        $product = Product::where('prod_id', $item->prod_id)->lockForUpdate()->first();
                        if (!$product) continue;

                        if ($product->prod_qty < $item->item_qty) {
                            // Rolls the whole checkout back (REQ-OC-02)
                            throw new InsufficientStockException('Insufficient stock for ' . $product->prod_name);
                        }

                        $newQty = $product->prod_qty - $item->item_qty;
                        $product->update([
                            'prod_qty'       => $newQty,
                            'prod_peaksold'  => (float)$product->prod_peaksold + (float)$item->item_amount,
                            'prod_todaysold' => (float)$product->prod_todaysold + (float)$item->item_amount,
                        ]);

                        if ($newQty <= $lowStockThreshold) {
                            $lowStockProducts[] = ['name' => $product->prod_name, 'qty' => $newQty];
                        }
                    }

                    // 4. Decrement Customer Cart Counter
                    $customer = $order->customer;
                    if ($customer) {
                        if ($customer->cust_cart > 0) {
                            $customer->decrement('cust_cart');
                        }
                        $customer->increment('cust_orders');
                    }

                    // 5. Cart orders get their final order tag after checkout
                    if (str_starts_with(strtoupper((string) $order->ord_tag), 'CART-')) {
                        $order->ord_tag = 'ORD-' . strtoupper(Str::random(8));
                    }
                    $order->save();

                    // 6. Priority low-stock alerts for admins (REQ-IM-03)
                    foreach ($lowStockProducts as $low) {
                        $this->notifyEmployeesByType(
                            ['ADMIN', 'SUPER ADMIN'],
                            '[PRIORITY] Low stock: "' . $low['name'] . '" is now down to ' . $low['qty'] . ' unit(s).'
                        );
                    }

                    return [
                        'payment' => $payment,
                        'dispatch' => $dispatchResult,
                        'order' => $order->fresh(),
                    ];
                });

                return response()->json([
                    'success' => true,
                    'message' => ! empty($result['already_completed'])
                        ? 'Order checkout was already completed.'
                        : 'Payment integrated and order checkout completed successfully',
                    'data' => [
                        'payment' => $result['payment'],
                        'dispatch' => $result['dispatch'],
                        'order' => $result['order'] ?? $order->fresh(),
                    ],
                ], empty($result['already_completed']) ? 201 : 200);

            } catch (InsufficientStockException $e) {
                // Transaction already rolled back - the cart is untouched
                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage()
                ], 409);
            } catch (\RuntimeException $e) {
                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage(),
                ], 409);
            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to integrate payment',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Create PayMongo Payment Intent
            ----------
            JSON REQUEST

            ord_id - integer (req)
            gateway - string (req: paymongo)
        */
        public function createPaymentIntent(Request $json)
        {
            $validator = (new InputValidatorAPI())->createPaymentIntent($json);
            if ($validator) return $validator;

            try {
                $ordId = $json->input('ord_id');
                $gateway = strtolower($json->input('gateway'));

                $order = Order::with(['items.product', 'customer'])->where('ord_id', $ordId)->first();
                if (! $order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }
                $customerId = $this->customerId($json);
                if ($customerId === null || (int) $order->cust_id !== $customerId) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }
                if (! str_starts_with(strtoupper((string) $order->ord_tag), 'CART-')) {
                    return response()->json(['success' => false, 'message' => 'Order has already been checked out.'], 409);
                }

                $subtotal = (float) $order->items->sum(
                    fn ($item) => (float) $item->product->prod_price * (int) $item->item_qty
                );
                $dispatchFee = 0.00;
                $dispatchType = strtolower($json->input('dispatch_type', 'pickup'));
                $speed = strtolower($json->input('speed', 'standard'));

                if ($dispatchType === 'delivery') {
                    $feeMap = ['priority' => 100.00, 'standard' => 50.00, 'saver' => 30.00];
                    $dispatchFee = $feeMap[$speed] ?? 50.00;
                }

                $totalDue = round($subtotal + $dispatchFee, 2);

                if ($gateway === 'paymongo') {
                    $paymongo = new PayMongoService();
                    $result = $paymongo->createPaymentIntent($totalDue, (string) $ordId, "Order {$order->ord_tag}");
                    return response()->json([
                        'success' => true,
                        'message' => 'Payment intent created successfully',
                        'data' => [
                            'checkout_url' => $result['checkout_url'],
                            'payment_intent_id' => $result['payment_intent_id'],
                            'client_key' => $result['client_key'],
                            'total_due' => $totalDue,
                        ],
                    ], 200);
                }

                return response()->json([
                    'success' => false,
                    'message' => 'Unsupported payment gateway',
                ], 400);

            } catch (\Exception $e) {
                Log::error('PayMongo createPaymentIntent error', ['error' => $e->getMessage()]);
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to create payment intent',
                    'error' => $e->getMessage(),
                ], 500);
            }
        }

        /*
            PayMongo Webhook Handler
            ----------
            Receives payment confirmation webhooks from PayMongo
        */
        public function paymentWebhook(Request $json)
        {
            $signature = $json->header('Paymongo-Signature');
            $payload = $json->getContent();

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
                $eventType = $event['data']['attributes']['type'] ?? '';
                $paymentIntent = $event['data']['attributes']['data']['attributes'] ?? [];
                $metadata = $paymentIntent['metadata'] ?? [];
                $orderId = $metadata['order_id'] ?? null;
                $paymentStatus = $paymentIntent['status'] ?? '';

                if (! $orderId || $paymentStatus !== 'succeeded') {
                    return response()->json(['success' => true, 'message' => 'Event acknowledged'], 200);
                }

                $order = Order::where('ord_id', $orderId)->first();
                if (! $order) {
                    Log::warning('PayMongo webhook: order not found', ['order_id' => $orderId]);
                    return response()->json(['success' => true, 'message' => 'Event acknowledged'], 200);
                }

                // Update order status to PAID when payment confirmed via webhook
                // Create Payment record with PayMongo payment_intent_id
                $paymentIntentId = $paymentIntent['id'] ?? null;
                $amount = isset($paymentIntent['amount']) ? (float) $paymentIntent['amount'] / 100 : 0;

                $payment = Payment::create([
                    'pay_created' => now(),
                    'pay_ref'     => $paymentIntentId ?? 'PM-' . strtoupper(Str::random(16)),
                    'pay_given'   => $amount,
                    'pay_due'     => $amount,
                    'pay_change'  => 0.00,
                ]);

                $order->update([
                    'ord_status' => 'PAID',
                ]);

                // Generate receipt and trigger notification
                $this->generateReceiptAndNotify($order);

                return response()->json(['success' => true, 'message' => 'Payment confirmed'], 200);

            } catch (\Exception $e) {
                Log::error('PayMongo webhook error', ['error' => $e->getMessage()]);
                // Return 200 to prevent PayMongo retry loops
                return response()->json(['success' => true, 'message' => 'Event acknowledged'], 200);
            }
        }

        private function generateReceiptAndNotify(Order $order): void
        {
            // Trigger order confirmation notification
            if ($order->cust_id) {
                $this->notifyCustomer((int) $order->cust_id,
                    '[PRIORITY] Payment confirmed for order ' . $order->ord_tag . '. Your order is now being processed.');
            }
            $this->notifyEmployeesByType(
                ['ADMIN', 'SUPER ADMIN'],
                '[PRIORITY] Payment received for order ' . $order->ord_tag . '.'
            );
        }

        protected function customerId(Request $json): ?int
        {
            $user = $json->user();
            if ($user instanceof Customer) {
                return (int) $user->getKey();
            }
            return null;
        }

        protected function notifyCustomer(int $custId, string $msg): void
        {
            \App\Models\CustNotif::create([
                'cust_id' => $custId,
                'custnotif_created' => now(),
                'custnotif_read' => null,
                'custnotif_msg' => $msg,
            ]);
        }

        protected function notifyEmployeesByType(array $types, string $msg): void
        {
            $employees = \App\Models\Employee::whereIn('emp_type', $types)
                ->whereNull('emp_disabled')
                ->whereNull('emp_deleted')
                ->get();
            foreach ($employees as $emp) {
                \App\Models\EmpNotif::create([
                    'emp_id' => $emp->emp_id,
                    'empnotif_created' => now(),
                    'empnotif_read' => null,
                    'empnotif_msg' => $msg,
                ]);
            }
        }

        protected function settingValue(string $key, $default = null)
        {
            return \App\Models\Setting::where('setting_key', $key)->value('setting_value') ?? $default;
        }
    }
