<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Product;
use App\Models\Wishlist;
use Illuminate\Http\Request;

/**
 * DOMAIN 24 (WISHLIST).
 *
 * Removal is a soft delete on `wish_hidden` (REQ-WISHLIST-02 - wish_hidden is
 * the live column, a timestamptz that is NULL while the row is visible), the
 * display only ever shows rows with wish_hidden IS NULL ordered wish_created
 * DESC (FLOW-WISHLIST-03), and re-adding a hidden row resurrects it instead
 * of inserting a duplicate.
 *
 * "Transfer to order" no longer builds an orders-CART row: it creates a live
 * bag line through CartAPI (one row per product variation), so the wishlist
 * item always lands in the bag the checkout flow reads.
 */
class WishlistAPI extends Controller
{
    /*
        Adding a product to the wishlist
        ----------
        JSON REQUEST

        cust_id - integer (req)
        prod_id - integer or string prod_tag (req)
        item_qty / item_amount - accepted for legacy clients, the live
            wishlist table has no quantity columns and ignores them
    */
    public function addWishlistItem(Request $json)
    {
        $validator = (new InputValidatorAPI())->addWishlistItem($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }

            $customer = Customer::where('cust_id', $custId)->first();
            if (!$customer) {
                return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
            }

            $product = $this->resolveProduct($json->input('prod_id'));
            if (!$product) {
                return response()->json(['success' => false, 'message' => 'Product not found'], 404);
            }

            $resolvedProdId = $product->prod_id;

            // One row per (cust, prod): a visible row is skipped, a hidden
            // (wish_hidden) row is resurrected - never a duplicate insert.
            $existing = Wishlist::where('cust_id', $custId)
                ->where('prod_id', $resolvedProdId)
                ->first();

            $created = false;
            if ($existing && $existing->wish_hidden === null) {
                $message = 'Item already in wishlist';
            } else {
                if ($existing) {
                    // Resurrect the hidden row (query builder: the wishlist
                    // composite key is not a Eloquent primary key everywhere).
                    Wishlist::where('cust_id', $custId)
                        ->where('prod_id', $resolvedProdId)
                        ->update([
                            'wish_hidden' => null,
                            'wish_created' => now(),
                        ]);
                } else {
                    Wishlist::create([
                        // No sequence for wish_id on the live table.
                        'wish_id'      => $this->nextId('wishlist', 'wish_id'),
                        'cust_id'     => $custId,
                        'prod_id'     => $resolvedProdId,
                        'wish_created' => now(),
                        'wish_hidden' => null,
                    ]);
                }
                $created = true;
                $message = 'Item added to wishlist successfully';
            }

            $this->syncWishlistCounter($custId);
            $this->logCustomer($custId, 'edit', 'POST /api/wishlist/add');

            return response()->json([
                'success' => true,
                'message' => $message,
                'data' => [
                    'cust_id' => $custId,
                    'prod_id' => $resolvedProdId,
                    'cust_wishlist_count' => (int) (Customer::where('cust_id', $custId)->value('cust_wishlist') ?? 0),
                ]
            ], $created ? 201 : 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to add wishlist item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /*
        Moving a wishlist item into the bag (FLOW-WISHLIST-06)
        ----------
        JSON REQUEST

        cust_id    - integer (req)
        prod_id    - integer or string prod_tag (req)
        item_qty   - integer (opt, default: 1)
        prodvar_id - integer (opt, explicit variation)
        size       - string (opt)
        color      - string|{name,image} (opt)
        item_amount- numeric (opt, UNIT amount)
    */
    public function addWishlistToOrder(Request $json)
    {
        $validator = (new InputValidatorAPI())->addWishlistToOrder($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }

            $product = $this->resolveProduct($json->input('prod_id'));
            if (!$product) {
                return response()->json(['success' => false, 'message' => 'Product not found'], 404);
            }

            if (!$product->isBuyable()) {
                return response()->json(['success' => false, 'message' => 'Product is no longer offered'], 400);
            }

            $wishlistItem = Wishlist::where('cust_id', $custId)
                ->where('prod_id', $product->prod_id)
                ->whereNull('wish_hidden')
                ->first();
            if (!$wishlistItem) {
                return response()->json(['success' => false, 'message' => 'Wishlist item not found.'], 404);
            }

            // Same variation resolution as POST /cart/add.
            $prodvar = CartAPI::resolveVariation(
                $product,
                $json->input('prodvar_id'),
                $json->input('size'),
                $json->input('color')
            );
            if (!$prodvar) {
                return response()->json([
                    'success' => false,
                    'message' => 'Product "' . $product->prod_name . '" is no longer offered',
                ], 400);
            }

            $qty = max(1, (int) $json->input('item_qty', 1));
            $sent = $json->input('item_amount');
            $unit = $sent !== null && $sent !== ''
                ? round((float) $sent, 2)
                : round((float) $product->prod_price + (float) ($prodvar->prodvar_markup ?? 0), 2);

            // Wishlist and bag membership stay independent: the saved row is
            // kept, the bag gains one live line for this variation.
            CartAPI::upsertBagLine($custId, $prodvar, $qty, $unit);
            CartAPI::syncCartCounter($custId);
            $this->logCustomer($custId, 'edit', 'POST /api/wishlist/to_order');

            return response()->json([
                'success' => true,
                'message' => 'Wishlist item added to cart successfully',
                'data'    => CartAPI::cartEnvelope($custId),
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to add wishlist item to order',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /*
        Displaying the wishlist
        ----------
        JSON REQUEST

        cust_id - integer (req)
    */
    public function displayWishlist(Request $json)
    {
        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }
            if (!$custId) {
                return response()->json(['success' => false, 'message' => 'Customer ID is required'], 400);
            }

            if (!Customer::where('cust_id', $custId)->exists()) {
                return response()->json(['success' => false, 'message' => 'Customer not found'], 404);
            }

            // FLOW-WISHLIST-03: hidden rows stay hidden, newest first.
            // Unavailable rows REMAIN in the list (FLOW-WISHLIST-07): each
            // payload carries `available` so the frontend can label them.
            $items = Wishlist::with('product')
                ->where('cust_id', $custId)
                ->whereNull('wish_hidden')
                ->orderByDesc('wish_created')
                ->get();

            $this->syncWishlistCounter($custId);

            return response()->json([
                'success' => true,
                'message' => 'Wishlist retrieved successfully',
                'data' => [
                    'cust_id' => $custId,
                    'wishlist_count' => $items->count(),
                    'items' => $items->map(fn ($wish) => $this->wishlistPayload($wish))->values()->all(),
                ]
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to display wishlist',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /*
        Removing a wishlist item (soft delete - REQ-WISHLIST-02)
        ----------
        JSON REQUEST

        cust_id - integer (req)
        prod_id - integer or string prod_tag (req)
    */
    public function removeWishlistItem(Request $json)
    {
        $validator = (new InputValidatorAPI())->removeWishlistItem($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }

            $product = $this->resolveProduct($json->input('prod_id'));
            $resolvedProdId = $product ? $product->prod_id : $json->input('prod_id');

            // REQ-WISHLIST-02: stamp wish_hidden, never ->delete().
            Wishlist::where('cust_id', $custId)
                ->where('prod_id', $resolvedProdId)
                ->whereNull('wish_hidden')
                ->update(['wish_hidden' => now()]);

            $this->syncWishlistCounter($custId);
            $this->logCustomer($custId, 'edit', 'DELETE /api/wishlist/remove');

            return response()->json([
                'success' => true,
                'message' => 'Item removed from wishlist successfully',
                'data' => [
                    'cust_id' => $custId,
                    'prod_id' => $resolvedProdId,
                ]
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to remove wishlist item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /*
        Wishlist row lookup by id or tag
        ----------
        The live wishlist has no quantity columns: item_qty / item_amount are
        accepted and ignored so older clients keep getting a 200.
    */
    public function updateWishlistItem(Request $json)
    {
        $validator = (new InputValidatorAPI())->updateWishlistItem($json);
        if ($validator) return $validator;

        try {
            $custId = $this->customerId($json);
            if ($custId === null || (int) $json->input('cust_id') !== $custId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Customer account mismatch.',
                ], 403);
            }

            $product = $this->resolveProduct($json->input('prod_id'));
            if (!$product) {
                return response()->json(['success' => false, 'message' => 'Product not found.'], 404);
            }

            $this->logCustomer($custId, 'edit', 'PUT /api/wishlist/update');

            return response()->json([
                'success' => true,
                'message' => 'Wishlist item details updated successfully',
                'data' => [
                    'cust_id' => $custId,
                    'prod_id' => $product->prod_id,
                ]
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to update wishlist item',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // ==========================================
    // HELPERS
    // ==========================================

    /**
     * One wishlist row: the stored fields, the presented product and the
     * FLOW-WISHLIST-07 `available` flag (product exists, not disabled, not
     * deleted). Unavailable rows are still returned.
     */
    protected function wishlistPayload(Wishlist $wish): array
    {
        $product = $wish->product;
        $available = $product !== null
            && $product->prod_disabled === null
            && $product->prod_deleted === null;

        $payload = $wish->toArray();
        unset($payload['product']);

        $payload['prod_id']     = $wish->prod_id;
        $payload['available']   = $available;
        $payload['unavailable'] = !$available;
        $payload['product']     = $product ? ProductsAPI::present($product) : null;

        return $payload;
    }

    /** cust_wishlist mirrors the number of live (wish_hidden IS NULL) rows. */
    protected function syncWishlistCounter(int $custId): void
    {
        $count = Wishlist::where('cust_id', $custId)->whereNull('wish_hidden')->count();

        Customer::where('cust_id', $custId)->update(['cust_wishlist' => $count]);
    }

    /** `prod_id` may also arrive as a `prod_tag`; a bad key never hits SQL. */
    protected function resolveProduct($prodKey): ?Product
    {
        if ($prodKey === null || $prodKey === '') {
            return null;
        }

        if (is_numeric($prodKey)) {
            $product = Product::find((int) $prodKey);
            if ($product) {
                return $product;
            }
        }

        return Product::where('prod_tag', (string) $prodKey)->first();
    }
}
