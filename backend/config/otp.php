<?php

return [

    'autofill' => filter_var(env('OTP_AUTOFILL', true), FILTER_VALIDATE_BOOL),

];
