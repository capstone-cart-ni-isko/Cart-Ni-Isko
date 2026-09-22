<?php

    namespace App\Http\Controllers;

    use App\Models\Delivery;
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
                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
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
                $trackId   = $json->input('track_id');
                $trackType = strtolower($json->input('track_type'));
                $status    = strtoupper($json->input('status'));

                if ($trackType === 'pickup') {
                    $pickup = Pickup::where('pickup_id', $trackId)->first();
                    if (!$pickup) {
                        return response()->json(['success' => false, 'message' => 'Pickup record not found'], 404);
                    }

                    // Update order status based on pickup status
                    $orderStatus = match ($status) {
                        'CLAIMED'   => 'CLAIMED',
                        'UNCLAIMED' => 'UNCLAIMED',
                        'CANCELLED' => 'CANCELLED',
                        default     => null,
                    };

                    if ($orderStatus) {
                        Order::where('ord_id', $pickup->ord_id)->update([
                            'ord_status' => $orderStatus
                        ]);
                    }

                    // If claimed, mark pickup as completed
                    if ($status === 'CLAIMED') {
                        $pickup->update(['pickup_completed' => now()]);
                    }

                    return response()->json([
                        'success' => true,
                        'message' => 'Pickup fulfillment status updated successfully',
                        'data' => [
                            'track_type'   => 'PICKUP',
                            'pickup'       => $pickup->fresh(),
                            'order_status' => $orderStatus ?? $status,
                        ]
                    ], 200);
                } else {
                    // For delivery: track_id is the delivery_id
                    $delivery = Delivery::where('deliver_id', $trackId)->first();
                    if (!$delivery) {
                        return response()->json(['success' => false, 'message' => 'Delivery record not found'], 404);
                    }

                    $delivery->update(['deliver_status' => $status]);

                    // Update parent order status
                    $parcel = Parcel::where('deliver_id', $trackId)->first();
                    $orderStatus = null;
                    if ($parcel) {
                        $orderStatus = match ($status) {
                            'DELIVERED' => 'CLAIMED',
                            'RETURNED'  => 'RETURNED',
                            'CANCELLED' => 'CANCELLED',
                            default     => null,
                        };
                        if ($orderStatus) {
                            Order::where('ord_id', $parcel->ord_id)->update([
                                'ord_status' => $orderStatus
                            ]);
                        }
                    }

                    return response()->json([
                        'success' => true,
                        'message' => 'Delivery fulfillment status updated successfully',
                        'data' => [
                            'track_type'    => 'DELIVERY',
                            'delivery'      => $delivery->fresh(),
                            'order_status'  => $orderStatus ?? $status,
                        ]
                    ], 200);
                }

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
                $trackId   = $json->input('track_id');
                $trackType = strtolower($json->input('track_type'));

                if ($trackType === 'pickup') {
                    $pickup = Pickup::where('pickup_id', $trackId)->first();
                    if (!$pickup) {
                        return response()->json(['success' => false, 'message' => 'Pickup record not found'], 404);
                    }

                    $pickup->update(['pickup_completed' => now()]);

                    Order::where('ord_id', $pickup->ord_id)->update([
                        'ord_status'    => 'CLAIMED',
                        'ord_completed' => now(),
                    ]);

                    return response()->json([
                        'success' => true,
                        'message' => 'Pickup fulfillment track closed successfully',
                        'data' => [
                            'track_type' => 'PICKUP',
                            'pickup'     => $pickup->fresh(),
                            'ord_status' => 'CLAIMED',
                        ]
                    ], 200);
                } else {
                    $parcel = Parcel::where('parcel_id', $trackId)->first();
                    if (!$parcel) {
                        return response()->json(['success' => false, 'message' => 'Parcel record not found'], 404);
                    }

                    $parcel->update(['parcel_completed' => now()]);

                    // Mark delivery as delivered
                    $delivery = Delivery::where('deliver_id', $parcel->deliver_id)->first();
                    if ($delivery) {
                        $delivery->update(['deliver_status' => 'DELIVERED']);
                    }

                    Order::where('ord_id', $parcel->ord_id)->update([
                        'ord_status'    => 'CLAIMED',
                        'ord_completed' => now(),
                    ]);

                    return response()->json([
                        'success' => true,
                        'message' => 'Delivery fulfillment track closed successfully',
                        'data' => [
                            'track_type' => 'DELIVERY',
                            'parcel'     => $parcel->fresh(),
                            'delivery'   => $delivery ? $delivery->fresh() : null,
                            'ord_status' => 'CLAIMED',
                        ]
                    ], 200);
                }

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to close fulfillment track',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }
    }
