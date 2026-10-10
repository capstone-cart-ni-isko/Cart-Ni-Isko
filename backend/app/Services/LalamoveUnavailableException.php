<?php

namespace App\Services;

/**
 * Raised when LalaMove cannot quote or book a delivery - credentials absent,
 * network down, or the API answered with an error.
 *
 * It extends \RuntimeException so every existing `catch (\RuntimeException)`
 * in the checkout path degrades exactly as it does for any other rejected
 * step, while the delivery code can still tell "the courier is unavailable"
 * apart from a business-rule rejection.
 */
class LalamoveUnavailableException extends \RuntimeException
{
}
