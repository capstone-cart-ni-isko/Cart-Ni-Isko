<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class InputValidatorAPI extends Controller
{
    // JSON RESPONSE HELPER
    protected function fail(string $message, int $status = 400)
    {
        return response()->json([
            'success' => false,
            'message' => $message
        ], $status);
    }

    // ==========================================
    // ACTION VALIDATORS
    // ==========================================

    public function customerSignup(Request $json)
    {
        // Required Fields for Customer Signup
        $requiredCheck = $this->validateFields($json, [
            'phone'    => 'required',
            'password' => 'required',
            'nickname' => 'required',
        ], [
            'phone.required'    => 'Phone number is required.',
            'password.required' => 'Password is required.',
            'nickname.required' => 'Nickname is required.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        // Run Format Validations (Nullable fields validated if present)
        return $this->validateAllFormats($json);
    }

    public function customerLogin(Request $json)
    {
        $requiredCheck = $this->validateFields($json, [
            'phone'    => 'required',
            'password' => 'required',
        ], [
            'phone.required' => 'Phone is required to log in.',
            'password.required'      => 'Password is required.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        return $this->validateAllFormats($json);
    }

    public function employeeSignup(Request $json)
    {
        // Required Fields for Employee Signup
        $requiredCheck = $this->validateFields($json, [
            'email'    => 'required',
            'password' => 'required',
            'surname'  => 'required',
            'givname'  => 'required',
            'studnum'  => 'required',
        ], [
            'email.required'    => 'Email is required.',
            'password.required' => 'Password is required.',
            'surname.required'  => 'Surname is required.',
            'givname.required'  => 'Given name is required.',
            'studnum.required'  => 'Student number is required.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        return $this->validateAllFormats($json);
    }

    public function employeeLogin(Request $json)
    {
        $requiredCheck = $this->validateFields($json, [
            'email'    => 'required',
            'password' => 'required',
        ], [
            'email.required'    => 'Email is required.',
            'password.required' => 'Password is required.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        return $this->validateAllFormats($json);
    }

    // Central runner for all format checks present in the request
    protected function validateAllFormats(Request $json)
    {
        $checks = [
            $this->email($json),
            $this->backupEmail($json),
            $this->phone($json),
            $this->backupPhone($json),
            $this->password($json),
            $this->nickname($json),
            $this->birthday($json),
            $this->names($json),
            $this->callcodes($json),
            $this->generalStrings($json),
            $this->booleans($json)
        ];

        foreach ($checks as $check) {
            if ($check) return $check;
        }

        return null;
    }

    // ==========================================
    // REUSABLE FIELD FORMAT VALIDATORS
    // ==========================================

    public function email(Request $json)
    {
        return $this->validateFields($json, [
            'email' => 'nullable|email:rfc,dns'
        ], [
            'email.email' => 'Invalid email format.'
        ]);
    }

    public function backupEmail(Request $json)
    {
        return $this->validateFields($json, [
            'backupemail' => 'nullable|email:rfc,dns'
        ], [
            'backupemail.email' => 'Invalid backup email format.'
        ]);
    }

    public function phone(Request $json)
    {
        return $this->validateFields($json, [
            'phone' => 'nullable|regex:/^[0-9]{11}$/'
        ], [
            'phone.regex' => 'Phone number must be exactly 11 digits.'
        ]);
    }

    public function backupPhone(Request $json)
    {
        return $this->validateFields($json, [
            'backupphone' => 'nullable|regex:/^[0-9]{11}$/'
        ], [
            'backupphone.regex' => 'Backup phone number must be exactly 11 digits.'
        ]);
    }

    public function password(Request $json)
    {
        return $this->validateFields($json, [
            'password' => [
                'nullable',
                'string',
                'min:8',
                'regex:/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/'
            ]
        ], [
            'password.min'   => 'Password must be at least 8 characters.',
            'password.regex' => 'Password must contain at least one letter, one number, and one special character.'
        ]);
    }

    public function nickname(Request $json)
    {
        return $this->validateFields($json, [
            'nickname' => 'nullable|string|min:4|regex:/^[A-Za-z0-9_]+$/'
        ], [
            'nickname.min'   => 'Nickname must be at least 4 characters.',
            'nickname.regex' => 'Nickname can only contain letters, numbers, and underscores.'
        ]);
    }

    public function birthday(Request $json)
    {
        return $this->validateFields($json, [
            'birthday' => 'nullable|date|before:today'
        ], [
            'birthday.date'   => 'Birthday must be a valid date.',
            'birthday.before' => 'Birthday must be a date in the past.'
        ]);
    }

    public function names(Request $json)
    {
        return $this->validateFields($json, [
            'surname' => 'nullable|string|max:100',
            'givname' => 'nullable|string|max:100',
            'midname' => 'nullable|string|max:100',
            'suffix'  => 'nullable|string|max:20',
        ], [
            'surname.string' => 'Surname must be a string.',
            'givname.string' => 'Given name must be a string.',
            'midname.string' => 'Middle name must be a string.',
            'suffix.string'  => 'Suffix must be a string.',
        ]);
    }

    public function callcodes(Request $json)
    {
        return $this->validateFields($json, [
            'callcode'       => 'nullable|regex:/^\+?[0-9]{1,4}$/',
            'backupcallcode' => 'nullable|regex:/^\+?[0-9]{1,4}$/'
        ], [
            'callcode.regex'       => 'Call code must be a valid country code (e.g., +63).',
            'backupcallcode.regex' => 'Backup call code must be a valid country code (e.g., +63).'
        ]);
    }

    public function generalStrings(Request $json)
    {
        return $this->validateFields($json, [
            'pronoun'  => 'nullable|string|max:50',
            'brgy'     => 'nullable|string|max:100',
            'city'     => 'nullable|string|max:100',
            'province' => 'nullable|string|max:100',
            'country'  => 'nullable|string|max:100',
            'type'     => 'nullable|string|max:50',
            'college'  => 'nullable|string|max:100',
            'studnum'  => 'nullable|string|max:50',
        ]);
    }

    public function booleans(Request $json)
    {
        return $this->validateFields($json, [
            'instore' => 'nullable|boolean'
        ], [
            'instore.boolean' => 'In-store status must be true or false.'
        ]);
    }

    public function addProduct(Request $json)
    {
        $requiredCheck = $this->validateFields($json, [
            'prod_name'  => 'required',
            'prod_tag'   => 'required',
            'prod_price' => 'required',
            'prod_qty'   => 'required',
        ], [
            'prod_name.required'  => 'Product name is required.',
            'prod_tag.required'   => 'Product tag is required.',
            'prod_price.required' => 'Product price is required.',
            'prod_qty.required'   => 'Product quantity is required.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        return $this->validateFields($json, [
            'prod_name'  => 'string|max:255|unique:product,prod_name',
            'prod_tag'   => 'string|max:255|unique:product,prod_tag',
            'prod_categ' => 'nullable|string|max:100',
            'prod_price' => 'numeric|min:0',
            'prod_qty'   => 'integer|min:0',
            'prod_desc'  => 'nullable|string',
        ], [
            'prod_name.unique'   => 'Product name already exists.',
            'prod_tag.unique'    => 'Product tag already exists.',
            'prod_price.numeric' => 'Product price must be a number.',
            'prod_price.min'     => 'Product price cannot be negative.',
            'prod_qty.integer'   => 'Product quantity must be an integer.',
            'prod_qty.min'       => 'Product quantity cannot be negative.',
        ]);
    }

    public function updateProductDetails(Request $json)
    {
        $requiredCheck = $this->validateFields($json, [
            'prod_id' => 'required',
        ], [
            'prod_id.required' => 'Product ID is required to update details.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        $prodId = $json->input('prod_id');

        return $this->validateFields($json, [
            'prod_id'    => 'integer|exists:product,prod_id',
            'prod_name'  => 'nullable|string|max:255|unique:product,prod_name,' . $prodId . ',prod_id',
            'prod_tag'   => 'nullable|string|max:255|unique:product,prod_tag,' . $prodId . ',prod_id',
            'prod_categ' => 'nullable|string|max:100',
            'prod_price' => 'nullable|numeric|min:0',
            'prod_qty'   => 'nullable|integer|min:0',
            'prod_desc'  => 'nullable|string',
        ], [
            'prod_id.exists'     => 'Product not found.',
            'prod_name.unique'   => 'Product name already exists.',
            'prod_tag.unique'    => 'Product tag already exists.',
            'prod_price.numeric' => 'Product price must be a number.',
            'prod_price.min'     => 'Product price cannot be negative.',
            'prod_qty.integer'   => 'Product quantity must be an integer.',
            'prod_qty.min'       => 'Product quantity cannot be negative.',
        ]);
    }

    public function flagIrregularity(Request $json)
    {
        return $this->validateFields($json, [
            'action' => 'required',
            'desc'   => 'required',
        ], [
            'action.required' => 'Action title is required.',
            'desc.required'   => 'Description is required.',
        ]);
    }

    public function logAction(Request $json)
    {
        return $this->validateFields($json, [
            'action' => 'required',
            'desc'   => 'required',
        ], [
            'action.required' => 'Action name is required.',
            'desc.required'   => 'Description is required.',
        ]);
    }

    public function changeAccountType(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
            'new_type'     => 'required',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type (customer or employee) is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
            'new_type.required'     => 'New account type is required.',
        ]);
    }

    public function deleteAccount(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
        ]);
    }

    public function disableAccount(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
        ]);
    }

    public function recoverAccount(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
        ]);
    }

    public function updateAccountDetails(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
        ]);
    }

    public function createAppointment(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id'      => 'required',
            'appoint_date' => 'required',
            'appoint_type' => 'required',
        ], [
            'cust_id.required'      => 'Customer ID is required.',
            'appoint_date.required' => 'Appointment date is required.',
            'appoint_type.required' => 'Appointment type is required.',
        ]);
    }

    public function closeAppointment(Request $json)
    {
        return $this->validateFields($json, [
            'appoint_id' => 'required',
        ], [
            'appoint_id.required' => 'Appointment ID is required.',
        ]);
    }

    public function updateAppointmentDetails(Request $json)
    {
        return $this->validateFields($json, [
            'appoint_id' => 'required',
        ], [
            'appoint_id.required' => 'Appointment ID is required.',
        ]);
    }

    public function backupCredentials(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
        ]);
    }

    public function recoverCredentials(Request $json)
    {
        return $this->validateFields($json, [
            'identifier'   => 'required',
            'account_type' => 'required|in:customer,employee',
        ], [
            'identifier.required'   => 'Identifier (phone or email) is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
        ]);
    }

    public function updateCredentials(Request $json)
    {
        return $this->validateFields($json, [
            'user_id'      => 'required',
            'account_type' => 'required|in:customer,employee',
            'new_password' => 'required',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
            'new_password.required' => 'New password is required.',
        ]);
    }

    public function createReview(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'     => 'required',
            'ord_rating' => 'required|numeric|min:1|max:5',
        ], [
            'ord_id.required'     => 'Order ID is required.',
            'ord_rating.required' => 'Rating score is required.',
            'ord_rating.numeric'  => 'Rating must be a number.',
            'ord_rating.min'      => 'Rating score must be at least 1.',
            'ord_rating.max'      => 'Rating score cannot exceed 5.',
        ]);
    }

    public function deleteReview(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required',
        ], [
            'ord_id.required' => 'Order ID is required.',
        ]);
    }

    public function moderateReview(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required',
        ], [
            'ord_id.required' => 'Order ID is required.',
        ]);
    }

    public function updateReview(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required',
        ], [
            'ord_id.required' => 'Order ID is required.',
        ]);
    }

    public function updateSettings(Request $json)
    {
        return $this->validateFields($json, [
            'settings' => 'required|array',
        ], [
            'settings.required' => 'Settings dictionary is required.',
            'settings.array'    => 'Settings must be an array / dictionary.',
        ]);
    }

    public function addWishlistItem(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id' => 'required',
            'prod_id' => 'required',
        ], [
            'cust_id.required' => 'Customer ID is required.',
            'prod_id.required' => 'Product ID is required.',
        ]);
    }

    public function addWishlistToOrder(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id' => 'required',
            'prod_id' => 'required',
        ], [
            'cust_id.required' => 'Customer ID is required.',
            'prod_id.required' => 'Product ID is required.',
        ]);
    }

    public function removeWishlistItem(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id' => 'required',
            'prod_id' => 'required',
        ], [
            'cust_id.required' => 'Customer ID is required.',
            'prod_id.required' => 'Product ID is required.',
        ]);
    }

    public function updateWishlistItem(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id' => 'required',
            'prod_id' => 'required',
        ], [
            'cust_id.required' => 'Customer ID is required.',
            'prod_id.required' => 'Product ID is required.',
        ]);
    }

    public function addOrder(Request $json)
    {
        return $this->validateFields($json, [
            'cust_id' => 'required',
        ], [
            'cust_id.required' => 'Customer ID is required.',
        ]);
    }

    public function removeOrder(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required',
        ], [
            'ord_id.required' => 'Order ID is required.',
        ]);
    }

    public function determineDispatchDetails(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'        => 'required',
            'dispatch_type' => 'required|in:pickup,delivery',
        ], [
            'ord_id.required'        => 'Order ID is required.',
            'dispatch_type.required' => 'Dispatch type (pickup or delivery) is required.',
            'dispatch_type.in'       => 'Dispatch type must be either pickup or delivery.',
        ]);
    }

    public function integratePayment(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'        => 'required',
            'pay_given'     => 'required|numeric|min:0',
            'dispatch_type' => 'required|in:pickup,delivery',
        ], [
            'ord_id.required'        => 'Order ID is required.',
            'pay_given.required'     => 'Payment given amount is required.',
            'pay_given.numeric'      => 'Payment given must be a numeric amount.',
            'pay_given.min'          => 'Payment given cannot be negative.',
            'dispatch_type.required' => 'Dispatch type (pickup or delivery) is required.',
            'dispatch_type.in'       => 'Dispatch type must be either pickup or delivery.',
        ]);
    }



    // ==========================================
    // UTILITY HELPER
    // ==========================================

    protected function validateFields(Request $json, array $rules, array $messages = [])
    {
        $validator = Validator::make($json->all(), $rules, $messages);

        if ($validator->fails()) {
            return $this->fail($validator->errors()->first(), 400);
        }

        return null;
    }
}