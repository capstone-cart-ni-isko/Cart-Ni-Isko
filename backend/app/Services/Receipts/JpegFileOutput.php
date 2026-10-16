<?php

namespace App\Services\Receipts;

use RuntimeException;

/**
 * Temporary stand-in for a printer: saves each physical receipt as a .jpeg in
 * the configured folder (created on demand). Replace by implementing
 * ReceiptOutput for the real printer.
 */
class JpegFileOutput implements ReceiptOutput
{
    public function send(string $jpeg, string $filename): void
    {
        $dir = rtrim((string) config('receipts.directory'), '\\/');

        if ($dir === '' || (! is_dir($dir) && ! @mkdir($dir, 0775, true) && ! is_dir($dir))) {
            throw new RuntimeException('Receipt folder is not available: ' . $dir);
        }

        if (@file_put_contents($dir . DIRECTORY_SEPARATOR . $filename, $jpeg) === false) {
            throw new RuntimeException('Receipt could not be written to: ' . $dir);
        }
    }
}
