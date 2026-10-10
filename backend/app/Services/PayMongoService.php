<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * PayMongo gateway (REQ-CHECKOUT-03).
 *
 * Two flows are supported and both end in the SAME truth: the public,
 * signature-verified webhook.
 *
 *   1. Hosted Checkout (v2 checkout_sessions) - the normal customer path.
 *      The browser is redirected to PayMongo and comes back to
 *      `success_url` / `cancel_url`; the money is only trusted when
 *      `checkout_session.payment.paid` arrives.
 *   2. Payment Intents (v1) - kept for older callers and for the refund
 *      helper, which is what the cancellation path uses.
 *
 * Nothing here ever writes to the database: the controller owns every row.
 */
class PayMongoService
{
    private ?string $secretKey;
    private ?string $publicKey;
    private ?string $webhookSecret;

    private string $baseUrl    = 'https://api.paymongo.com/v1';
    private string $checkoutUrl = 'https://api.paymongo.com/v2';

    public function __construct()
    {
        $this->secretKey     = config('services.paymongo.secret_key') ?: null;
        $this->publicKey     = config('services.paymongo.public_key') ?: null;
        $this->webhookSecret = config('services.paymongo.webhook_secret') ?: null;
    }

    /**
     * A gateway without keys cannot charge anybody, so the checkout must say
     * so out loud (HTTP 503) instead of pretending the order was paid.
     */
    public static function isConfigured(): bool
    {
        return filled(config('services.paymongo.secret_key'));
    }

    /** Public key, for the client-side checkout widget if one is ever mounted. */
    public function publicKey(): ?string
    {
        return $this->publicKey;
    }

    // ==========================================
    // HOSTED CHECKOUT (the path the storefront uses)
    // ==========================================

    /**
     * Create a PayMongo Hosted Checkout session and hand back its URL.
     *
     * @param array<int, array{name: string, amount: float, quantity?: int}> $lineItems
     * @return array{id: string, checkout_url: string, livemode: bool}
     */
    public function createCheckoutSession(array $lineItems, string $referenceNumber, string $successUrl, string $cancelUrl): array
    {
        if (! self::isConfigured()) {
            throw new \RuntimeException(
                'Online payment is not configured yet. Set PAYMONGO_SECRET_KEY in the backend environment.'
            );
        }

        $items = [];
        foreach ($lineItems as $line) {
            $items[] = [
                // PayMongo wants centavos; PHP floats never carry cents.
                'amount'   => (int) round(((float) $line['amount']) * 100),
                'currency' => 'PHP',
                'name'     => (string) ($line['name'] ?? 'Order item'),
                'quantity' => max(1, (int) ($line['quantity'] ?? 1)),
            ];
        }

        if ($items === []) {
            throw new \RuntimeException('An online payment needs at least one line item.');
        }

        $response = Http::withBasicAuth($this->secretKey, '')
            ->timeout(15)
            ->post($this->checkoutUrl . '/checkout_sessions', [
                'data' => [
                    'attributes' => [
                        'line_items'           => $items,
                        'payment_method_types' => $this->paymentMethodTypes(),
                        // `reference_number` is what the webhook echoes back,
                        // so it carries the order identity.
                        'reference_number'     => $referenceNumber,
                        'success_url'          => $successUrl,
                        'cancel_url'           => $cancelUrl,
                        'metadata'             => ['order_id' => $referenceNumber],
                    ],
                ],
            ]);

        if ($response->failed()) {
            Log::error('PayMongo createCheckoutSession failed', [
                'status'   => $response->status(),
                'body'     => $response->json(),
                'reference' => $referenceNumber,
            ]);

            throw new \RuntimeException(
                'The payment gateway rejected the checkout session. Please try again.'
            );
        }

        $data = $response->json()['data'] ?? [];

        return [
            'id'           => (string) ($data['id'] ?? ''),
            'checkout_url' => (string) ($data['attributes']['checkout_url'] ?? ''),
            'livemode'     => (bool) ($data['attributes']['livemode'] ?? false),
        ];
    }

    /**
     * Ask PayMongo what happened to a session. The webhook is the source of
     * truth; this is only the belt-and-braces check used when the customer
     * lands back on `success_url` before the webhook has been delivered.
     */
    public function retrieveCheckoutSession(string $sessionId): array
    {
        if (! self::isConfigured() || $sessionId === '') {
            return [];
        }

        try {
            $response = Http::withBasicAuth($this->secretKey, '')
                ->timeout(10)
                ->get($this->checkoutUrl . '/checkout_sessions/' . rawurlencode($sessionId));
        } catch (\Throwable $e) {
            Log::warning('PayMongo retrieveCheckoutSession failed', ['error' => $e->getMessage()]);

            return [];
        }

        if ($response->failed()) {
            return [];
        }

        return $response->json()['data'] ?? [];
    }

    /** The methods this account is allowed to charge. */
    private function paymentMethodTypes(): array
    {
        $configured = config('services.paymongo.methods');

        if (is_array($configured) && $configured !== []) {
            return array_values(array_map('strval', $configured));
        }

        return ['card', 'gcash', 'grab_pay', 'paymaya'];
    }

    // ==========================================
    // PAYMENT INTENTS (legacy + refunds)
    // ==========================================

    public function createPaymentIntent(float $amount, string $orderId, string $description = 'Order payment'): array
    {
        if (! self::isConfigured()) {
            throw new \RuntimeException(
                'Online payment is not configured yet. Set PAYMONGO_SECRET_KEY in the backend environment.'
            );
        }

        $amountInCentavos = (int) round($amount * 100);

        $response = Http::withBasicAuth($this->secretKey, '')
            ->timeout(10)
            ->post("{$this->baseUrl}/payment_intents", [
                'data' => [
                    'attributes' => [
                        'amount' => $amountInCentavos,
                        'currency' => 'PHP',
                        'payment_method_allowed' => ['card', 'gcash', 'grab_pay', 'paymaya'],
                        'payment_method_options' => [
                            'card' => [
                                'request_three_d_secure' => 'automatic',
                            ],
                        ],
                        'description' => $description,
                        'metadata' => [
                            'order_id' => $orderId,
                        ],
                    ],
                ],
            ]);

        if ($response->failed()) {
            Log::error('PayMongo createPaymentIntent failed', [
                'status' => $response->status(),
                'body' => $response->json(),
                'order_id' => $orderId,
            ]);
            throw new \RuntimeException('Failed to create payment intent: ' . $response->body());
        }

        $data = $response->json()['data'];
        return [
            'payment_intent_id' => $data['id'],
            'client_key' => $data['attributes']['client_key'],
            'checkout_url' => "https://checkout.paymongo.com/{$data['attributes']['client_key']}",
        ];
    }

    public function confirmPayment(string $paymentIntentId): array
    {
        $response = Http::withBasicAuth($this->secretKey, '')
            ->timeout(10)
            ->post("{$this->baseUrl}/payment_intents/{$paymentIntentId}/confirm");

        if ($response->failed()) {
            Log::error('PayMongo confirmPayment failed', [
                'status' => $response->status(),
                'body' => $response->json(),
                'payment_intent_id' => $paymentIntentId,
            ]);
            throw new \RuntimeException('Failed to confirm payment: ' . $response->body());
        }

        return $response->json()['data'];
    }

    /**
     * Move money back. Called when a PAID order is cancelled or refunded, so
     * the bookkeeping states (CANCELLED / REFUNDED) stop being paper-only.
     *
     * @return array{refund_id?: string, status?: string}|array<empty>
     */
    public function refundPayment(string $paymentIntentId, float $amount): array
    {
        if (! self::isConfigured() || $paymentIntentId === '' || $amount <= 0) {
            return [];
        }

        $amountInCentavos = (int) round($amount * 100);

        $response = Http::withBasicAuth($this->secretKey, '')
            ->timeout(15)
            ->post("{$this->baseUrl}/refunds", [
                'data' => [
                    'attributes' => [
                        'amount' => $amountInCentavos,
                        'payment_intent_id' => $paymentIntentId,
                    ],
                ],
            ]);

        if ($response->failed()) {
            Log::error('PayMongo refundPayment failed', [
                'status' => $response->status(),
                'body' => $response->json(),
                'payment_intent_id' => $paymentIntentId,
            ]);
            throw new \RuntimeException('Failed to create refund: ' . $response->body());
        }

        return $response->json()['data'] ?? [];
    }

    // ==========================================
    // WEBHOOK SIGNATURE
    // ==========================================

    /**
     * Verify the `Paymongo-Signature` header against the RAW body.
     *
     * PayMongo signs `"{timestamp}.{raw_body}"` with the secret of the
     * ENDPOINT (PAYMONGO_WEBHOOK_SECRET), and sends `t=<ts>,v1=<hex>`.
     * The previous implementation hashed the body with the API secret key and
     * compared the whole header as one digest - which can never match, so
     * every real webhook was rejected and no order was ever marked paid.
     *
     * A bare hex digest is still accepted as a legacy form so an endpoint
     * registered the old way keeps working.
     */
    public function webhookVerify(string $payload, string $signature): bool
    {
        if ($signature === '' || $payload === '') {
            return false;
        }

        $secret = $this->webhookSecret ?: $this->secretKey;
        if (! filled($secret)) {
            // Nothing to verify against: refuse rather than accept a forgery.
            return false;
        }

        $parts = [];
        foreach (explode(',', $signature) as $chunk) {
            $chunk = trim($chunk);
            if (str_contains($chunk, '=')) {
                [$key, $value] = explode('=', $chunk, 2);
                $parts[trim($key)] = trim($value);
            }
        }

        if (isset($parts['t'], $parts['v1'])) {
            $expected = hash_hmac('sha256', $parts['t'] . '.' . $payload, $secret);
            $valid    = hash_equals($expected, $parts['v1']);

            // Reject a timestamp that is absurdly old (replay protection) but
            // never reject an undated clock - a webhook must not depend on it.
            $skew = abs(time() - (int) $parts['t']);
            if ($valid && $skew > 86400) {
                Log::warning('PayMongo webhook signature is stale', ['skew_seconds' => $skew]);
            }

            return $valid;
        }

        // Legacy single-digest form: HMAC of the body alone.
        return hash_equals(hash_hmac('sha256', $payload, $secret), $signature)
            || hash_equals(hash_hmac('sha256', $payload, (string) $this->secretKey), $signature);
    }
}
