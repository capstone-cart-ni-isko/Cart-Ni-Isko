<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Product;
use App\Models\Visit;
use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Item;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class ReportBuilder
{
    public function buildSalesReport(array $filters): array
    {
        // The live `orders` table records the sale timestamp in `ord_created`
        // and completion through `ord_status`; the legacy `ord_completed`
        // column is absent, so fall back to `ord_created`.
        $completedColumn = Schema::hasColumn('orders', 'ord_completed') ? 'ord_completed' : 'ord_created';

        // REQ-ANALYTICS-04: revenue counts only realised sales. The statuses the
        // storefront treats as "not purchased" are excluded, case-insensitively.
        $notSold = [
            'processing', 'to process', 'pending', 'to cancel',
            'cancel requested', 'cancellation requested', 'cancelled', 'canceled',
        ];

        $query = Order::with(['items.bag.prodvar.product', 'customer'])
            ->whereNotNull($completedColumn)
            ->whereRaw(
                'LOWER(TRIM(ord_status)) NOT IN (' . implode(',', array_fill(0, count($notSold), '?')) . ')',
                $notSold
            );

        // Date range filter
        if (!empty($filters['date_from'])) {
            $query->where($completedColumn, '>=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $query->where($completedColumn, '<=', $filters['date_to'] . ' 23:59:59');
        }

        // Product filter - line items hang off the items -> bag -> prodvar chain.
        if (!empty($filters['prod_id'])) {
            $query->whereHas('items.bag.prodvar', function ($q) use ($filters) {
                $q->where('prod_id', $filters['prod_id']);
            });
        }

        // Staff filter (by pickup/delivery handler)
        if (!empty($filters['emp_id'])) {
            // Orders handled by specific employee through pickup or delivery
            $query->where(function ($q) use ($filters) {
                $q->whereHas('pickup.appointment', function ($aq) use ($filters) {
                    // This would need a duty shift link
                })->orWhereHas('parcel.delivery', function ($dq) use ($filters) {
                    // This would need a handler link
                });
            });
        }

        $orders = $query->orderBy($completedColumn, 'desc')->get();

        // Group by date
        $byDate = $orders->groupBy(function ($order) use ($completedColumn) {
            return Carbon::parse($order->getAttribute($completedColumn))->format('Y-m-d');
        })->map(function ($dayOrders) use ($completedColumn) {
            return [
                'date' => $dayOrders->first()->getAttribute($completedColumn),
                'transactions' => $dayOrders->count(),
                'revenue' => round($dayOrders->sum(fn ($order) => $this->orderRevenue($order)), 2),
                'orders' => $dayOrders->map(function ($order) use ($completedColumn) {
                    return [
                        'ord_id' => $order->ord_id,
                        'ord_tag' => $order->ord_tag,
                        'customer' => $this->customerName($order->customer),
                        'total' => $this->orderRevenue($order),
                        'status' => $order->ord_status,
                        'completed_at' => $order->getAttribute($completedColumn),
                    ];
                })->values()->all(),
            ];
        })->values()->all();

        // Group by product
        $byProduct = $orders->flatMap(function ($order) use ($completedColumn) {
            $date = $order->getAttribute($completedColumn);

            return $order->items->map(function ($item) use ($date) {
                $bag = $item->bag;
                $product = $bag?->prodvar?->product;

                return [
                    'prod_id' => $product?->prod_id ?? $bag?->prodvar?->prod_id,
                    'prod_name' => $product?->prod_name ?? 'Unknown',
                    'qty' => (int) ($bag->bag_qty ?? 0),
                    'amount' => $this->itemLineAmount($item),
                    'order_date' => $date,
                ];
            });
        })->groupBy('prod_id')->map(function ($items) {
            return [
                'prod_id' => $items->first()['prod_id'],
                'prod_name' => $items->first()['prod_name'],
                'total_qty' => $items->sum('qty'),
                'total_revenue' => round($items->sum('amount'), 2),
                'orders_count' => $items->count(),
            ];
        })->values()->all();

        // Group by staff (simplified - using order creator)
        $byStaff = $orders->groupBy('cust_id')->map(function ($custOrders) {
            return [
                'cust_id' => $custOrders->first()->cust_id,
                'customer' => $this->customerName($custOrders->first()->customer),
                'orders_count' => $custOrders->count(),
                'total_revenue' => round($custOrders->sum(fn ($order) => $this->orderRevenue($order)), 2),
            ];
        })->values()->all();

        $totalRevenue = round($orders->sum(fn ($order) => $this->orderRevenue($order)), 2);

        return [
            'summary' => [
                'total_orders' => $orders->count(),
                'total_revenue' => $totalRevenue,
                'date_range' => [
                    'from' => $filters['date_from'] ?? 'All time',
                    'to' => $filters['date_to'] ?? 'All time',
                ],
            ],
            'by_date' => $byDate,
            'by_product' => $byProduct,
            'by_staff' => $byStaff,
        ];
    }

    /**
     * Unit price x quantity for one order line. Line items live in `items`,
     * which links to the priced `bag` row (the live schema carries no
     * `item_amount`/`item_qty` columns).
     */
    private function itemLineAmount($item): float
    {
        $bag = $item->bag;

        if (! $bag) {
            return 0.0;
        }

        return round((float) $bag->bag_amount * (int) $bag->bag_qty, 2);
    }

    private function orderRevenue($order): float
    {
        return round($order->items->sum(fn ($item) => $this->itemLineAmount($item)), 2);
    }

    /**
     * REQ-MANAGE_INV-07: the inventory report is queryable by date range -
     * the range narrows the SALES columns (units sold / revenue read from
     * `prodsales`), while stock is always the live `prodvar` figure (the
     * legacy `product.prod_qty` column is written by nobody, so every row used
     * to read 0 stock / 0 low-stock).
     */
    public function buildInventoryReport(array $filters): array
    {
        $query = Product::whereNull('prod_deleted');

        if (!empty($filters['prod_categ'])) {
            $query->where('prod_categ', $filters['prod_categ']);
        }

        $products = $query->orderBy('prod_name')->get();
        $prodIds  = $products->pluck('prod_id')->map(fn ($id) => (int) $id)->all();

        // One query per aggregate over the requested window.
        $stockByProduct = [];
        $soldByProduct  = [];
        $revenueByProduct = [];

        if ($prodIds !== []) {
            $stockByProduct = \App\Models\Prodvar::whereIn('prod_id', $prodIds)
                ->whereNull('prodvar_deleted')
                ->groupBy('prod_id')
                ->select('prod_id')
                ->selectRaw('COALESCE(SUM(prodvar_stock), 0) as stock')
                ->get()
                ->keyBy('prod_id');

            $sales = DB::table('prodsales')
                ->join('prodvar', 'prodvar.prodvar_id', '=', 'prodsales.prodvar_id')
                ->whereIn('prodvar.prod_id', $prodIds);

            if (!empty($filters['date_from'])) {
                $sales->where('prodsales.prodsales_date', '>=', $filters['date_from']);
            }
            if (!empty($filters['date_to'])) {
                $sales->where('prodsales.prodsales_date', '<=', $filters['date_to']);
            }

            foreach ($sales->groupBy('prodvar.prod_id')
                ->select('prodvar.prod_id as pid')
                ->selectRaw('COALESCE(SUM(prodsales_qty), 0) as sold')
                ->selectRaw('COALESCE(SUM(prodsales_amount), 0) as revenue')
                ->get() as $row) {
                $soldByProduct[(int) $row->pid]      = (int) $row->sold;
                $revenueByProduct[(int) $row->pid]   = round((float) $row->revenue, 2);
            }
        }

        $lowStockThreshold = (int) (\App\Support\SystemSettings::get('low_stock_threshold', 5));

        $items = $products->map(function ($product) use ($stockByProduct, $soldByProduct, $revenueByProduct, $lowStockThreshold) {
            $id   = (int) $product->prod_id;
            $stock = (int) ($stockByProduct[$id]->stock ?? $product->totalStock());
            $sold  = $soldByProduct[$id] ?? 0;

            return [
                'prod_id' => $product->prod_id,
                'prod_tag' => $product->prod_tag,
                'prod_name' => $product->prod_name,
                'prod_categ' => $product->prod_categ,
                'prod_price' => (float) $product->prod_price,
                'prod_qty' => $stock,
                'stock' => $stock,
                'stock_value' => round((float) $product->prod_price * $stock, 2),
                'is_low_stock' => $stock <= $lowStockThreshold,
                'low_stock_threshold' => $lowStockThreshold,
                'prod_sold' => $sold,
                'prod_revenue' => $revenueByProduct[$id] ?? 0.0,
                // The legacy peak/today columns are never written; the
                // prodsales aggregates above are their live successors.
                'prod_peakqty' => $sold,
                'prod_peaksold' => $revenueByProduct[$id] ?? 0.0,
                'prod_todayqty' => 0,
                'prod_todaysold' => 0.0,
            ];
        })->values()->all();

        $stockOf = fn ($product) => (int) ($stockByProduct[(int) $product->prod_id]->stock ?? $product->totalStock());

        return [
            'summary' => [
                'total_products' => $products->count(),
                'total_stock_value' => round($products->sum(fn ($p) => (float) $p->prod_price * $stockOf($p)), 2),
                'low_stock_count' => $products->filter(fn ($p) => $stockOf($p) <= $lowStockThreshold)->count(),
                'out_of_stock_count' => $products->filter(fn ($p) => $stockOf($p) <= 0)->count(),
                'low_stock_threshold' => $lowStockThreshold,
                'total_sold' => array_sum($soldByProduct),
                'total_revenue' => round(array_sum($revenueByProduct), 2),
                'date_range' => [
                    'from' => $filters['date_from'] ?? 'All time',
                    'to'   => $filters['date_to'] ?? 'All time',
                ],
            ],
            'items' => $items,
        ];
    }

    public function buildAppointmentsReport(array $filters): array
    {
        // Cancellations are tracked through `appoint_status`; the live
        // `appointments` table has no soft-delete column. The scheduled window
        // lives in `appoint_start` on the current schema, with `appoint_date`
        // only on the legacy table.
        $dateColumn = Schema::hasColumn('appointments', 'appoint_date') ? 'appoint_date' : 'appoint_start';

        $query = Visit::with('customer');

        if (!empty($filters['date_from'])) {
            $query->where($dateColumn, '>=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $query->where($dateColumn, '<=', $filters['date_to'] . ' 23:59:59');
        }
        if (!empty($filters['appoint_type'])) {
            $query->where('appoint_type', $filters['appoint_type']);
        }
        if (!empty($filters['status'])) {
            if ($filters['status'] === 'OPEN') {
                $query->whereNull('appoint_closed');
            } elseif ($filters['status'] === 'CLOSED') {
                $query->whereNotNull('appoint_closed');
            }
        }

        $appointments = $query->orderBy($dateColumn, 'desc')->get();

        $byStatus = $appointments->groupBy(function ($appt) {
            return $appt->appoint_closed ? 'CLOSED' : 'OPEN';
        })->map(function ($group, $status) {
            return [
                'status' => $status,
                'count' => $group->count(),
            ];
        })->values()->all();

        $byType = $appointments->groupBy('appoint_type')->map(function ($group, $type) {
            return [
                'type' => $type,
                'count' => $group->count(),
            ];
        })->values()->all();

        $byDate = $appointments->groupBy(function ($appt) use ($dateColumn) {
            return Carbon::parse($appt->getAttribute($dateColumn))->format('Y-m-d');
        })->map(function ($dayAppts, $date) {
            return [
                'date' => $date,
                'total' => $dayAppts->count(),
                'claim' => $dayAppts->where('appoint_type', 'CLAIM')->count(),
                'visit' => $dayAppts->where('appoint_type', 'VISIT')->count(),
            ];
        })->values()->all();

        // Capacity utilization
        $totalSlots = 0;
        $usedSlots = 0;
        foreach ($byDate as $day) {
            // Estimate: 30-min claim slots (10 per hour) and 10-min visit slots (6 per hour)
            // Store hours: 8am-5pm = 9 hours
            $claimSlots = 10 * 9; // 90 claim slots per day
            $visitSlots = 6 * 9; // 54 visit slots per day
            $totalSlots += $claimSlots + $visitSlots;
            $usedSlots += $day['total'];
        }

        return [
            'summary' => [
                'total_appointments' => $appointments->count(),
                'open_appointments' => $appointments->whereNull('appoint_closed')->count(),
                'closed_appointments' => $appointments->whereNotNull('appoint_closed')->count(),
                'capacity_utilization' => $totalSlots > 0 ? round(($usedSlots / $totalSlots) * 100, 1) : 0,
            ],
            'by_status' => $byStatus,
            'by_type' => $byType,
            'by_date' => $byDate,
            'items' => $appointments->map(function ($appt) use ($dateColumn) {
                return [
                    'appoint_id' => $appt->appoint_id,
                    'appoint_qr' => $appt->appoint_qr,
                    'appoint_type' => $appt->appoint_type,
                    'appoint_date' => $appt->getAttribute($dateColumn),
                    'appoint_start' => $appt->getAttribute($dateColumn),
                    'appoint_status' => $appt->appoint_closed ? 'CLOSED' : 'OPEN',
                    'customer' => $this->customerName($appt->customer),
                    'customer_phone' => $appt->customer?->cust_phone,
                ];
            })->values()->all(),
        ];
    }

    public function buildStaffingReport(array $filters): array
    {
        // The live `employee` table marks suspension with `emp_suspended` and
        // carries the role in `emp_categ`; `emp_disabled`/`emp_type` are only on
        // the legacy shape.
        $hasDisabled = Schema::hasColumn('employee', 'emp_disabled');
        $categoryColumn = Schema::hasColumn('employee', 'emp_categ') ? 'emp_categ' : 'emp_type';

        $query = Employee::whereNull('emp_deleted');
        $query->whereNull($hasDisabled ? 'emp_disabled' : 'emp_suspended');

        $typeFilter = $filters['emp_categ'] ?? $filters['emp_type'] ?? null;
        if (!empty($typeFilter)) {
            $query->where($categoryColumn, $typeFilter);
        }

        $employees = $query->get();

        // Calculate hours worked from `schedules`, the Domain 7 duty table.
        // One query for the whole roster rather than a per-employee load.
        $blocks = Schedule::whereIn('emp_id', $employees->pluck('emp_id'))
            ->get()
            ->groupBy('emp_id');

        $staffData = $employees->map(function ($emp) use ($blocks, $categoryColumn) {
            $shifts = $blocks->get($emp->emp_id) ?? collect();
            $totalHours = $shifts->sum(function ($shift) {
                if (! $shift->sched_time_start || ! $shift->sched_time_end) return 0;
                return $shift->sched_time_start->diffInHours($shift->sched_time_end);
            });
            $upcomingShifts = $shifts->filter(
                fn ($shift) => $shift->sched_time_start
                    && $shift->sched_time_start->gte(now()->startOfDay())
            )->count();
            
            return [
                'emp_id' => $emp->emp_id,
                'name' => trim(($emp->emp_givname ?? '') . ' ' . ($emp->emp_surname ?? '')),
                'emp_type' => $emp->getAttribute($categoryColumn),
                'emp_email' => $emp->emp_email,
                'emp_phone' => $emp->emp_phone,
                'emp_instore' => $emp->inStore(),
                'total_shifts' => $shifts->count(),
                'upcoming_shifts' => $upcomingShifts,
                'total_hours' => $totalHours,
                'availability' => $emp->inStore() ? 'In-Store' : 'Available',
            ];
        })->values()->all();

        $totalStaff = $employees->count();
        $inStoreStaff = $employees->filter(fn ($emp) => $emp->inStore())->count();
        $byType = $employees->groupBy($categoryColumn)->map(function ($group, $type) {
            return [
                'type' => $type,
                'count' => $group->count(),
                'in_store' => $group->filter(fn ($emp) => $emp->inStore())->count(),
            ];
        })->values()->all();

        // Shift coverage for next 7 days
        $coverage = [];
        for ($i = 0; $i < 7; $i++) {
            $date = now()->addDays($i)->format('Y-m-d');
            $dayShifts = Schedule::whereDate('sched_time_start', $date)->get();
            $coverage[] = [
                'date' => $date,
                'shifts_count' => $dayShifts->count(),
                'staff_count' => $dayShifts->pluck('emp_id')->unique()->count(),
                'hours_covered' => $dayShifts->sum(function ($s) {
                    if (! $s->sched_time_start || ! $s->sched_time_end) return 0;
                    return $s->sched_time_start->diffInHours($s->sched_time_end);
                }),
            ];
        }

        return [
            'summary' => [
                'total_staff' => $totalStaff,
                'in_store_staff' => $inStoreStaff,
                'remote_staff' => $totalStaff - $inStoreStaff,
            ],
            'by_type' => $byType,
            'staff' => $staffData,
            'coverage' => $coverage,
        ];
    }

    /**
     * The live `customer` table has no `cust_nickname` column; the nickname is
     * the derived full-name alias (spec section 6). Reports therefore present
     * the given + surname the same way the shared responses do.
     */
    private function customerName($customer): ?string
    {
        if (! $customer) {
            return null;
        }

        $name = trim(($customer->cust_givname ?? '') . ' ' . ($customer->cust_surname ?? ''));

        return $name !== '' ? $name : null;
    }
}