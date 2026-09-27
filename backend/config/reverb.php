<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Reverb Server Configuration
    |--------------------------------------------------------------------------
    |
    | This configuration file defines the settings for the Laravel Reverb
    | WebSocket server. Reverb is a high-performance WebSocket server
    | written in PHP that can handle thousands of concurrent connections.
    |
    */

    'host' => env('REVERB_HOST', '127.0.0.1'),

    'port' => env('REVERB_PORT', 8080),

    'scheme' => env('REVERB_SCHEME', 'http'),

    'app' => [
        'id' => env('REVERB_APP_ID', 'cartniisko'),
        'key' => env('REVERB_APP_KEY', 'cartniisko-key'),
        'secret' => env('REVERB_APP_SECRET', 'cartniisko-secret'),
    ],

    'ssl' => [
        'local_cert' => env('REVERB_SSL_LOCAL_CERT'),
        'local_pk' => env('REVERB_SSL_LOCAL_PK'),
        'passphrase' => env('REVERB_SSL_PASSPHRASE'),
        'verify_peer' => false,
    ],

    'allowed_origins' => [
        env('FRONTEND_URL', 'http://localhost:5173'),
        'http://localhost:5173',
        'http://localhost:3000',
    ],

    'max_message_size' => 1024 * 1024, // 1MB

    'ping_interval' => 30,

    'connection_limit' => 10000,

    'statistics' => [
        'enabled' => true,
        'interval' => 60,
    ],

];