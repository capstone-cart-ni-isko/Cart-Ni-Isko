<?php

    namespace App\Http\Controllers;

    use App\Models\Appointment;
    use App\Models\Customer;
    use App\Models\Delivery;
    use App\Models\Item;
    use App\Models\Order;
    use App\Models\Parcel;
    use App\Models\Payment;
    use App\Models\Pickup;
    use App\Models\Product;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;
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
                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }

                $subtotal = (float)$order->items->sum('item_amount');
                $dispatchFee = 0.00;
                $dispatchDetails = [];

                if ($dispatchType === 'pickup') {
                    $appointId = $json->input('appoint_id');
                    $appointment = null;
                    if ($appointId) {
                        $appointment = Appointment::where('appoint_id', $appointId)->first();
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
                        $deliverAddress = 'University Campus';
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
                $payGiven = (float)$json->input('pay_given');

                $order = Order::with(['items.product', 'customer'])->where('ord_id', $ordId)->first();
                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }

                $subtotal = (float)$order->items->sum('item_amount');
                $dispatchFee = 0.00;

                if ($dispatchType === 'pickup') {
                    $dispatchFee = 0.00;
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
                $payRef = $json->input('pay_ref') ?? ('PAY-' . strtoupper(Str::random(10)));

                // 1. Create Payment Record
                $payment = Payment::create([
                    'pay_created' => now(),
                    'pay_ref'     => $payRef,
                    'pay_given'   => $payGiven,
                    'pay_due'     => $totalDue,
                    'pay_change'  => $payChange,
                ]);

                $dispatchResult = [];

                // 2. Process Dispatch Modality
                if ($dispatchType === 'pickup') {
                    $appointId = $json->input('appoint_id');
                    $pickup = Pickup::create([
                        'ord_id'           => $ordId,
                        'appoint_id'       => $appointId ?? null,
                        'pay_id'           => $payment->pay_id,
                        'pickup_created'   => now(),
                        'pickup_completed' => null,
                    ]);

                    $order->update([
                        'ord_status' => 'TO CLAIM'
                    ]);

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
                        $deliverAddress = 'University Campus';
                    }

                    $estDate = ($speed === 'priority')
                        ? now()->addHours(24)
                        : (($speed === 'saver') ? now()->addDays(5) : now()->addDays(2));

                    $delivery = Delivery::create([
                        'deliver_created' => now(),
                        'deliver_deleted' => null,
                        'delvier_ref'     => 'DEL-' . strtoupper(Str::random(8)),
                        'deliver_date'    => $estDate,
                        'deliver_address' => $deliverAddress,
                        'deliver_status'  => 'TRANSIT',
                        'deliver_qr'      => 'QR-DEL-' . strtoupper(Str::random(10)),
                    ]);

                    $parcel = Parcel::create([
                        'ord_id'           => $ordId,
                        'deliver_id'       => $delivery->deliver_id,
                        'pay_id'           => $payment->pay_id,
                        'parcel_created'   => now(),
                        'parcel_completed' => null,
                    ]);

                    $order->update([
                        'ord_status' => 'TO RECEIVE'
                    ]);

                    $dispatchResult = [
                        'modality'        => 'DELIVERY',
                        'delivery_id'     => $delivery->deliver_id,
                        'parcel_id'       => $parcel->parcel_id,
                        'deliver_ref'     => $delivery->delvier_ref,
                        'deliver_address' => $delivery->deliver_address,
                        'deliver_date'    => $delivery->deliver_date,
                        'deliver_qr'      => $delivery->deliver_qr,
                    ];
                }

                // 3. Update Product Inventory Stocks & Peak Sales
                foreach ($order->items as $item) {
                    $product = Product::where('prod_id', $item->prod_id)->first();
                    if ($product) {
                        $newQty = max(0, $product->prod_qty - $item->item_qty);
                        $product->update([
                            'prod_qty'       => $newQty,
                            'prod_peaksold'  => (float)$product->prod_peaksold + (float)$item->item_amount,
                            'prod_todaysold' => (float)$product->prod_todaysold + (float)$item->item_amount,
                        ]);
                    }
                }

                // 4. Decrement Customer Cart Counter
                $customer = Customer::where('cust_id', $order->cust_id)->first();
                if ($customer && $customer->cust_cart > 0) {
                    $customer->decrement('cust_cart');
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Payment integrated and order checkout completed successfully',
                    'data' => [
                        'payment'  => $payment,
                        'dispatch' => $dispatchResult,
                        'order'    => $order->fresh(),
                    ]
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to integrate payment',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }
    }
