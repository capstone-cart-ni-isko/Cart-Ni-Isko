<?php

namespace App\Services\Receipts;

use Carbon\Carbon;
use RuntimeException;
use Throwable;

/**
 * Draws a receipt (80mm-style roll, 576px wide) from an order payload using
 * GD and returns JPEG bytes. Uses a TrueType font when one is installed and
 * falls back to GD's built-in font otherwise.
 */
class ReceiptRenderer
{
    private const WIDTH = 576;
    private const PAD   = 28;
    private const SIZE  = 15;

    private ?string $regular = null;
    private ?string $bold    = null;

    public function __construct()
    {
        $pairs = [
            ['C:\\Windows\\Fonts\\consola.ttf', 'C:\\Windows\\Fonts\\consolab.ttf'],
            ['C:\\Windows\\Fonts\\cour.ttf', 'C:\\Windows\\Fonts\\courbd.ttf'],
            ['/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'],
        ];

        foreach ($pairs as [$r, $b]) {
            if (is_file($r) && function_exists('imagettftext')) {
                $this->regular = $r;
                $this->bold    = is_file($b) ? $b : $r;
                break;
            }
        }
    }

    public function render(array $o, string $customer = ''): string
    {
        if (! function_exists('imagecreatetruecolor')) {
            throw new RuntimeException('The GD extension is required to draw receipts.');
        }

        $rows = $this->rows($o, $customer);
        $line = $this->regular ? 26 : 20;

        $height = self::PAD * 2;
        foreach ($rows as $row) {
            $height += ($row['gap'] ?? 0) + $line * count($row['lines'] ?? [1]);
        }

        $img   = imagecreatetruecolor(self::WIDTH, $height);
        $white = imagecolorallocate($img, 255, 255, 255);
        $ink   = imagecolorallocate($img, 17, 24, 39);
        imagefilledrectangle($img, 0, 0, self::WIDTH, $height, $white);

        $y = self::PAD;

        foreach ($rows as $row) {
            $y += $row['gap'] ?? 0;

            if (($row['type'] ?? '') === 'rule') {
                $this->rule($img, $ink, $y + (int) ($line / 2));
                $y += $line;
                continue;
            }

            foreach ($row['lines'] as $text) {
                $bold = (bool) ($row['bold'] ?? false);

                if (isset($row['right'])) {
                    $this->text($img, $ink, self::PAD, $y, $text, $bold);
                    $rw = $this->width($row['right'], $bold);
                    $this->text($img, $ink, self::WIDTH - self::PAD - $rw, $y, $row['right'], $bold);
                } elseif (! empty($row['center'])) {
                    $this->text($img, $ink, (int) ((self::WIDTH - $this->width($text, $bold)) / 2), $y, $text, $bold);
                } else {
                    $this->text($img, $ink, self::PAD, $y, $text, $bold);
                }

                $y += $line;
            }
        }

        ob_start();
        imagejpeg($img, null, 92);
        $bytes = (string) ob_get_clean();


        return $bytes;
    }

    /** The receipt content - same fields the on-screen digital receipt shows. */
    private function rows(array $o, string $customer): array
    {
        $money = fn ($n) => 'PHP ' . number_format((float) $n, 2);
        $inner = self::WIDTH - self::PAD * 2;

        $when = $o['appoint_closed'] ?? $o['deliver_end'] ?? $o['ord_completed'] ?? null;
        try {
            $when = $when ? Carbon::parse($when) : Carbon::now();
        } catch (Throwable) {
            $when = Carbon::now();
        }

        $status = strtolower((string) ($o['ord_status'] ?? 'claimed'));
        $rows   = [
            ['lines' => ['TINDAHAN NI ISKO'], 'bold' => true, 'center' => true],
            ['lines' => ['Bicol University Student Council'], 'center' => true],
            ['lines' => ['OFFICIAL RECEIPT'], 'bold' => true, 'center' => true, 'gap' => 8],
            ['type' => 'rule', 'gap' => 6],
            ['lines' => ['Receipt No.'], 'right' => 'RCPT-' . str_pad((string) ($o['ord_id'] ?? 0), 6, '0', STR_PAD_LEFT)],
            ['lines' => ['Order'], 'right' => (string) ($o['ord_tag'] ?? ('#' . ($o['ord_id'] ?? '')))],
            ['lines' => [ucfirst($status) . ' on'], 'right' => $when->format('M d, Y h:i A')],
        ];

        if ($customer !== '') {
            $rows[] = ['lines' => ['Customer'], 'right' => $customer];
        }

        $rows[] = ['lines' => ['Fulfillment'], 'right' => ($o['dispatch_type'] ?? 'pickup') === 'delivery' ? 'Courier Delivery' : 'Store Pickup'];
        $rows[] = ['type' => 'rule', 'gap' => 6];

        $subtotal = 0.0;
        foreach (($o['items'] ?? []) as $item) {
            $name  = (string) ($item['prod_name'] ?? $item['product']['prod_name'] ?? 'Item');
            $var   = (string) ($item['prodvar_name'] ?? '');
            $qty   = (int) ($item['qty'] ?? 0);
            $unit  = (float) ($item['amount'] ?? 0);
            $total = (float) ($item['line_total'] ?? $qty * $unit);
            $subtotal += $total;

            $title = $this->wrap($name . ($var !== '' ? ' (' . $var . ')' : ''), $inner);
            $rows[] = ['lines' => $title, 'bold' => true];
            $rows[] = ['lines' => ['  ' . $qty . ' x ' . $money($unit)], 'right' => $money($total)];
        }

        $rows[] = ['type' => 'rule', 'gap' => 6];

        $fee = (float) ($o['deliver_fee_charged'] ?? 0);
        if ($fee > 0) {
            $rows[] = ['lines' => ['Subtotal'], 'right' => $money($subtotal)];
            $rows[] = ['lines' => ['Delivery fee'], 'right' => $money($fee)];
        }

        $rows[] = ['lines' => ['TOTAL'], 'right' => $money($o['ord_amount'] ?? $subtotal), 'bold' => true];

        $rows[] = ['lines' => ['Payment'], 'right' => (string) match (strtolower((string) ($o['pay_method'] ?? ''))) {
            'cash'                                     => 'Cash',
            'digital'                                  => 'Digital Wallet',
            'gcash'                                    => 'GCash',
            'maya', 'paymaya'                          => 'Maya',
            'card'                                     => 'Card',
            'grab_pay', 'grabpay'                      => 'GrabPay',
            'qrph'                                     => 'QR Ph',
            default                                    => 'Online Payment',
        }, 'gap' => 6];

        if (isset($o['pay_given'])) {
            $rows[] = ['lines' => ['Amount received'], 'right' => $money($o['pay_given'])];
        }
        if (isset($o['pay_change'])) {
            $rows[] = ['lines' => ['Change'], 'right' => $money($o['pay_change'])];
        }
        if (! empty($o['pay_ref'])) {
            $rows[] = ['lines' => $this->wrap('Ref: ' . $o['pay_ref'], $inner)];
        }

        $rows[] = ['type' => 'rule', 'gap' => 6];
        $rows[] = ['lines' => ['Thank you, Iskolar!'], 'bold' => true, 'center' => true, 'gap' => 4];
        $rows[] = ['lines' => ['Keep this receipt as proof of purchase.'], 'center' => true];

        return $rows;
    }

    private function wrap(string $text, int $max): array
    {
        $lines = [];
        $cur   = '';

        foreach (preg_split('/\s+/', trim($text)) ?: [] as $word) {
            $try = $cur === '' ? $word : $cur . ' ' . $word;
            if ($cur !== '' && $this->width($try, true) > $max) {
                $lines[] = $cur;
                $cur     = $word;
            } else {
                $cur = $try;
            }
        }

        $lines[] = $cur;

        return $lines;
    }

    private function width(string $t, bool $bold): int
    {
        if ($this->regular) {
            $b = imagettfbbox(self::SIZE, 0, $bold ? $this->bold : $this->regular, $t);

            return (int) ($b[2] - $b[0]);
        }

        return strlen($t) * imagefontwidth(4);
    }

    private function text($img, int $color, int $x, int $y, string $t, bool $bold): void
    {
        if ($this->regular) {
            imagettftext($img, self::SIZE, 0, $x, $y + 18, $color, $bold ? $this->bold : $this->regular, $t);

            return;
        }

        imagestring($img, 4, $x, $y, $t, $color);
    }

    private function rule($img, int $color, int $y): void
    {
        imagesetstyle($img, [$color, $color, $color, IMG_COLOR_TRANSPARENT, IMG_COLOR_TRANSPARENT]);
        imageline($img, self::PAD, $y, self::WIDTH - self::PAD, $y, IMG_COLOR_STYLED);
    }
}
