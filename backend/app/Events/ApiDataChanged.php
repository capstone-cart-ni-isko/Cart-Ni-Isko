<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * The one realtime ping the whole app shares.
 *
 * Every resource the spec calls "real-time" - stock (REQ-MANAGE_INV-03), order
 * status (REQ-ORD_LIST-02), appointment status and booking availability
 * (REQ-MANAGE_BOOKED-02, REQ-EMP_SCHED-02), the bag count (REQ-BAG-03) and the
 * unread-notification badge (FLOW-NOTIF-01) - is covered by the same signal:
 * after any successful mutation to `api/*`, the middleware broadcasts a bare
 * "this resource moved" ping on the private `api` channel. Clients treat it as
 * a cache invalidation hint and re-read through the ordinary REST endpoints.
 *
 * The payload deliberately carries NO row data. Joining the channel therefore
 * cannot hand an account another account's records (REQ-NOTIF-03): every client
 * only learns that its own cached reads are stale, and the re-fetch that
 * follows is the same account-scoped query it already runs.
 *
 * `ShouldBroadcastNow` (not `ShouldBroadcast`) keeps the broadcast out of the
 * queue: it runs in-process immediately, so the app needs neither a queue
 * worker nor a `jobs` table. It is only ever dispatched from a deferred
 * callback (App\Http\Middleware\CacheReads::announce), which the framework runs
 * after the response has been sent - the write that triggered it is never made
 * to wait on the WebSocket server.
 */
class ApiDataChanged implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(
        /** First path segment after `api/` - e.g. "orders", "products". */
        public string $resource,
        /** Shared write counter, so a client can drop an out-of-order ping. */
        public int $version,
    ) {
    }

    /** @return array<int, PrivateChannel> */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('api')];
    }

    public function broadcastAs(): string
    {
        return 'ApiDataChanged';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'resource' => $this->resource,
            'version' => $this->version,
        ];
    }
}
