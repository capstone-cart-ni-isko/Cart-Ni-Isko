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
        $this->secretKey = config('services.paymongo.secret_key');
        $this->publicKey = config('services.paymongo.public_key');
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

    public function webhookVerify(string $payload, string $signature): bool
    {
        $expectedSignature = hash_hmac('sha256', $payload, $this->secretKey);
        return hash_equals($expectedSignature, $signature);
    }
}