<?php

namespace App\Support;

use Illuminate\Database\LostConnectionDetector;

/**
 * Adds the two PostgreSQL/pooler failures this deployment actually sees to
 * Laravel's retry list, so a blip on the Tokyo link re-connects instead of
 * surfacing a 500.
 *
 * The stock detector only recognises a handful of pg messages. Supabase's
 * Supavisor pooler raises two others that it does not know about:
 *
 *  - "timeout expired" - raised by PDO::ATTR_TIMEOUT (set in
 *    config/database.php) when a connect attempt is blackholed. Without this
 *    entry the timeout became a hard failure even though a retry would
 *    immediately succeed on the next pooler socket.
 *  - "SQLSTATE[08006]" - the generic pgsql "connection to server ...
 *    failed" class, which covers server restarts and pooler failovers.
 *
 * Retries are bounded by Laravel itself (one re-attempt inside
 * Connector::createConnection), so this cannot loop.
 */
class SupabaseLostConnectionDetector extends LostConnectionDetector
{
    public function causedByLostConnection(\Throwable $e): bool
    {
        $message = $e->getMessage();

        if (str_contains($message, 'timeout expired')) {
            return true;
        }

        if (str_contains($message, 'SQLSTATE[08006]')
            // A permanent auth/config rejection will fail again identically,
            // so re-connecting only burns another round trip.
            && ! str_contains($message, 'password authentication failed')
            && ! str_contains($message, 'no PostgreSQL user name specified')) {
            return true;
        }

        return parent::causedByLostConnection($e);
    }
}
