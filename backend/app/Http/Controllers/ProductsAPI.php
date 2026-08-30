<?php

    namespace App\Http\Controllers;

    use App\Models\Product;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;

    class ProductsAPI extends Controller
    {
        /*
            Adding product to catalog/inventory
            ----------
            JSON REQUEST

            prod_name - string (req)
            prod_tag - string (req)
            prod_categ - string (opt)
            prod_price - numeric (req)
            prod_qty - integer (req)
            prod_desc - string (opt)
        */
        public function addProduct(Request $json)
        {
            // Validate product details
            $validator = (new InputValidatorAPI()->addProduct($json));
            if ($validator) return $validator;

            try {
                $qty = $json->input('prod_qty') ?? 0;
                $product = Product::create([
                    'prod_created' => now(),
                    'prod_disabled' => null,
                    'prod_deleted' => null,
                    'prod_tag' => $json->input('prod_tag'),
                    'prod_name' => $json->input('prod_name'),
                    'prod_categ' => $json->input('prod_categ') ?? 'OTHERS',
                    'prod_price' => $json->input('prod_price') ?? 0.00,
                    'prod_qty' => $qty,
                    'prod_desc' => $json->input('prod_desc'),
                    'prod_peakqty' => $qty,
                    'prod_peaksold' => 0.00,
                    'prod_peakdate' => now(),
                    'prod_todayqty' => $qty,
                    'prod_todaysold' => 0.00,
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Product added to catalog successfully',
                    'data' => $product
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to add product',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Displaying orders from catalog/inventory
            ----------
            JSON REQUEST (Optional filters)

            prod_id - integer (opt)
        */
        public function displayOrders(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');

                $query = DB::table('orders')
                    ->join('items', 'orders.ord_id', '=', 'items.ord_id')
                    ->join('product', 'items.prod_id', '=', 'product.prod_id');

                if ($prodId) {
                    $query->where('product.prod_id', $prodId);
                }

                $orders = $query->select(
                    'orders.ord_id',
                    'orders.cust_id',
                    'orders.ord_created',
                    'orders.ord_completed',
                    'orders.ord_tag',
                    'orders.ord_status',
                    'orders.ord_rating',
                    'orders.ord_review',
                    'items.item_qty',
                    'items.item_amount',
                    'product.prod_name',
                    'product.prod_id'
                )->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Orders retrieved successfully',
                    'data' => $orders
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to retrieve orders',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Filtering the catalog/inventory
            ----------
            JSON REQUEST

            category - string (opt)
            status - string (opt) - e.g., 'active', 'disabled', 'deleted', 'all'
            stock - string (opt) - e.g., 'in_stock', 'out_of_stock', 'low_stock'
            low_stock_threshold - integer (opt, default: 5)
        */
        public function filterCatalog(Request $json)
        {
            try {
                $categ = $json->input('category');
                $status = $json->input('status');
                $stock = $json->input('stock');
                $lowStockThreshold = $json->input('low_stock_threshold', 5);

                $query = Product::query();

                if ($categ) {
                    $query->where('prod_categ', $categ);
                }

                if ($status === 'disabled') {
                    $query->whereNotNull('prod_disabled');
                } elseif ($status === 'deleted') {
                    $query->whereNotNull('prod_deleted');
                } elseif ($status === 'active' || !$status) {
                    $query->whereNull('prod_disabled')->whereNull('prod_deleted');
                }

                if ($stock === 'in_stock') {
                    $query->where('prod_qty', '>', 0);
                } elseif ($stock === 'out_of_stock') {
                    $query->where('prod_qty', 0);
                } elseif ($stock === 'low_stock') {
                    $query->where('prod_qty', '<', $lowStockThreshold);
                }

                $products = $query->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Catalog filtered successfully',
                    'data' => $products
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to filter catalog',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Removing product from catalog/inventory
            ----------
            JSON REQUEST

            prod_id - integer (req)
            hard_delete - boolean (opt, default: false)
        */
        public function removeProduct(Request $json)
        {
            $prodId = $json->input('prod_id');
            if (!$prodId) {
                return response()->json(['success' => false, 'message' => 'Product ID is required'], 400);
            }

            try {
                $product = Product::find($prodId);
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                if ($json->input('hard_delete')) {
                    $product->delete();
                    return response()->json([
                        'success' => true,
                        'message' => 'Product permanently removed from database'
                    ], 200);
                } else {
                    $product->update([
                        'prod_deleted' => now()
                    ]);
                    return response()->json([
                        'success' => true,
                        'message' => 'Product soft-deleted successfully',
                        'data' => $product
                    ], 200);
                }

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to remove product',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Searching products
            ----------
            JSON REQUEST

            q - string (opt)
        */
        public function searchProducts(Request $json)
        {
            try {
                $q = $json->input('q');
                $query = Product::whereNull('prod_deleted');

                if ($q) {
                    $query->where(function($query) use ($q) {
                        $query->where('prod_name', 'ilike', "%{$q}%")
                              ->orWhere('prod_tag', 'ilike', "%{$q}%")
                              ->orWhere('prod_desc', 'ilike', "%{$q}%");
                    });
                }

                $products = $query->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Search completed',
                    'data' => $products
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Search failed',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Sorting products
            ----------
            JSON REQUEST

            sort_by - string (opt) - e.g., 'name', 'price', 'qty', 'created', 'popularity'
            order - string (opt) - 'asc' or 'desc'
        */
        public function sortProducts(Request $json)
        {
            try {
                $sortBy = $json->input('sort_by', 'name');
                $order = $json->input('order', 'asc');

                $columnMap = [
                    'name' => 'prod_name',
                    'price' => 'prod_price',
                    'qty' => 'prod_qty',
                    'created' => 'prod_created',
                    'popularity' => 'prod_peaksold'
                ];

                $column = $columnMap[$sortBy] ?? 'prod_name';
                $order = strtolower($order) === 'desc' ? 'desc' : 'asc';

                $products = Product::whereNull('prod_deleted')
                    ->orderBy($column, $order)
                    ->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Products sorted successfully',
                    'data' => $products
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to sort products',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating product details
            ----------
            JSON REQUEST

            prod_id - integer (req)
            prod_name - string (opt)
            prod_tag - string (opt)
            prod_categ - string (opt)
            prod_price - numeric (opt)
            prod_qty - integer (opt)
            prod_desc - string (opt)
        */
        public function updateProductDetails(Request $json)
        {
            $validator = (new InputValidatorAPI()->updateProductDetails($json));
            if ($validator) return $validator;

            try {
                $product = Product::find($json->input('prod_id'));
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                $updateData = [];
                $fields = ['prod_name', 'prod_tag', 'prod_categ', 'prod_price', 'prod_qty', 'prod_desc'];

                foreach ($fields as $field) {
                    if ($json->has($field)) {
                        $updateData[$field] = $json->input($field);
                    }
                }

                // If quantity changes, keep track of peak qty
                if (isset($updateData['prod_qty'])) {
                    if ($updateData['prod_qty'] > $product->prod_peakqty) {
                        $updateData['prod_peakqty'] = $updateData['prod_qty'];
                    }
                }

                $product->update($updateData);

                return response()->json([
                    'success' => true,
                    'message' => 'Product details updated successfully',
                    'data' => $product
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update product details',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Viewing product details
            ----------
            JSON REQUEST

            prod_id - integer (opt)
            prod_tag - string (opt)
        */
        public function viewProductDetails(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');
                $prodTag = $json->input('prod_tag');

                $query = Product::query();

                if ($prodId) {
                    $query->where('prod_id', $prodId);
                } elseif ($prodTag) {
                    $query->where('prod_tag', $prodTag);
                } else {
                    return response()->json([
                        'success' => false,
                        'message' => 'Either prod_id or prod_tag must be provided'
                    ], 400);
                }

                $product = $query->first();

                if (!$product) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Product not found'
                    ], 404);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Product details retrieved successfully',
                    'data' => $product
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to retrieve product details',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Unlisting a product (custom option for updating status)
            ----------
            JSON REQUEST

            prod_id - integer (req)
        */
        public function unlistProduct(Request $json)
        {
            $prodId = $json->input('prod_id');
            if (!$prodId) {
                return response()->json(['success' => false, 'message' => 'Product ID is required'], 400);
            }

            try {
                $product = Product::find($prodId);
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                $product->update([
                    'prod_disabled' => now()
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Product unlisted successfully',
                    'data' => $product
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to unlist product',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Selling/listing a product back in catalog
            ----------
            JSON REQUEST

            prod_id - integer (req)
        */
        public function sellProduct(Request $json)
        {
            $prodId = $json->input('prod_id');
            if (!$prodId) {
                return response()->json(['success' => false, 'message' => 'Product ID is required'], 400);
            }

            try {
                $product = Product::find($prodId);
                if (!$product) {
                    return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                }

                $product->update([
                    'prod_disabled' => null,
                    'prod_deleted' => null
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Product listed for sale successfully',
                    'data' => $product
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to list product for sale',
                    'error' => $e->getMessage()
                ], 500);
            }
        }
    }
