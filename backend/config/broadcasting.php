<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Broadcaster
    |--------------------------------------------------------------------------
    |
    | This option controls the default broadcaster that will be used by the
    | framework when an event needs to be broadcast. You may set this to
    | any of the connections defined in the "connections" array below.
    |
    | Supported: "pusher", "ably", "reverb", "log", "null"
    |
    */

    'default' => env('BROADCAST_CONNECTION', 'reverb'),

    /*
    |--------------------------------------------------------------------------
    | Broadcast Connections
    |--------------------------------------------------------------------------
    |
    | Here you may define all of the broadcast connections that will be used
    | to broadcast events to other systems or over websockets. Samples of
    | each available type of connection are provided below.
    |
    */

    'connections' => [

        'pusher' => [
            'driver' => 'pusher',
            'key' => env('PUSHER_APP_KEY'),
            'secret' => env('PUSHER_APP_SECRET'),
            'app_id' => env('PUSHER_APP_ID'),
            // Pusher Channels (hosted). With no host set, the Pusher client
            // talks to api-<cluster>.pusher.com over HTTPS. Production uses
            // this (BROADCAST_CONNECTION=pusher); local dev keeps Reverb.
            'options' => [
                'cluster' => env('PUSHER_APP_CLUSTER', 'ap1'),
                'useTLS' => true,
                'encrypted' => true,
            ],
            'client_options' => [
                // Same reasoning as Reverb below: a ping is best-effort, so a
                // slow or unreachable Pusher must not pin a PHP worker.
                'connect_timeout' => 1,
                'timeout' => 2,
            ],
        ],

        'ably' => [
            'driver' => 'ably',
            'key' => env('ABLY_KEY'),
        ],

        'reverb' => [
            'driver' => 'reverb',
            // Same fallbacks as config/reverb.php: channels are registered at
            // boot, so a null key here breaks `composer install` and startup
            // wherever REVERB_* is not set (the Docker build, Render).
            'key' => env('REVERB_APP_KEY', 'cartniisko-key'),
            'secret' => env('REVERB_APP_SECRET', 'cartniisko-secret'),
            'app_id' => env('REVERB_APP_ID', 'cartniisko'),
            'options' => [
                'host' => env('REVERB_HOST', '127.0.0.1'),
                'port' => env('REVERB_PORT', 8080),
                'scheme' => env('REVERB_SCHEME', 'http'),
                'encrypted' => false,
            ],
            'client_options' => [
                // A broadcast is best-effort and already runs after the
                // response (CacheReads::announce), but the PHP worker stays
                // busy until the HTTP publish returns. If Reverb is down the
                // default 10s connect / 30s read would pin that worker for
                // half a minute, so cap both hard - the ping is simply lost
                // and the next write retries.
                'connect_timeout' => 1,
                'timeout' => 2,
            ],
        ],

        'log' => [
            'driver' => 'log',
        ],

        'null' => [
            'driver' => 'null',
        ],

    ],

];