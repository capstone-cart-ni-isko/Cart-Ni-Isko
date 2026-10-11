<?php

use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
|
| The single channel the realtime layer uses. Every signed-in account - a
| customer in the storefront or an employee in the staff portal - joins the
| same private `api` channel and receives the same generic "resource changed"
| pings (App\Events\ApiDataChanged).
|
| The ping carries no rows, so joining can never leak another account's data
| (REQ-NOTIF-03): a client only learns that its cached reads are stale and
| re-fetches through the ordinary, account-scoped REST endpoints. That is why
| one shared channel is enough instead of a channel per account.
|
| `guards => ['api']` pins the authorization to the signed bearer guard, so a
| request that carries no valid token is refused instead of quietly joining.
| The channel is private (`private-api`), so the WebSocket server asks the
| /broadcasting/auth endpoint for a signature before it will deliver anything.
|
*/

Broadcast::channel('api', fn ($user) => $user !== null, ['guards' => ['api']]);
