<?php

namespace App\Services\Receipts;

use App\Http\Controllers\OrdersAPI;
use App\Models\Order;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Issues the physical receipt of a completed pickup order. A receipt problem
 * (no folder, no printer) is logged and never blocks the claim itself.
 */
class ReceiptPrinter
{
    public static function printFor(Order $order): void
    {
        if (app()->runningUnitTests()) {
            return;
        }

        try {
            $order->loadMissing('customer');
            $payload  = OrdersAPI::orderPayload($order);
            $customer = trim((string) ($order->customer?->cust_nickname ?? ''));

            $jpeg   = (new ReceiptRenderer())->render($payload, $customer);
            $output = app((string) config('receipts.output'));

            $output->send($jpeg, 'receipt-' . $order->ord_id . '.jpeg');
        } catch (Throwable $e) {
            Log::warning('Physical receipt for order #' . $order->ord_id . ' failed: ' . $e->getMessage());
        }
    }
}
