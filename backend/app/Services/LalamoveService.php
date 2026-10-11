<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * LalaMove v3 courier client (preorder delivery).
 *
 * Every delivery that leaves the store is booked through LalaMove: the fee is
 * quoted at checkout, the courier order is placed once PayMongo confirms the
 * money, and the driver status is pushed back by webhook.
 *
 * The credentials are OPTIONAL. When they are missing (or the quote fails)
 * the service reports `isConfigured() === false` / throws
 * {@see LalamoveUnavailableException} and the caller falls back to the store's
 * own priority/standard/saver fee table - so checkout keeps working before
 * the account exists and switches to live courier pricing the moment the keys
 * are added.
 *
 * Contract (v3):
 *   SIGNATURE = hex( HMAC_SHA256( "<ms>\r\n<METHOD>\r\n<PATH>\r\n\r\n<BODY>", secret ) )
 *   Authorization: hmac <apiKey>:<ms>:<SIGNATURE>
 *   Market: PH      Request-ID: <nonce>
 */
class LalamoveService
{
    private ?string $apiKey;
    private ?string $apiSecret;
    private string $market;
    private string $language;
    private string $serviceType;
    private string $environment;
    private ?string $baseUrlOverride;

    public function __construct()
    {
        $this->apiKey          = config('services.lalamove.api_key') ?: null;
        $this->apiSecret       = config('services.lalamove.api_secret') ?: null;
        $this->market          = (string) config('services.lalamove.market', 'PH');
        $this->language        = (string) config('services.lalamove.language', 'en_PH');
        $this->serviceType     = (string) config('services.lalamove.service_type', 'MOTORCYCLE');
        $this->environment     = (string) config('services.lalamove.environment', 'sandbox');
        $this->baseUrlOverride = config('services.lalamove.base_url') ?: null;
    }

    public static function isConfigured(): bool
    {
        return filled(config('services.lalamove.api_key'))
            && filled(config('services.lalamove.api_secret'));
    }

    public static function market(): string
    {
        return (string) config('services.lalamove.market', 'PH');
    }

    public static function language(): string
    {
        return (string) config('services.lalamove.language', 'en_PH');
    }

    public static function serviceType(): string
    {
        return (string) config('services.lalamove.service_type', 'MOTORCYCLE');
    }

    public static function environment(): string
    {
        return strtolower((string) config('services.lalamove.environment', 'sandbox')) === 'production'
            ? 'production' : 'sandbox';
    }

    public function baseUrl(): string
    {
        if ($this->baseUrlOverride) {
            return rtrim($this->baseUrlOverride, '/');
        }

        return self::environment() === 'production'
            ? 'https://rest.lalamove.com/v3'
            : 'https://rest.sandbox.lalamove.com/v3';
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Price a delivery.
     *
     * @param array<int, array{address: string, lat?: string|int|float|null, lng?: string|int|float|null}> $stops
     *        at least two entries: [pickup, dropoff, ...extra dropoffs]
     * @return array{quotation_id: string, total: float, currency: string,
     *               expires_at: ?string, distance_m: ?int, service_type: string,
     *               stops: array, raw: array}
     */
    public function quote(array $stops, ?string $scheduleAt = null, ?string $serviceType = null): array
    {
        $this->assertConfigured();

        if (count($stops) < 2) {
            throw new LalamoveUnavailableException('A delivery needs a pickup and a drop-off point.');
        }

        $payload = [
            'data' => [
                'serviceType' => $serviceType ?: $this->serviceType,
                'language'    => $this->language,
                'stops'       => array_values(array_map([$this, 'normaliseStop'], $stops)),
            ],
        ];

        if (filled($scheduleAt)) {
            $payload['data']['scheduleAt'] = $scheduleAt;
        }

        $response = $this->request('POST', '/quotations', $payload);
        $data     = $response['data'] ?? [];

        $total = (float) ($data['priceBreakdown']['total'] ?? 0);

        return [
            'quotation_id' => (string) ($data['quotationId'] ?? ''),
            'total'        => round($total, 2),
            'currency'     => (string) ($data['priceBreakdown']['currency'] ?? 'PHP'),
            'expires_at'   => $data['expiresAt'] ?? null,
            'distance_m'   => isset($data['distance']['value']) ? (int) $data['distance']['value'] : null,
            'service_type' => (string) ($data['serviceType'] ?? ($serviceType ?: $this->serviceType)),
            'stops'        => $data['stops'] ?? [],
            'raw'          => $data,
        ];
    }

    /**
     * Book the courier. The quotation must be younger than five minutes -
     * LalaMove honours the quoted price inside that window.
     *
     * @param array{stopId?: string, name: string, phone: string}   $sender
     * @param array<int, array{stopId: string, name: string, phone: string, remarks?: string}> $recipients
     * @return array{order_id: string, status: string, share_link: ?string,
     *               driver_id: ?string, total: float, currency: string, raw: array}
     */
    public function placeOrder(string $quotationId, array $sender, array $recipients, array $metadata = []): array
    {
        $this->assertConfigured();

        if ($quotationId === '' || $recipients === []) {
            throw new LalamoveUnavailableException('A valid quotation and recipient are required to book a delivery.');
        }

        $payload = [
            'data' => [
                'quotationId' => $quotationId,
                'sender'      => [
                    'stopId' => (string) ($sender['stopId'] ?? ''),
                    'name'   => (string) ($sender['name'] ?? ''),
                    'phone'  => (string) ($sender['phone'] ?? ''),
                ],
                'recipients'  => array_values($recipients),
                'isPODEnabled' => true,
            ],
        ];

        if ($metadata !== []) {
            $payload['data']['metadata'] = $metadata;
        }

        $response = $this->request('POST', '/orders', $payload);
        $data     = $response['data'] ?? [];

        return [
            'order_id'   => (string) ($data['orderId'] ?? ''),
            'status'     => (string) ($data['status'] ?? ''),
            'share_link' => isset($data['shareLink']) && $data['shareLink'] !== '' ? (string) $data['shareLink'] : null,
            'driver_id'  => isset($data['driverId']) && $data['driverId'] !== '' ? (string) $data['driverId'] : null,
            'total'      => round((float) ($data['priceBreakdown']['total'] ?? 0), 2),
            'currency'   => (string) ($data['priceBreakdown']['currency'] ?? 'PHP'),
            'raw'        => $data,
        ];
    }

    /** @return array{status: string, share_link: ?string, driver_id: ?string, raw: array} */
    public function orderDetails(string $orderId): array
    {
        $this->assertConfigured();

        $data = $this->request('GET', '/orders/' . rawurlencode($orderId))['data'] ?? [];

        return [
            'status'     => (string) ($data['status'] ?? ''),
            'share_link' => $data['shareLink'] ?? null,
            'driver_id'  => $data['driverId'] ?? null,
            'raw'        => $data,
        ];
    }

    /**
     * Cancel a courier order LalaMove still allows us to cancel (see their
     * cancellation policy: ASSIGNING_DRIVER, or under five minutes matched).
     *
     * @return array{cancelled: bool, message: string}
     */
    public function cancelOrder(string $orderId): array
    {
        $this->assertConfigured();

        try {
            $this->request('DELETE', '/orders/' . rawurlencode($orderId));
        } catch (LalamoveUnavailableException $e) {
            return ['cancelled' => false, 'message' => $e->getMessage()];
        }

        return ['cancelled' => true, 'message' => 'Courier order cancelled.'];
    }

    /**
     * Point LalaMove at our webhook endpoint. Registered once per environment
     * (their own best practice) - safe to call repeatedly, it is a PATCH.
     */
    public function registerWebhook(string $url): array
    {
        $this->assertConfigured();

        return $this->request('PATCH', '/webhook', ['data' => ['url' => $url]]);
    }

    // ==========================================
    // TRANSPORT
    // ==========================================

    private function assertConfigured(): void
    {
        if (! self::isConfigured()) {
            throw new LalamoveUnavailableException(
                'LalaMove is not configured yet. Set LALAMOVE_API_KEY and LALAMOVE_API_SECRET.'
            );
        }
    }

    /**
     * @return array<string, mixed>
     * @throws LalamoveUnavailableException on any transport/API failure
     */
    private function request(string $method, string $path, ?array $body = null): array
    {
        $this->assertConfigured();

        $json       = $body === null ? '' : json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $timestamp  = (string) (int) (microtime(true) * 1000);
        $raw        = $timestamp . "\r\n" . strtoupper($method) . "\r\n" . $path . "\r\n\r\n" . $json;
        $signature  = hash_hmac('sha256', $raw, (string) $this->apiSecret);

        $url = $this->baseUrl() . $path;

        try {
            $response = Http::withHeaders([
                'Authorization' => 'hmac ' . $this->apiKey . ':' . $timestamp . ':' . $signature,
                'Market'        => $this->market,
                'Request-ID'    => (string) \Illuminate\Support\Str::uuid(),
                'Content-Type'  => 'application/json',
            ])->timeout(20)->$method($url, $body === null ? [] : $body);
        } catch (\Throwable $e) {
            Log::warning('LalaMove request failed', ['method' => $method, 'path' => $path, 'error' => $e->getMessage()]);
            throw new LalamoveUnavailableException('The courier service could not be reached.');
        }

        if ($response->failed()) {
            $message = $this->errorMessage($response->json(), $response->status());

            Log::warning('LalaMove API error', [
                'method'  => $method,
                'path'    => $path,
                'status'  => $response->status(),
                'message' => $message,
            ]);

            throw new LalamoveUnavailableException($message);
        }

        if ($response->status() === 204 || $response->body() === '') {
            return [];
        }

        return $response->json() ?? [];
    }

    private function errorMessage($json, int $status): string
    {
        $id = $json['message'] ?? ($json['errors'][0]['id'] ?? null)
            ?? ($json['errors']['id'] ?? null) ?? null;

        $map = [
            'ERR_INSUFFICIENT_CREDIT'   => 'The LalaMove wallet has no credit left.',
            'ERR_INVALID_SERVICE_TYPE'  => 'This vehicle type is not available in the delivery city.',
            'ERR_OUT_OF_SERVICE_AREA'   => 'The delivery address is outside LalaMove coverage.',
            'ERR_REVERSE_GEOCODE_FAILURE' => 'The delivery address could not be located.',
            'ERR_INVALID_PHONE_NUMBER'  => 'The recipient phone number is not in international format.',
            'ERR_RATE_LIMIT_EXCEEDED'   => 'The courier service is busy. Please try again shortly.',
            'ERR_CANCELLATION_FORBIDDEN' => 'LalaMove no longer allows this delivery to be cancelled.',
            'ERR_INSUFFICIENT_STOPS'    => 'A delivery needs a pickup and a drop-off point.',
        ];

        if (is_string($id) && isset($map[$id])) {
            return $map[$id];
        }

        if (is_string($id) && str_starts_with($id, 'ERR_')) {
            return 'The courier service rejected the request (' . $id . ').';
        }

        return $status >= 500
            ? 'The courier service is temporarily unavailable.'
            : 'The courier service could not process this request.';
    }

    /** LalaMove wants coordinates as strings with up to 15 decimals. */
    private function normaliseStop(array $stop): array
    {
        $out = ['address' => (string) ($stop['address'] ?? '')];

        $lat = $stop['lat'] ?? ($stop['coordinates']['lat'] ?? null);
        $lng = $stop['lng'] ?? ($stop['coordinates']['lng'] ?? null);

        if (is_numeric($lat) && is_numeric($lng)) {
            $out['coordinates'] = [
                'lat' => $this->coord($lat),
                'lng' => $this->coord($lng),
            ];
        }

        return $out;
    }

    private function coord($value): string
    {
        $string = (string) $value;

        if (str_contains($string, 'E') || str_contains($string, '.')) {
            $string = rtrim(rtrim(number_format((float) $value, 15, '.', ''), '0'), '.');
        }

        return $string === '' || $string === '-0' ? '0' : $string;
    }
}
