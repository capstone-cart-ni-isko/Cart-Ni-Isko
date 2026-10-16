<?php

use App\Services\Receipts\JpegFileOutput;

return [
    /*
     * Class (implementing App\Services\Receipts\ReceiptOutput) that receives
     * every physical receipt. Swap for the real printer driver later.
     */
    'output' => env('RECEIPT_OUTPUT', JpegFileOutput::class),

    // Used by JpegFileOutput only.
    'directory' => env('RECEIPT_DIR', 'C:\\Users\\johnm\\Pictures\\Receipts'),
];
