<?php

namespace App\Services\Receipts;

/**
 * Where a finished physical receipt goes.
 *
 * This is the single seam to swap when a real receipt printer is connected:
 * write a class implementing this interface (ESC/POS, network printer, ...),
 * then point `RECEIPT_OUTPUT` (config/receipts.php) at it. Nothing else in the
 * system needs to change.
 */
interface ReceiptOutput
{
    /**
     * @param  string  $jpeg      the rendered receipt, JPEG bytes
     * @param  string  $filename  suggested name, e.g. "receipt-42.jpeg"
     */
    public function send(string $jpeg, string $filename): void;
}
