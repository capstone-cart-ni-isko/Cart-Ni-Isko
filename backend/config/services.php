<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    | PayMongo - the ONLY way a preorder (pickup or delivery) and its delivery
    | fee may be paid: business rule 55 and REQ-CHECKOUT-03.
    |
    | `webhook_secret` is the secret of the WEBHOOK ENDPOINT (Dashboard ->
    | Settings -> Webhooks), not the API key - the signature is HMAC-SHA256 of
    | "{timestamp}.{raw_body}" with that secret. It falls back to the API
    | secret key when it is not set.
    */
    'paymongo' => [
        'secret_key'     => env('PAYMONGO_SECRET_KEY'),
        'public_key'     => env('PAYMONGO_PUBLIC_KEY'),
        'webhook_secret' => env('PAYMONGO_WEBHOOK_SECRET'),
        'methods'        => array_values(array_filter(array_map('trim',
            explode(',', (string) env('PAYMONGO_METHODS', ''))))),
    ],

    /*
    | LalaMove - preorder delivery. Every key is optional: while they are
    | empty the store quotes its own priority/standard/saver fee and hands the
    | parcel to the courier manually, and the system keeps working end to end.
    */
    'lalamove' => [
        'environment'  => env('LALAMOVE_ENV', 'sandbox'),
        'api_key'      => env('LALAMOVE_API_KEY'),
        'api_secret'   => env('LALAMOVE_API_SECRET'),
        'market'       => env('LALAMOVE_MARKET', 'PH'),
        'language'     => env('LALAMOVE_LANGUAGE', 'en_PH'),
        'service_type' => env('LALAMOVE_SERVICE_TYPE', 'MOTORCYCLE'),
        'base_url'     => env('LALAMOVE_BASE_URL'),
    ],

    /*
    | Absolute origin of the SPA. PayMongo redirects the browser back here
    | after the hosted checkout, so it must be the FRONTEND origin, not the
    | API's.
    */
    'frontend_url' => rtrim((string) env('FRONTEND_URL', env('APP_URL', 'http://localhost')), '/'),

];
