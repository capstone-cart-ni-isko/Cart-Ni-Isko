<?php

return [

    'autofill' => filter_var(env('OTP_AUTOFILL', true), FILTER_VALIDATE_BOOL),

    /*
        Two-factor sign-in for employees: after the password, a 6-digit code
        is emailed to the employee's Bicol University address and must be
        entered before a session opens.

        'auto' (the default) turns it on only when a real mail transport is
        configured (MAIL_MAILER is not log/array), so staff are never locked
        out of a deployment that cannot send email yet. Set STAFF_LOGIN_2FA
        to true or false to force it either way.
    */
    'staff_login' => env('STAFF_LOGIN_2FA', 'auto'),

];
