<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Product;
use App\Models\Appointment;
use App\Models\Employee;
use App\Models\DutyShift;
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

    public function buildInventoryReport(array $filters): array
    {
        $query = Product::whereNull('prod_deleted');

        if (!empty($filters['prod_categ'])) {
            $query->where('prod_categ', $filters['prod_categ']);
        }

        $products = $query->orderBy('prod_name')->get();

        $lowStockThreshold = (int) config('settings.low_stock_threshold', 5);
        
        $items = $products->map(function ($product) use ($lowStockThreshold) {
            $stockValue = round((float) $product->prod_price * (int) $product->prod_qty, 2);
            return [
                'prod_id' => $product->prod_id,
                'prod_tag' => $product->prod_tag,
                'prod_name' => $product->prod_name,
                'prod_categ' => $product->prod_categ,
                'prod_price' => (float) $product->prod_price,
                'prod_qty' => (int) $product->prod_qty,
                'stock_value' => $stockValue,
                'is_low_stock' => (int) $product->prod_qty <= $lowStockThreshold,
                'low_stock_threshold' => $lowStockThreshold,
                'prod_peakqty' => (int) $product->prod_peakqty,
                'prod_peaksold' => (float) $product->prod_peaksold,
                'prod_todayqty' => (int) $product->prod_todayqty,
                'prod_todaysold' => (float) $product->prod_todaysold,
            ];
        })->values()->all();

        $totalProducts = $products->count();
        $totalStockValue = round($products->sum(function ($p) {
            return (float) $p->prod_price * (int) $p->prod_qty;
        }), 2);
        $lowStockCount = $products->where('prod_qty', '<=', $lowStockThreshold)->count();
        $outOfStockCount = $products->where('prod_qty', '<=', 0)->count();

        return [
            'summary' => [
                'total_products' => $totalProducts,
                'total_stock_value' => $totalStockValue,
                'low_stock_count' => $lowStockCount,
                'out_of_stock_count' => $outOfStockCount,
                'low_stock_threshold' => $lowStockThreshold,
            ],
            'items' => $items,
        ];
    }

    public function buildAppointmentsReport(array $filters): array
    {
        $query = Appointment::with('customer')
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
            ->whereNull('emp_disabled')
            ->with(['dutyShifts']);

        if (!empty($filters['emp_type'])) {
            $query->where('emp_type', $filters['emp_type']);
        }

        $employees = $query->get();

        // Calculate hours worked from duty_shifts
        $staffData = $employees->map(function ($emp) {
            $shifts = $emp->dutyShifts ?? collect();
            $totalHours = $shifts->sum(function ($shift) {
                $start = Carbon::parse($shift->shift_start);
                $end = Carbon::parse($shift->shift_end);
                return $start->diffInHours($end);
            });
            $upcomingShifts = $shifts->where('shift_date', '>=', now()->format('Y-m-d'))->count();
            
            return [
                'emp_id' => $emp->emp_id,
                'name' => trim(($emp->emp_givname ?? '') . ' ' . ($emp->emp_surname ?? '')),
                'emp_type' => $emp->emp_type,
                'emp_email' => $emp->emp_email,
                'emp_phone' => $emp->emp_phone,
                'emp_instore' => (bool) $emp->emp_instore,
                'total_shifts' => $shifts->count(),
                'upcoming_shifts' => $upcomingShifts,
                'total_hours' => $totalHours,
                'availability' => $emp->emp_instore ? 'In-Store' : 'Available',
            ];
        })->values()->all();

        $totalStaff = $employees->count();
        $inStoreStaff = $employees->where('emp_instore', true)->count();
        $byType = $employees->groupBy('emp_type')->map(function ($group, $type) {
            return [
                'type' => $type,
                'count' => $group->count(),
                'in_store' => $group->where('emp_instore', true)->count(),
            ];
        })->values()->all();

        // Shift coverage for next 7 days
        $coverage = [];
        for ($i = 0; $i < 7; $i++) {
            $date = now()->addDays($i)->format('Y-m-d');
            $dayShifts = DutyShift::where('shift_date', $date)->get();
            $coverage[] = [
                'date' => $date,
                'shifts_count' => $dayShifts->count(),
                'staff_count' => $dayShifts->pluck('emp_id')->unique()->count(),
                'hours_covered' => $dayShifts->sum(function ($s) {
                    return Carbon::parse($s->shift_start)->diffInHours(Carbon::parse($s->shift_end));
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