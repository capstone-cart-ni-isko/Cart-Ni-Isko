<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PayMongoService
{
    private string $secretKey;
    private string $publicKey;
    private string $baseUrl = 'https://api.paymongo.com/v1';

    public function __construct()
    {
        $this->secretKey = (string) config('services.paymongo.secret_key');
        $this->publicKey = (string) config('services.paymongo.public_key');
    }

    public function createPaymentIntent(float $amount, string $orderId, string $description = 'Order payment'): array
    {
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

    public function refundPayment(string $paymentIntentId, float $amount): array
    {
        $amountInCentavos = (int) round($amount * 100);

        $response = Http::withBasicAuth($this->secretKey, '')
            ->timeout(10)
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

        return $response->json()['data'];
    }

    /*
        Hosted checkout page. Line item amounts are integer centavos.
        Returns the session id and the URL to redirect the customer to.
    */
    public function createCheckoutSession(array $lineItems, string $reference, string $successUrl, string $cancelUrl, string $description, array $metadata = []): array
    {
        $response = Http::withBasicAuth($this->secretKey, '')
            ->timeout(10)
            ->post("{$this->baseUrl}/checkout_sessions", [
                'data' => [
                    'attributes' => [
                        'line_items' => $lineItems,
                        'payment_method_types' => ['card', 'gcash', 'paymaya'],
                        'success_url' => $successUrl,
                        'cancel_url' => $cancelUrl,
                        'reference_number' => $reference,
                        'description' => $description,
                        'send_email_receipt' => false,
                        'show_line_items' => true,
                        'metadata' => $metadata,
                    ],
                ],
            ]);

        if ($response->failed()) {
            Log::error('PayMongo createCheckoutSession failed', [
                'status' => $response->status(),
                'body' => $response->json(),
                'reference' => $reference,
            ]);
            throw new \RuntimeException('Failed to create checkout session: ' . $response->body());
        }

        $data = $response->json('data');
        return [
            'checkout_session_id' => $data['id'],
            'checkout_url' => $data['attributes']['checkout_url'],
        ];
    }

    /*
        Header format: t=<timestamp>,te=<test signature>,li=<live signature>
        Signature = HMAC-SHA256("<t>.<raw body>", webhook secret key)
    */
    public function webhookVerify(string $payload, string $header): bool
    {
        $secret = (string) config('services.paymongo.webhook_secret');
        if ($secret === '' || $header === '') {
            return false;
        }

        $parts = [];
        foreach (explode(',', $header) as $pair) {
            [$key, $value] = array_pad(explode('=', trim($pair), 2), 2, '');
            $parts[$key] = $value;
        }

        $timestamp = $parts['t'] ?? '';
        $theirs = str_starts_with($this->secretKey, 'sk_live_') ? ($parts['li'] ?? '') : ($parts['te'] ?? '');
        if ($timestamp === '' || $theirs === '') {
            return false;
        }

        $ours = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
        return hash_equals($ours, $theirs);
    }
}