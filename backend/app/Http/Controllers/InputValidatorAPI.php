<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class InputValidatorAPI extends Controller
{
    // JSON RESPONSE
    protected function fail(String $message, int $status = 200)
    {
        return response()->json([
            'success' => false,
            'message' => $message
        ], $status);
    }

    // CUSTOMER SIGNUP
    public function customerSignup(Request $json)
    {

        $checkPhone = $this->phone($json);
        if ($checkPhone) return $checkPhone;

        $checkPassword = $this->password($json);
        if ($checkPassword) return $checkPassword;

        return null;
    }

    public function employeeSignup(Request $json)
    {

        $checkEmail = $this->email($json);
        if ($checkEmail) return $checkEmail;

        $checkPassword = $this->password($json);
        if ($checkPassword) return $checkPassword;

        return null;
    }

    // Validating PHONE NUMBER
    public function email(Request $json)
    {
        // Not null
        $check = Validator::make($json->all(), [
            'email' => ['required', 'string'],
        ]);

        if ($check->fails()) {
            return $this->fail("Email is required", 400);
        }
        
        // Valid email format
        $check = Validator::make($json->all(), [
            'email' => ['email'],
        ]);

        if ($check->fails()) {
            return $this->fail("Invalid email format.", 400);
        }

        return null;
    }

    public function password(Request $json)
    {
        // Not null
        $check = Validator::make($json->all(), [
            'password' => ['required', 'string'],
        ]);

        if ($check->fails()) {
            return $this->fail("Password is required", 400);
        }
        
        // Minimum 8 characters
        $check = Validator::make($json->all(), [
            'password' => ['min:8'],
        ]);

        if ($check->fails()) {
            return $this->fail("Password must be at least 8 characters.", 400);
        }

        // At least one uppercase letter, one lowercase letter, one digit, and one special character
        $check = Validator::make($json->all(), [
            'password' => ['regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/'],
        ]);

        if ($check->fails()) {
            return $this->fail("Password must be a mix of uppercase and lowercase letters, numbers, and special characters.", 400);
        }

        return null;
    }

    public function phone(Request $json)
    {
        // Not null
        $check = Validator::make($json->all(), [
            'phone' => ['required', 'string'],
        ]);

        if ($check->fails()) {
            return $this->fail("Phone number is required", 400);
        }
        
        // 11 digits
        $check = Validator::make($json->all(), [
            'phone' => ['regex:/^[0-9]{11}$/'],
        ]);

        if ($check->fails()) {
            return $this->fail("Phone number must have 11 digits.", 400);
        }

        return null;
    }
}