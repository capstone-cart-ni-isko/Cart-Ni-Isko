<?php

namespace App\Exceptions;

use Exception;

/**
 * Thrown inside a checkout transaction when an ordered product no longer
 * has enough stock. Throwing rolls the transaction back (REQ-OC-02) and
 * the controller converts it into a 409 response.
 */
class InsufficientStockException extends Exception
{
}
