<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Product;
use App\Models\Visit;
use App\Models\Employee;
use App\Models\Schedule;
use App\Models\Item;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class ReportBuilder
{
    public function buildSalesReport(array $filters): array
    {
        $query = Order::with(['items.product', 'customer'])
            ->whereNotNull('ord_completed')
            ->where('ord_status', '!=', 'CANCELLED');

        // Date range filter
        if (!empty($filters['date_from'])) {
            $query->where('ord_completed', '>=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $query->where('ord_completed', '<=', $filters['date_to'] . ' 23:59:59');
        }

        // Product filter
        if (!empty($filters['prod_id'])) {
            $query->whereHas('items', function ($q) use ($filters) {
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

        $orders = $query->orderBy('ord_completed', 'desc')->get();

        // Group by date
        $byDate = $orders->groupBy(function ($order) {
            return Carbon::parse($order->ord_completed)->format('Y-m-d');
        })->map(function ($dayOrders) {
            $revenue = $dayOrders->sum(function ($order) {
                return $order->items->sum(function ($item) {
                    return (float) $item->item_amount;
                });
            });
            return [
                'date' => $dayOrders->first()->ord_completed,
                'transactions' => $dayOrders->count(),
                'revenue' => round($revenue, 2),
                'orders' => $dayOrders->map(function ($order) {
                    return [
                        'ord_id' => $order->ord_id,
                        'ord_tag' => $order->ord_tag,
                        'customer' => $order->customer?->cust_nickname,
                        'total' => $order->items->sum(function ($item) {
                            return (float) $item->item_amount;
                        }),
                        'status' => $order->ord_status,
                        'completed_at' => $order->ord_completed,
                    ];
                })->values()->all(),
            ];
        })->values()->all();

        // Group by product
        $byProduct = $orders->flatMap(function ($order) {
            return $order->items->map(function ($item) use ($order) {
                return [
                    'prod_id' => $item->prod_id,
                    'prod_name' => $item->product->prod_name ?? 'Unknown',
                    'qty' => (int) $item->item_qty,
                    'amount' => (float) $item->item_amount,
                    'order_date' => $order->ord_completed,
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
                'customer' => $custOrders->first()->customer?->cust_nickname,
                'orders_count' => $custOrders->count(),
                'total_revenue' => round($custOrders->sum(function ($order) {
                    return $order->items->sum(function ($item) {
                        return (float) $item->item_amount;
                    });
                }), 2),
            ];
        })->values()->all();

        $totalRevenue = round($orders->sum(function ($order) {
            return $order->items->sum(function ($item) {
                return (float) $item->item_amount;
            });
        }), 2);

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
        $query = Visit::with('customer')
            ->whereNull('appoint_deleted');

        if (!empty($filters['date_from'])) {
            $query->where('appoint_date', '>=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $query->where('appoint_date', '<=', $filters['date_to'] . ' 23:59:59');
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

        $appointments = $query->orderBy('appoint_date', 'desc')->get();

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

        $byDate = $appointments->groupBy(function ($appt) {
            return Carbon::parse($appt->appoint_date)->format('Y-m-d');
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
            'items' => $appointments->map(function ($appt) {
                return [
                    'appoint_id' => $appt->appoint_id,
                    'appoint_qr' => $appt->appoint_qr,
                    'appoint_type' => $appt->appoint_type,
                    'appoint_date' => $appt->appoint_date,
                    'appoint_status' => $appt->appoint_closed ? 'CLOSED' : 'OPEN',
                    'customer' => $appt->customer?->cust_nickname,
                    'customer_phone' => $appt->customer?->cust_phone,
                ];
            })->values()->all(),
        ];
    }

    public function buildStaffingReport(array $filters): array
    {
        $query = Employee::whereNull('emp_deleted')
            ->whereNull('emp_disabled');

        if (!empty($filters['emp_type'])) {
            $query->where('emp_type', $filters['emp_type']);
        }

        $employees = $query->get();

        // Calculate hours worked from `schedules`, the Domain 7 duty table.
        // One query for the whole roster rather than a per-employee load.
        $blocks = Schedule::whereIn('emp_id', $employees->pluck('emp_id'))
            ->get()
            ->groupBy('emp_id');

        $staffData = $employees->map(function ($emp) use ($blocks) {
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
                'emp_type' => $emp->emp_type,
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
        $byType = $employees->groupBy('emp_type')->map(function ($group, $type) {
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
}