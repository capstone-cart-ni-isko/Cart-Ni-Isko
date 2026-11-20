<?php

return [

    /*
        Demo mode. There is no SMS gateway, so customer codes are delivered
        to the in-app notification inbox. With demo mode ON the verification
        screens read the code back and pre-fill it (convenient for a demo,
        but it proves nothing about owning the phone number). With it OFF the
        code is never returned by the API. Password-recovery codes are never
        returned either way - recovery uses the account's recovery code.
    */
    'demo_mode' => filter_var(env('OTP_DEMO_MODE', env('OTP_AUTOFILL', false)), FILTER_VALIDATE_BOOL),

    'autofill' => filter_var(env('OTP_DEMO_MODE', env('OTP_AUTOFILL', false)), FILTER_VALIDATE_BOOL),

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
