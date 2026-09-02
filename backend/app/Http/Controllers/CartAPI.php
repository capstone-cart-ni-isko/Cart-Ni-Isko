<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Item;
    use App\Models\Order;
    use App\Models\Product;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;
    use Illuminate\Support\Str;

    class CartAPI extends Controller
    {
        /*
            Adding orders to cart/order list
            ----------
            JSON REQUEST

            cust_id - integer (req)
            prod_id - integer (opt, if adding single product)
            item_qty - integer (opt, default: 1)
            item_amount - numeric (opt)
            items - array of objects (opt, if adding multiple products)
                [ {"prod_id": 1, "item_qty": 2, "item_amount": 100.00} ]
            ord_tag - string (opt)
            ord_status - string (opt, default: 'TO PROCESS')
        */
        public function addOrder(Request $json)
        {
            $validator = (new InputValidatorAPI())->addOrder($json);
            if ($validator) return $validator;

            try {
                $custId = $json->input('cust_id');

                // Verify customer exists
                $customer = Customer::where('cust_id', $custId)->first();
                if (!$customer) {
                    return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
                }

                // Prepare items list
                $itemsInput = [];
                if ($json->has('items') && is_array($json->input('items'))) {
                    $itemsInput = $json->input('items');
                } elseif ($json->has('prod_id')) {
                    $itemsInput[] = [
                        'prod_id'     => $json->input('prod_id'),
                        'item_qty'    => $json->input('item_qty', 1),
                        'item_amount' => $json->input('item_amount', null)
                    ];
                } else {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product details or items array is required to create an order'
                    ], 400);
                }

                // Validate all products in the items list
                $validatedItems = [];
                foreach ($itemsInput as $item) {
                    if (!isset($item['prod_id'])) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Each item must have a valid prod_id'
                        ], 400);
                    }

                    $product = Product::where('prod_id', $item['prod_id'])->first();
                    if (!$product) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Product with ID ' . $item['prod_id'] . ' not found'
                        ], 404);
                    }

                    if ($product->prod_disabled || $product->prod_deleted) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Product "' . $product->prod_name . '" is no longer offered'
                        ], 400);
                    }

                    $qty = isset($item['item_qty']) && $item['item_qty'] > 0 ? (int)$item['item_qty'] : 1;
                    $amount = isset($item['item_amount']) && $item['item_amount'] !== null
                        ? (float)$item['item_amount']
                        : ((float)$product->prod_price * $qty);

                    $validatedItems[] = [
                        'prod_id'     => $product->prod_id,
                        'prod_name'   => $product->prod_name,
                        'item_qty'    => $qty,
                        'item_amount' => $amount
                    ];
                }

                // Generate order tag
                $ordTag = $json->input('ord_tag') ?? ('ORD-' . strtoupper(Str::random(8)));
                $ordStatus = $json->input('ord_status', 'TO PROCESS');

                // Create Order record
                $order = Order::create([
                    'cust_id'       => $custId,
                    'ord_created'   => now(),
                    'ord_completed' => null,
                    'ord_tag'       => $ordTag,
                    'ord_status'    => $ordStatus,
                    'ord_rating'    => 0,
                    'ord_review'    => null,
                ]);

                // Create Item records
                $createdItems = [];
                foreach ($validatedItems as $vItem) {
                    $itemRecord = Item::create([
                        'ord_id'      => $order->ord_id,
                        'prod_id'     => $vItem['prod_id'],
                        'item_qty'    => $vItem['item_qty'],
                        'item_amount' => $vItem['item_amount'],
                    ]);
                    $createdItems[] = array_merge($itemRecord->toArray(), ['prod_name' => $vItem['prod_name']]);
                }

                // Update customer cart & orders counters
                $customer->increment('cust_cart');
                $customer->increment('cust_orders');

                return response()->json([
                    'success' => true,
                    'message' => 'Order created and added to cart successfully',
                    'data' => [
                        'order' => $order,
                        'items' => $createdItems
                    ]
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to add order',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Displaying orders
            ----------
            JSON REQUEST / Query Params

            cust_id - integer (opt)
            ord_status - string (opt)
            ord_id - integer (opt)
        */
        public function displayOrders(Request $json)
        {
            try {
                $query = Order::with(['items.product', 'customer']);

                if ($json->has('cust_id')) {
                    $query->where('cust_id', $json->input('cust_id'));
                }

                if ($json->has('ord_status')) {
                    $query->where('ord_status', $json->input('ord_status'));
                }

                if ($json->has('ord_id')) {
                    $query->where('ord_id', $json->input('ord_id'));
                }

                $orders = $query->orderBy('ord_created', 'desc')->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Orders retrieved successfully',
                    'data'    => $orders
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display orders',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Searching orders
            ----------
            JSON REQUEST / Query Params

            q - string (opt)
            cust_id - integer (opt)
        */
        public function searchOrders(Request $json)
        {
            try {
                $q = $json->input('q', '');
                $query = Order::with(['items.product', 'customer']);

                if ($json->has('cust_id')) {
                    $query->where('cust_id', $json->input('cust_id'));
                }

                if (!empty($q)) {
                    $query->where(function($builder) use ($q) {
                        $builder->where('ord_tag', 'like', "%{$q}%")
                                ->orWhere('ord_status', 'like', "%{$q}%")
                                ->orWhere('ord_review', 'like', "%{$q}%")
                                ->orWhereHas('items.product', function($pQuery) use ($q) {
                                    $pQuery->where('prod_name', 'like', "%{$q}%")
                                           ->orWhere('prod_tag', 'like', "%{$q}%");
                                });
                    });
                }

                $orders = $query->orderBy('ord_created', 'desc')->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Orders search completed',
                    'data'    => $orders
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to search orders',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Sorting orders
            ----------
            JSON REQUEST / Query Params

            sort_by - string (opt: date | status | id | rating | tag, default: date)
            order - string (opt: asc | desc, default: desc)
            cust_id - integer (opt)
        */
        public function sortOrders(Request $json)
        {
            try {
                $sortBy = $json->input('sort_by', 'date');
                $orderDir = strtolower($json->input('order', 'desc')) === 'asc' ? 'asc' : 'desc';

                $columnMap = [
                    'date'    => 'ord_created',
                    'status'  => 'ord_status',
                    'id'      => 'ord_id',
                    'rating'  => 'ord_rating',
                    'tag'     => 'ord_tag'
                ];

                $column = $columnMap[$sortBy] ?? 'ord_created';

                $query = Order::with(['items.product', 'customer']);

                if ($json->has('cust_id')) {
                    $query->where('cust_id', $json->input('cust_id'));
                }

                $orders = $query->orderBy($column, $orderDir)->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Orders sorted successfully',
                    'data'    => $orders
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to sort orders',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Removing orders
            ----------
            JSON REQUEST

            ord_id - integer (req)
        */
        public function removeOrder(Request $json)
        {
            $validator = (new InputValidatorAPI())->removeOrder($json);
            if ($validator) return $validator;

            try {
                $ordId = $json->input('ord_id');
                $order = Order::where('ord_id', $ordId)->first();

                if (!$order) {
                    return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                }

                $custId = $order->cust_id;

                // Delete associated items first
                Item::where('ord_id', $ordId)->delete();

                // Delete order
                $order->delete();

                // Decrement customer's cart and orders counter if positive
                $customer = Customer::where('cust_id', $custId)->first();
                if ($customer) {
                    if ($customer->cust_cart > 0) {
                        $customer->decrement('cust_cart');
                    }
                    if ($customer->cust_orders > 0) {
                        $customer->decrement('cust_orders');
                    }
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Order removed successfully',
                    'data' => [
                        'ord_id'  => $ordId,
                        'cust_id' => $custId
                    ]
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to remove order',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }
    }
