<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Order;
    use App\Models\Product;
    use App\Models\Review;
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\DB;

    /**
     * DOMAIN 13 (REVIEWS).
     *
     * Reviews live in `reviews`; there is no rating column, so the rating
     * travels inside rev_msg as a "<rating>|<message>" token (see
     * Review::compose). Pending = rev_approved IS NULL, approved = a stamp,
     * rejected = rev_msg prefixed with "[REJECTED] |" which keeps the row for
     * audit (REQ-MANAGE_REV-03) while hiding it from customers
     * (FLOW-MANAGE_REV-07).
     *
     * Every read answers with BOTH the canonical fields (rating / message) and
     * the legacy order-shaped ones the current frontend still renders
     * (ord_rating / ord_review / ord_completed / ord_id / status).
     */
    class ReviewsAPI extends Controller
    {
        // Order statuses that do not represent a completed purchase. The new
        // vocabulary keeps the old meaning: a cart still being processed, a
        // cancellation request and a cancelled order never count.
        protected const NOT_PURCHASED = ['processing', 'to cancel', 'cancelled'];

        // ==========================================
        // ENCODING / PRESENTATION
        // ==========================================

        protected function countsAsPurchase($status): bool
        {
            return ! in_array(strtolower(trim((string) $status)), self::NOT_PURCHASED, true);
        }

        /** Splits rev_msg into its rating token, text and rejection marker. */
        protected function decode(?string $revMsg): array
        {
            $raw = (string) $revMsg;
            $rejected = false;

            if (str_starts_with($raw, '[REJECTED]')) {
                $rejected = true;
                $raw = ltrim(substr($raw, strlen('[REJECTED]')));
                if (str_starts_with($raw, '|')) {
                    $raw = substr($raw, 1);
                }
            }

            $parts = explode('|', $raw, 2);
            $rating = is_numeric($parts[0] ?? '') ? max(1, min(5, (int) $parts[0])) : 0;

            if (count($parts) === 2) {
                $text = $parts[1];
            } else {
                $text = $rating > 0 ? '' : $raw;
            }

            return ['rating' => $rating, 'text' => $text, 'rejected' => $rejected];
        }

        /** Canonical + legacy aliases for one review row. */
        protected function present(Review $review, ?int $ordId = null): array
        {
            $decoded = $this->decode($review->rev_msg);
            $status = $review->rev_approved !== null
                ? 'approved'
                : ($decoded['rejected'] ? 'rejected' : 'pending');

            // The admin queue still derives its state from ord_review, so a
            // rejected row keeps the historical sentinel there while the real
            // text stays available under `message` for audit.
            $legacyText = $status === 'rejected' ? '[REVIEW CENSORED]' : $decoded['text'];

            // FLOW-MANAGE_REV-02: the admin list shows product name and
            // customer name per row (eager-loaded by displayReviews).
            $product  = $review->product;
            $customer = $review->customer;

            return [
                'rev_id'       => (int) $review->rev_id,
                'cust_id'      => (int) $review->cust_id,
                'prod_id'      => (int) $review->prod_id,
                'rev_created'  => optional($review->rev_created)->toDateTimeString(),
                'rev_approved' => optional($review->rev_approved)->toDateTimeString(),

                // FLOW-MANAGE_REV-02 / FLOW-MANAGE_REV-04 display columns
                'prod_name'    => $product?->prod_name,
                'cust_name'    => $customer
                    ? trim(($customer->cust_nickname ?: $customer->cust_givname) . ' ' . $customer->cust_surname)
                    : null,
                // Canonical read model
                'rating'       => $decoded['rating'],
                'message'      => $decoded['text'],
                'status'       => $status,

                // Legacy order-shaped aliases (spec section 6)
                'ord_id'       => $ordId,
                'ord_rating'   => $decoded['rating'],
                'ord_review'   => $legacyText,
                // The old list showed the order's completion date; the review
                // timestamp is the only equivalent the new schema carries.
                'ord_completed' => optional($review->rev_created)->toDateTimeString(),
            ];
        }

        // ==========================================
        // RESOLUTION HELPERS
        // ==========================================

        // The customer account behind the bearer token, or a 403 response
        protected function requireCustomer(Request $json)
        {
            $user = $json->user('api');
            if (! $user instanceof Customer) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only customer accounts may submit reviews',
                ], 403);
            }

            return $user;
        }

        /** Product ids inside one order: orders -> items -> bag -> prodvar. */
        protected function productIdsForOrder(int $ordId): array
        {
            return DB::table('items')
                ->join('bag', 'bag.bag_id', '=', 'items.bag_id')
                ->join('prodvar', 'prodvar.prodvar_id', '=', 'bag.prodvar_id')
                ->where('items.ord_id', $ordId)
                ->distinct()
                ->pluck('prodvar.prod_id')
                ->map(fn ($id) => (int) $id)
                ->all();
        }

        /**
         * Newest order per (customer, product) so the legacy ord_id handle can
         * travel with every review row without an N+1.
         */
        protected function orderMap($reviews): array
        {
            $reviews = collect($reviews);
            if ($reviews->isEmpty()) {
                return [];
            }

            $custIds = $reviews->pluck('cust_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
            $prodIds = $reviews->pluck('prod_id')->map(fn ($id) => (int) $id)->unique()->values()->all();

            $rows = DB::table('orders')
                ->join('items', 'items.ord_id', '=', 'orders.ord_id')
                ->join('bag', 'bag.bag_id', '=', 'items.bag_id')
                ->join('prodvar', 'prodvar.prodvar_id', '=', 'bag.prodvar_id')
                ->whereIn('orders.cust_id', $custIds)
                ->whereIn('prodvar.prod_id', $prodIds)
                ->groupBy('orders.cust_id', 'prodvar.prod_id')
                ->select('orders.cust_id as cust_id', 'prodvar.prod_id as prod_id')
                ->selectRaw('MAX(orders.ord_id) as ord_id')
                ->get();

            $map = [];
            foreach ($rows as $row) {
                $map[(int) $row->cust_id][(int) $row->prod_id] = (int) $row->ord_id;
            }

            return $map;
        }

        /** The order id behind one review, from the map built above. */
        protected function orderIdFor(Review $review, array $map): ?int
        {
            return $map[(int) $review->cust_id][(int) $review->prod_id] ?? null;
        }

        /**
         * Resolves the review a payload points at. `rev_id` is canonical;
         * the legacy dialect sends `ord_id` (+ optional prod_id), which is
         * mapped back through items -> bag -> prodvar.
         *
         * The legacy handle is ambiguous by construction: one order buys
         * several products, so without `prod_id` the newest row of ANY of
         * them was silently picked - moderating (or deleting) the wrong
         * review. When the order holds more than one product and no `prod_id`
         * was sent, the caller is told to disambiguate instead of guessing.
         *
         * @return Review|\Illuminate\Http\JsonResponse|null
         */
        protected function resolveReview(Request $json)
        {
            $revId = $json->input('rev_id');
            if ($revId !== null && $revId !== '') {
                return Review::find($revId);
            }

            $ordId = $json->input('ord_id');
            if (! $ordId) {
                return null;
            }

            $order = Order::find($ordId);
            if (! $order) {
                return null;
            }

            $prodIds = $this->productIdsForOrder((int) $order->ord_id);
            $prodId = $json->input('prod_id');
            if ($prodId) {
                $prodIds = [(int) $prodId];
            }
            if ($prodIds === []) {
                return null;
            }

            if (count($prodIds) > 1 && ! $prodId) {
                return response()->json([
                    'success' => false,
                    'message' => 'This order holds ' . count($prodIds)
                        . ' products. Send `prod_id` (or the rev_id of the review) so the right review is targeted.',
                    'code'    => 'AMBIGUOUS_REVIEW',
                    'prod_ids'=> $prodIds,
                ], 409);
            }

            return Review::where('cust_id', $order->cust_id)
                ->whereIn('prod_id', $prodIds)
                ->orderByDesc('rev_created')
                ->first();
        }

        /** REQ-MANAGE_REV-03: rows deleted by moderation keep their text. */
        protected function isDeleted(Review $review): bool
        {
            return str_starts_with((string) $review->rev_msg, '[DELETED]');
        }

        /**
         * REQ-MANAGE_REV-05: product.prod_rating is the average of APPROVED
         * ratings and product.prod_reviews the count of APPROVED rows, so
         * moderation can never corrupt them.
         */
        protected function recomputeProduct(int $prodId): void
        {
            $rows = Review::where('prod_id', $prodId)
                ->whereNotNull('rev_approved')
                ->whereRaw("rev_msg NOT LIKE '[DELETED]%'")
                ->get(['rev_msg']);

            $count = $rows->count();
            $sum = 0;
            foreach ($rows as $row) {
                $sum += $this->decode($row->rev_msg)['rating'];
            }

            Product::where('prod_id', $prodId)->update([
                'prod_rating' => $count > 0 ? round($sum / $count, 2) : 0,
                'prod_reviews' => $count,
            ]);
        }

        // ==========================================
        // ENDPOINTS
        // ==========================================

        /*
            Creating product reviews
            ----------
            JSON REQUEST

            ord_id - integer (opt: legacy handle, one of ord_id / prod_id)
            prod_id - integer (opt: one of ord_id / prod_id)
            rating - integer (req: 1-5)   [legacy: ord_rating]
            message - string (opt)        [legacy: ord_review / review]

            One review per customer per product; every submission waits for
            employee approval (rev_approved stays NULL).
        */
        public function createReview(Request $json)
        {
            $customer = $this->requireCustomer($json);
            if ($customer instanceof \Illuminate\Http\JsonResponse) return $customer;

            $ratingInput = $json->input('rating', $json->input('ord_rating'));
            if ($ratingInput === null) {
                return response()->json(['success' => false, 'message' => 'Rating score is required.'], 400);
            }
            if (! is_numeric($ratingInput) || (int) $ratingInput < 1 || (int) $ratingInput > 5) {
                return response()->json([
                    'success' => false,
                    'message' => 'Rating must be a number between 1 and 5.',
                ], 400);
            }
            $rating = (int) $ratingInput;

            $text = (string) ($json->input('message')
                ?? $json->input('review')
                ?? $json->input('ord_review')
                ?? '');

            $ordId = $json->input('ord_id');
            $prodId = $json->input('prod_id');

            if (! $ordId && ! $prodId) {
                return response()->json(['success' => false, 'message' => 'Order ID or product ID is required.'], 400);
            }

            try {
                if ($ordId) {
                    $order = Order::find($ordId);
                    if (! $order) {
                        return response()->json(['success' => false, 'message' => 'Order not found'], 404);
                    }

                    // Only the purchaser may review their own order
                    if ((int) $order->cust_id !== (int) $customer->getKey()) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review your own orders',
                        ], 403);
                    }

                    if (! $this->countsAsPurchase($order->ord_status)) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review products you have already purchased',
                        ], 403);
                    }

                    $orderProducts = $this->productIdsForOrder((int) $order->ord_id);
                    if ($prodId) {
                        if (! in_array((int) $prodId, $orderProducts, true)) {
                            return response()->json([
                                'success' => false,
                                'message' => 'The requested product is not part of this order',
                            ], 403);
                        }
                        $prodId = (int) $prodId;
                    } else {
                        if ($orderProducts === []) {
                            return response()->json([
                                'success' => false,
                                'message' => 'The requested product is not part of this order',
                            ], 403);
                        }
                        $prodId = $orderProducts[0];
                    }
                } else {
                    $product = Product::find($prodId);
                    if (! $product) {
                        return response()->json(['success' => false, 'message' => 'Product not found'], 404);
                    }

                    // Purchase rule: a review is only allowed once the order
                    // was actually paid for (still-processing and cancelled
                    // orders never count as a purchase)
                    $placeholders = implode(',', array_fill(0, count(self::NOT_PURCHASED), '?'));
                    $purchased = DB::table('orders')
                        ->join('items', 'items.ord_id', '=', 'orders.ord_id')
                        ->join('bag', 'bag.bag_id', '=', 'items.bag_id')
                        ->join('prodvar', 'prodvar.prodvar_id', '=', 'bag.prodvar_id')
                        ->where('orders.cust_id', $customer->getKey())
                        ->where('prodvar.prod_id', $prodId)
                        ->whereRaw('LOWER(orders.ord_status) NOT IN (' . $placeholders . ')', self::NOT_PURCHASED)
                        ->exists();

                    if (! $purchased) {
                        return response()->json([
                            'success' => false,
                            'message' => 'You may only review products you have already purchased',
                        ], 403);
                    }

                    $prodId = (int) $prodId;
                }

                // REQ-APC-2 / Domain 13: only one review per customer per
                // product. A rejected row keeps its audit trail but does not
                // block a fresh submission.
                $existing = Review::where('cust_id', $customer->getKey())
                    ->where('prod_id', $prodId)
                    ->orderByDesc('rev_created')
                    ->first();

                if ($existing && ! $existing->isRejected()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'You have already reviewed this product. Please edit your existing review instead.',
                    ], 409);
                }

                $review = Review::create([
                    'cust_id'     => $customer->getKey(),
                    'prod_id'     => $prodId,
                    'rev_msg'     => Review::compose($rating, $text),
                    'rev_created' => now(),
                    'rev_approved' => null,
                ]);

                $map = $this->orderMap([$review]);

                return response()->json([
                    'success' => true,
                    'message' => 'Review and rating submitted successfully',
                    'data'    => $this->present($review, $ordId ?: $this->orderIdFor($review, $map)),
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to create review',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Deleting product reviews
            ----------
            JSON REQUEST

            rev_id - integer (canonical)
            ord_id - integer (legacy handle, + optional prod_id)

            Customers may only delete their own rows; employees may delete any.
            The product aggregates are recomputed afterwards.
        */
        public function deleteReview(Request $json)
        {
            try {
                $review = $this->resolveReview($json);
                if ($review instanceof \Illuminate\Http\JsonResponse) {
                    return $review; // ambiguous legacy handle (409)
                }
                if (! $review) {
                    return response()->json(['success' => false, 'message' => 'Review not found'], 404);
                }

                $user = $json->user('api');
                $ownsReview = $user instanceof Customer && (int) $review->cust_id === (int) $user->getKey();
                if (! $ownsReview && ! $this->isEmployee($user)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'You may only delete your own reviews',
                    ], 403);
                }

                if ($this->isDeleted($review)) {
                    return response()->json([
                        'success' => true,
                        'message' => 'Review deleted successfully',
                    ], 200);
                }

                $prodId = (int) $review->prod_id;

                // REQ-MANAGE_REV-03: a moderation delete is a SOFT delete -
                // the row stays in `reviews` (its text survives under a
                // [DELETED] marker) so the audit trail the SRS asks for
                // still exists, while every read below filters it out.
                $review->rev_msg = '[DELETED] ' . (string) $review->rev_msg;
                $review->rev_approved = null;
                $review->save();
                $this->recomputeProduct($prodId);

                // REQ-MANAGE_REV-04: approve / reject / delete all land in emplog.
                if ($this->isEmployee($user)) {
                    $this->logEmployee((int) $user->emp_id, 'delete',
                        'DELETE /api/reviews/delete - soft-deleted review #' . $review->rev_id
                        . ' (product #' . $prodId . ')');
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Review deleted successfully',
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to delete review',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Displaying product reviews
            ----------
            JSON REQUEST / Query Params

            prod_id - integer (opt)
            status - string (opt: pending | approved | rejected | all, employees only)

            FLOW-CATALOG-05: customers and guests only ever see approved rows,
            newest first.
        */
        public function displayReviews(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');
                $user = $json->user('api');
                $isEmployee = $this->isEmployee($user);
                $isAdmin = $this->isAdmin($user);
                $statusFilter = strtolower(trim((string) $json->input('status', '')));
                $q = trim((string) $json->input('q', ''));

                $query = Review::with(['product', 'customer']);
                if ($prodId) {
                    $query->where('prod_id', $prodId);
                }

                // REQ-MANAGE_REV-03: a soft-deleted row is gone from every
                // read - customer wall, admin queue and search alike.
                $query->whereRaw("rev_msg NOT LIKE '[DELETED]%'");

                /*
                    FLOW-MANAGE_REV-01: the admin page opens on the whole
                    queue. An empty `status` used to fall through to the
                    customer branch (approved only), so the pending rows the
                    page exists for never appeared until a filter was picked.
                */
                if ($isEmployee && $statusFilter === '' && $isAdmin) {
                    $statusFilter = 'all';
                }

                $wantsQueue = $isEmployee
                    && in_array($statusFilter, ['pending', 'approved', 'rejected', 'all'], true);

                if ($wantsQueue) {
                    if ($statusFilter === 'pending') {
                        $query->whereNull('rev_approved')
                            ->whereRaw("rev_msg NOT LIKE '[REJECTED]%'");
                    } elseif ($statusFilter === 'approved') {
                        $query->whereNotNull('rev_approved');
                    } elseif ($statusFilter === 'rejected') {
                        $query->whereNull('rev_approved')
                            ->whereRaw("rev_msg LIKE '[REJECTED]%'");
                    }
                } else {
                    // REQ-MANAGE_REV-02: pending and rejected rows never reach
                    // a customer, whatever status they asked for.
                    $query->whereNotNull('rev_approved');
                }

                // FLOW-MANAGE_REV-04: search by product name or customer name
                // (the admin page sends `q`; `search` is the older alias).
                $needle = $q !== '' ? $q : trim((string) $json->input('search', ''));
                if ($needle !== '') {
                    $query->where(function ($builder) use ($needle) {
                        $builder->whereHas('product', function ($pq) use ($needle) {
                            $pq->where('prod_name', 'like', "%{$needle}%")
                               ->orWhere('prod_tag', 'like', "%{$needle}%");
                        })->orWhereHas('customer', function ($cq) use ($needle) {
                            $cq->where('cust_nickname', 'like', "%{$needle}%")
                               ->orWhere('cust_email', 'like', "%{$needle}%")
                               ->orWhere('cust_givname', 'like', "%{$needle}%")
                               ->orWhere('cust_surname', 'like', "%{$needle}%");
                        });
                    });
                }

                $query->orderByDesc('rev_created');
                $reviews = $query->get();

                $map = $this->orderMap($reviews);
                $rows = $reviews
                    ->map(fn (Review $review) => $this->present($review, $this->orderIdFor($review, $map)))
                    ->values();

                // REQ-ACCESS_LOG-01: reading reviews (customer wall or the
                // moderation queue) is logged on the reading account.
                $this->logView($json, 'reviews');

                return response()->json([
                    'success' => true,
                    'message' => 'Product reviews retrieved successfully',
                    'data'    => $rows,
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display reviews',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Moderating product reviews
            ----------
            JSON REQUEST

            rev_id - integer (canonical)
            ord_id - integer (legacy handle, + optional prod_id)
            approve - boolean (opt, default: true)
            censored_review - string (opt, replacement text)

            approve=true  -> rev_approved = now() (published)
            approve=false -> rev_msg = '[REJECTED] |' + original, keeping the
                             row for audit with rev_approved NULL
        */
        public function moderateReview(Request $json)
        {
            // Only employees review submissions before they go public
            $denied = $this->requireEmployee($json);
            if ($denied) return $denied;

            try {
                $review = $this->resolveReview($json);
                if ($review instanceof \Illuminate\Http\JsonResponse) {
                    return $review; // ambiguous legacy handle (409)
                }
                if (! $review) {
                    return response()->json(['success' => false, 'message' => 'Review not found'], 404);
                }

                $approve = $json->boolean('approve', true);
                $decoded = $this->decode($review->rev_msg);
                $censored = $json->input('censored_review');
                $text = $censored !== null ? (string) $censored : $decoded['text'];
                $rating = $decoded['rating'] > 0 ? $decoded['rating'] : 1;

                if ($approve) {
                    // Approving a previously rejected row restores a clean
                    // "<rating>|<text>" token (no marker survives).
                    $review->rev_msg = Review::compose($rating, $text);
                    $review->rev_approved = now();
                    $newStatus = 'approved';
                } else {
                    if (! str_starts_with((string) $review->rev_msg, '[REJECTED]')) {
                        $review->rev_msg = '[REJECTED] |' . $review->rev_msg;
                    }
                    $review->rev_approved = null;
                    $newStatus = 'rejected';
                }

                $review->save();
                $this->recomputeProduct((int) $review->prod_id);

                if ($review->cust_id) {
                    $product = Product::find($review->prod_id);
                    $label = $product ? '"' . $product->prod_name . '"' : 'your order';
                    $this->notifyCustomer((int) $review->cust_id, $approve
                        ? 'Your review for ' . $label . ' has been approved.'
                        : 'Your review for ' . $label . ' was not approved.');
                }

                // REQ-ACCESS_LOG-01/03: moderating a review is an edit action.
                $user = $json->user('api');
                if ($this->isEmployee($user)) {
                    $this->logEmployee((int) $user->emp_id, 'edit',
                        'POST /api/reviews/moderate - ' . $newStatus . ' review #' . $review->rev_id);
                }

                $ordId = $json->input('ord_id');
                $map = $this->orderMap([$review]);

                return response()->json([
                    'success' => true,
                    'message' => 'Review moderation completed',
                    'data'    => $this->present($review, $ordId ?: $this->orderIdFor($review, $map)),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to moderate review',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Scoring product ratings
            ----------
            JSON REQUEST / Query Params

            prod_id - integer (opt)

            Only approved feedback contributes to the public score.
        */
        public function scoreRating(Request $json)
        {
            try {
                $prodId = $json->input('prod_id');

                $query = Review::whereNotNull('rev_approved')
                    // REQ-MANAGE_REV-03: soft-deleted rows never score.
                    ->whereRaw("rev_msg NOT LIKE '[DELETED]%'");
                if ($prodId) {
                    $query->where('prod_id', $prodId);
                }

                $rows = $query->get(['rev_msg']);
                $sum = 0;
                $scored = 0;
                foreach ($rows as $row) {
                    $rating = $this->decode($row->rev_msg)['rating'];
                    if ($rating > 0) {
                        $sum += $rating;
                        $scored++;
                    }
                }

                $average = $scored > 0 ? round($sum / $scored, 2) : 0.0;

                return response()->json([
                    'success' => true,
                    'message' => 'Rating score calculated successfully',
                    'data'    => [
                        'prod_id'         => $prodId,
                        'average_rating'  => $average,
                        'total_reviews'   => $rows->count(),
                        // Canonical aliases of the same two numbers
                        'prod_rating'     => $average,
                        'prod_reviews'    => $rows->count(),
                    ],
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to calculate score rating',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }

        /*
            Updating product reviews
            ----------
            JSON REQUEST

            rev_id - integer (canonical)
            ord_id - integer (legacy handle, + optional prod_id)
            rating - integer (opt 1-5)   [legacy: ord_rating]
            message - string (opt)       [legacy: ord_review / review]

            Editing stops once an employee approved (or rejected) it; a pending
            edit keeps the row pending.
        */
        public function updateReview(Request $json)
        {
            try {
                $review = $this->resolveReview($json);
                if ($review instanceof \Illuminate\Http\JsonResponse) {
                    return $review; // ambiguous legacy handle (409)
                }
                if (! $review) {
                    return response()->json(['success' => false, 'message' => 'Review not found'], 404);
                }

                $user = $json->user('api');
                if (! $user instanceof Customer || (int) $review->cust_id !== (int) $user->getKey()) {
                    return response()->json([
                        'success' => false,
                        'message' => 'You may only edit your own reviews',
                    ], 403);
                }

                $decoded = $this->decode($review->rev_msg);
                if ($review->rev_approved !== null || $decoded['rejected']) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Approved reviews can no longer be edited',
                    ], 409);
                }

                $rating = $decoded['rating'];
                if ($json->has('rating')) {
                    $rating = $json->input('rating');
                } elseif ($json->has('ord_rating')) {
                    $rating = $json->input('ord_rating');
                }

                if (! is_numeric($rating) || (int) $rating < 1 || (int) $rating > 5) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Rating must be a number between 1 and 5.',
                    ], 400);
                }

                $text = $decoded['text'];
                if ($json->has('message')) {
                    $text = (string) $json->input('message');
                } elseif ($json->has('review')) {
                    $text = (string) $json->input('review');
                } elseif ($json->has('ord_review')) {
                    $text = (string) $json->input('ord_review');
                }

                $review->rev_msg = Review::compose((int) $rating, (string) $text);
                $review->rev_approved = null; // an edit always re-enters the queue
                $review->save();

                $this->recomputeProduct((int) $review->prod_id);

                $map = $this->orderMap([$review]);

                return response()->json([
                    'success' => true,
                    'message' => 'Review updated successfully',
                    'data'    => $this->present($review, $this->orderIdFor($review, $map)),
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update review',
                    'error'   => $e->getMessage(),
                ], 500);
            }
        }
    }
