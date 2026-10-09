<?php

namespace App\Http\Controllers;

use App\Models\Schedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * DatabaseAPI
 *
 * SYSTEM RULE 80 - the ONE backend API that talks to the database. Every query built anywhere else in this app is passed to the database here, and it also owns input/query validation plus the 18-month purge of soft-deleted records (system rules 66, 78, 79).
 *
 * Repackaged from: InputValidator API.
 */
class DatabaseAPI extends Controller
{
    // ===== SYSTEM RULE 80 - THE ONE DOOR TO THE DATABASE =====
    //
    // Every connection (sqlite, pgsql, mysql, mariadb, sqlsrv) is resolved as
    // an ApiRouted*Connection (see AppServiceProvider::register()), and each
    // of those overrides Connection::run() to hand the SQL here before PDO
    // ever sees it. Queries are still written by the API that owns the
    // feature - rule 76 keeps that - but this is the single place where a
    // query is validated and passed to the database (rules 77 and 80).
    //
    // $execute runs the statement (Connection::run() inside the connection
    // subclass); its return value and any query exception are passed straight
    // back so callers see exactly what they saw before rule 80 was wired up.
    public static function passToDatabase(string $query, array $bindings, callable $execute)
    {
        // Query validation (DatabaseAPI's own spec line): an empty statement
        // or an array in the binding list is a programming error, not data, so
        // it is rejected before it can reach the driver. Scalars, null,
        // DateTimeInterface and BackedEnum are all values Laravel's
        // prepareBindings() already knows how to flatten.
        if (trim($query) === '') {
            throw new \InvalidArgumentException('DatabaseAPI rejected an empty query.');
        }

        foreach ($bindings as $binding) {
            if (is_array($binding)
                || (is_object($binding)
                    && ! $binding instanceof \DateTimeInterface
                    && ! $binding instanceof \BackedEnum)) {
                throw new \InvalidArgumentException('DatabaseAPI rejected a non-scalar query binding.');
            }
        }

        // Rule 77: data fetching and storing must finish inside one second.
        // The attempt is never cancelled when it does not - the row still has
        // to be written - but a slow statement is recorded so it shows up in
        // the query log instead of silently breaking the budget.
        $startedAt = microtime(true);

        try {
            return $execute();
        } finally {
            $elapsed = microtime(true) - $startedAt;

            if ($elapsed >= 1.0 && static::$slowestQuery < $elapsed) {
                static::$slowestQuery = $elapsed;
                static::$slowestSql = $query;
            }
        }
    }

    /** Longest statement seen this request, in seconds (0 when none ran slow). */
    public static function slowestQuerySeconds(): float
    {
        return static::$slowestQuery;
    }

    /** The statement that took that long, or null. */
    public static function slowestQuerySql(): ?string
    {
        return static::$slowestSql;
    }

    private static float $slowestQuery = 0.0;
    private static ?string $slowestSql = null;

    // ===== from the InputValidator API file =====

    // ==========================================
    // ACTION VALIDATORS
    // ==========================================

    public function customerSignup(Request $json)
    {
        // DOMAIN 17 - FLOW-CUST_SIGNUP-01..07 / REQ-CUST_SIGNUP-01..04.
        $this->aliasSignupFields($json);

        $requiredCheck = $this->validateFields($json, [
            'email'    => 'required|email:rfc',
            'phone'    => 'required',
            'password' => 'required',
            'givname'  => 'required|string|max:100',
            'surname'  => 'required|string|max:100',
            'type'     => 'required|string|max:50',
        ], [
            'email.required'    => 'Email address is required.',
            'email.email'       => 'Invalid email format.',
            'phone.required'    => 'Phone number is required.',
            'password.required' => 'Password is required.',
            'givname.required'  => 'Given name is required.',
            'surname.required'  => 'Surname is required.',
            'type.required'     => 'Please choose your account type.',
        ]);
        if ($requiredCheck) {
            return $requiredCheck;
        }

        // FLOW-CUST_SIGNUP-02: cust_type is either "BUeño" or "guest".
        // The legacy forms still post "Student" / "Alumni" / "Faculty",
        // which all describe a BUeño, so those spellings fold into it too.
        $kind = $this->normalizeSignupType($json->input('type'));

        if (! in_array($kind, ['bueno', 'guest'], true)) {
            return $this->fail('Account type must be either "BUeño" or "guest".', 422);
        }

        // FLOW-CUST_SIGNUP-04 / REQ-CUST_SIGNUP-03: a guest carries no
        // university affiliation, so the academic rules never apply.
        if ($kind === 'guest') {
            return $this->validateAllFormats($json);
        }

        // FLOW-CUST_SIGNUP-03 / REQ-CUST_SIGNUP-02: a BUeño fills out the
        // whole form, names cust_categ / cust_college / cust_dept and holds
        // a Bicol University email address.
        $buenoCheck = $this->validateFields($json, [
            'cust_categ'   => 'required|in:student,alumni,faculty',
            'cust_college' => 'required|string|max:120',
            'cust_dept'    => 'required|string|max:120',
            'email'        => 'required|email:rfc|ends_with:bicol-u.edu.ph',
        ], [
            'cust_categ.required'   => 'Please choose your category (student, alumni, or faculty).',
            'cust_categ.in'         => 'Please choose your category (student, alumni, or faculty).',
            'cust_college.required' => 'College or institute is required.',
            'cust_dept.required'    => 'Department or program is required.',
            'email.required'        => 'Bicol University email address is required.',
            'email.ends_with'       => 'Use a Bicol University email address (name@bicol-u.edu.ph).',
        ]);
        if ($buenoCheck) {
            return $buenoCheck;
        }

        return $this->validateAllFormats($json);
    }

    /**
     * Folds the signup aliases onto their canonical (system-new.docx) names
     * so one rule set covers both payload generations: the new form posts
     * `cust_categ` / `cust_college` / `cust_dept` / `bday` / `backup_phone`,
     * the legacy one posts `categ` / `college` / `dept` / `birthday` /
     * `backupphone`.
     */
    private function aliasSignupFields(Request $json): void
    {
        $pairs = [
            'cust_categ'   => ['categ'],
            'cust_college' => ['college'],
            'cust_dept'    => ['dept', 'course', 'program'],
            'bday'         => ['birthday'],
            'backup_phone' => ['backupphone'],
            'backup_email' => ['backupemail', 'backup_email'],
            // The canonical account type may travel alone under either
            // spelling (FLOW-CUST_SIGNUP-02: "BUeño" | "guest").
            'type'         => ['cust_type', 'role'],
        ];

        foreach ($pairs as $canonical => $aliases) {
            if ($json->filled($canonical)) {
                continue;
            }
            foreach ($aliases as $alias) {
                if ($json->filled($alias)) {
                    $json->merge([$canonical => $json->input($alias)]);
                    break;
                }
            }
        }

        // The category may be implied by the legacy role alone.
        if (! $json->filled('cust_categ')) {
            $fromType = preg_replace('/[^a-z]/', '', strtolower((string) $json->input('type')));
            if (in_array($fromType, ['student', 'alumni', 'faculty'], true)) {
                $json->merge(['cust_categ' => $fromType]);
            }
        }

        // The reusable format rules still read the legacy key names, so the
        // canonical values are mirrored back onto them before they run.
        $mirror = [
            'birthday'    => 'bday',
            'backupphone' => 'backup_phone',
            'backupemail' => 'backup_email',
        ];
        foreach ($mirror as $legacy => $canonical) {
            if (! $json->filled($legacy) && $json->filled($canonical)) {
                $json->merge([$legacy => $json->input($canonical)]);
            }
        }

        // FLOW-CUST_SIGNUP-01: the new form posts givname + surname; a
        // single legacy `nickname` is split the same way the backend does.
        if (! $json->filled('givname') && $json->filled('nickname')) {
            $full = trim(preg_replace('/\s+/', ' ', (string) $json->input('nickname')));
            $space = strpos($full, ' ');
            $json->merge([
                'givname' => $space === false ? $full : substr($full, 0, $space),
                'surname' => $space === false ? $full : substr($full, $space + 1),
            ]);
        }
    }

    public function customerLogin(Request $json)
    {
        // DOMAIN 18 - FLOW-CUST_LOGIN-02: the login form carries the
        // account's email address and password. A registered phone number
        // is still accepted as the same identifier, because accounts created
        // before email was mandatory keep a NULL cust_email.
        $requiredCheck = $this->validateFields($json, [
            'email'    => 'required_without:phone|nullable|string|max:255',
            'phone'    => 'required_without:email',
            'password' => 'required',
        ], [
            'email.required_without' => 'Email address is required to log in.',
            'phone.required_without' => 'Email address is required to log in.',
            'password.required'      => 'Password is required.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        // An identifier without "@" was typed in the email box on purpose:
        // treat it as a legacy phone login instead of rejecting it.
        if ($json->filled('email') && ! str_contains((string) $json->input('email'), '@')) {
            $json->merge([
                'phone' => $json->input('phone') ?: $json->input('email'),
                'email' => null,
            ]);
        }

        if ($json->filled('email')) {
            $emailCheck = $this->validateFields($json, [
                'email' => 'required|email:rfc',
            ], [
                'email.email' => 'Invalid email format.',
            ]);
            if ($emailCheck) return $emailCheck;
        }

        return $this->validateAllFormats($json);
    }

    /**
     * DOMAIN 17 / DOMAIN 18 - the phone OTP challenge that gates a signup
     * (FLOW-CUST_SIGNUP-05) and a login taken more than fifteen days after
     * the last logout (FLOW-CUST_LOGIN-02).
     */
    public function otpChallengeStart(Request $json)
    {
        return $this->validateFields($json, [
            'purpose'   => 'required|in:signup,login',
            'challenge' => 'required|string',
        ], [
            'purpose.required'   => 'A verification purpose is required.',
            'purpose.in'         => 'Unknown verification purpose.',
            'challenge.required' => 'The verification session expired. Please start again.',
        ]);
    }

    public function otpChallengeVerify(Request $json)
    {
        return $this->validateFields($json, [
            'purpose'   => 'required|in:signup,login',
            'challenge' => 'required|string',
            'code'      => 'required|string|digits:6',
        ], [
            'purpose.required'    => 'A verification purpose is required.',
            'purpose.in'          => 'Unknown verification purpose.',
            'challenge.required'  => 'The verification session expired. Please start again.',
            'code.required'       => 'The verification code is required.',
            'code.digits'         => 'The verification code must be 6 digits.',
        ]);
    }

    public function employeeSignup(Request $json)
    {
        // DOMAIN 6 (EMPLOYEE ENROLLMENT) - FLOW-EMP_ENROLL-02: the enrolment
        // form collects surname, given name, Bicol University email, phone
        // number and the initial category. Nothing else is required to open an
        // account, so the legacy academic fields (student number, college,
        // program, year, bloc) are accepted but never demanded - the live
        // system-new.docx EMPLOYEE schema does not even carry those columns.
        $requiredCheck = $this->validateFields($json, [
            'email' => 'required',
            'phone' => 'required',
            'surname' => 'required',
            'givname' => 'required',
        ], [
            'email.required' => 'University email is required.',
            'phone.required' => 'Phone number is required.',
            'surname.required' => 'Surname is required.',
            'givname.required' => 'Given name is required.',
        ]);
        if ($requiredCheck) {
            return $requiredCheck;
        }

        // FLOW-EMP_ENROLL-03 / REQ-EMP_ENROLL-02: the address has to be a
        // Bicol University address before the account can be opened.
        $emailCheck = $this->validateFields($json, [
            'email' => 'required|email:rfc|ends_with:bicol-u.edu.ph',
        ], [
            'email.required' => 'University email is required.',
            'email.email' => 'Invalid email format.',
            'email.ends_with' => 'Use a Bicol University email address.',
        ]);
        if ($emailCheck) {
            return $emailCheck;
        }

        // FLOW-EMP_ENROLL-02 - the initial category (rule 32: "staff", "admin"
        // or "super admin"), posted as `categ` or as the legacy `type` alias.
        $categoryCheck = $this->validateFields($json, [
            'categ' => 'nullable|in:staff,admin,super admin,STAFF,ADMIN,SUPER ADMIN',
            'type' => 'nullable|in:staff,admin,super admin,STAFF,ADMIN,SUPER ADMIN',
        ], [
            'categ.in' => 'Category must be staff, admin or super admin.',
            'type.in' => 'Category must be staff, admin or super admin.',
        ]);
        if ($categoryCheck) {
            return $categoryCheck;
        }

        // Optional fields validation
        $optionalCheck = $this->validateFields($json, [
            'midname'   => 'nullable|string|max:100',
            'suffix'    => 'nullable|string|max:20',
            'studnum'   => 'nullable|string|max:50',
            'pronoun'   => 'nullable|string|max:50',
            'birthday'  => 'nullable|date|before:today',
            'brgy'      => 'nullable|string|max:100',
            'city'      => 'nullable|string|max:100',
            'province'  => 'nullable|string|max:100',
            'country'   => 'nullable|string|max:100',
            'callcode'  => 'nullable|regex:/^\+?[0-9]{1,4}$/',
            'instore'   => 'nullable|boolean',
        ], [
            'callcode.regex' => 'Call code must be a valid country code (e.g., +63).',
            'instore.boolean' => 'In-store status must be true or false.',
        ]);
        if ($optionalCheck) {
            return $optionalCheck;
        }

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

        /*
            FLOW-EMP_LOGIN-02..08 own the vocabulary of this form, so the
            generic `validateAllFormats()` runner is deliberately NOT applied
            here. It would answer "Invalid email format." for a mistyped
            address, and a mistyped address is simply one that does not exist
            - SecurityAPI::employeeLogin then returns `EMP_NOT_FOUND`, which the
            form prints as "User not found" under the email field, exactly
            where rule 67 wants it. The password is only ever compared, never
            pattern-checked, so a wrong password still answers "Wrong
            password" (FLOW-EMP_LOGIN-07) instead of a format complaint.
        */
        return null;
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
        // Syntax check only: the `dns` variant rejected valid addresses on
        // transient DNS failures and null-MX domains, blocking signup with 400.
        return $this->validateFields($json, [
            'email' => 'nullable|email:rfc'
        ], [
            'email.email' => 'Invalid email format.'
        ]);
    }

    public function backupEmail(Request $json)
    {
        return $this->validateFields($json, [
            'backupemail' => 'nullable|email:rfc'
        ], [
            'backupemail.email' => 'Invalid backup email format.'
        ]);
    }

    public function phone(Request $json)
    {
        if ($json->has('phone')) {
            $cleaned = preg_replace('/[^0-9]/', '', (string)$json->input('phone'));
            if (strlen($cleaned) >= 12 && strpos($cleaned, '63') === 0) {
                $cleaned = '0' . substr($cleaned, 2);
            }
            if ($cleaned === '0000000000') {
                return $this->fail('Phone number is reserved.', 422);
            }
            $json->merge(['phone' => $cleaned]);
        }

        return $this->validateFields($json, [
            'phone' => 'nullable|regex:/^[0-9]{10,11}$/'
        ], [
            'phone.regex' => 'Phone number must be 10 to 11 digits.'
        ]);
    }

    public function backupPhone(Request $json)
    {
        if ($json->has('backupphone')) {
            $cleaned = preg_replace('/[^0-9]/', '', (string)$json->input('backupphone'));
            if (strlen($cleaned) >= 12 && strpos($cleaned, '63') === 0) {
                $cleaned = '0' . substr($cleaned, 2);
            }
            $json->merge(['backupphone' => $cleaned]);
        }

        return $this->validateFields($json, [
            'backupphone' => 'nullable|regex:/^[0-9]{10,11}$/'
        ], [
            'backupphone.regex' => 'Backup phone number must be 10 to 11 digits.'
        ]);
    }

    public function password(Request $json)
    {
        return $this->validateFields($json, [
            'password' => [
                'nullable',
                'string',
                'min:8',
                'regex:/^[^\s\x00-\x1F\x7F]+$/'
            ]
        ], [
            'password.min'   => 'Password must be at least 8 characters.',
            'password.regex' => 'Password contains invalid control characters.'
        ]);
    }

    public function nickname(Request $json)
    {
        return $this->validateFields($json, [
            'nickname' => 'nullable|string|min:2|regex:/^[A-Za-z0-9_\s\.\-]+$/'
        ], [
            'nickname.min'   => 'Nickname must be at least 2 characters.',
            'nickname.regex' => 'Nickname contains invalid characters.'
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
            'address'  => 'nullable|string|max:255',
            'brgy'     => 'nullable|string|max:100',
            'city'     => 'nullable|string|max:100',
            'province' => 'nullable|string|max:100',
            'country'  => 'nullable|string|max:100',
            'type'     => 'nullable|string|max:50',
            'college'  => 'nullable|string|max:100',
            'program'  => 'nullable|string|max:100',
            'year'     => 'nullable|integer|min:1|max:5',
            'bloc'     => 'nullable|string|max:50',
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
        /*
            Live behaviour (ProductsAPI::addProduct) mirrors this gate:
            - `prod_name` is required (400 when empty);
            - `prod_price` must be present and numeric (400 otherwise);
            - `prod_tag`, `prod_qty` and `prod_categ` are optional - the tag is
              generated when absent and a product without a `variations` list
              falls back to one Standard variation stocked from prod_qty;
            - name / tag uniqueness is a business rule the owning action
              answers with 409, so it is deliberately not asserted here.
        */
        return $this->validateFields($json, [
            'prod_name'  => 'required|string',
            'prod_price' => 'required|numeric',
        ], [
            'prod_name.required'  => 'Product name is required.',
            'prod_name.string'    => 'Product name must be text.',
            'prod_price.required' => 'Product price is required.',
            'prod_price.numeric'  => 'Product price must be a number.',
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
            // Per-variation stock write (the inventory stepper targets ONE
            // variation instead of shifting the product total).
            'prodvar_id' => 'nullable|integer|exists:prodvar,prodvar_id',
            'prod_desc'  => 'nullable|string',
        ], [
            'prod_id.exists'     => 'Product not found.',
            'prodvar_id.exists'  => 'Product variation not found.',
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
            'reason'       => 'required',
        ], [
            'user_id.required'      => 'User ID is required.',
            'account_type.required' => 'Account type is required.',
            'account_type.in'       => 'Account type must be customer or employee.',
            'reason.required'       => 'A reason for disabling the account is required.',
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

    // REQ-SS-01/02/03: duty shift blocks. duty_shift stores the window as
    // 'HH:MM' 24-hour strings, so the time rules match that format. A status
    // is accepted but never stored: the table has no status column, so the
    // value is validated for completeness and the real status is derived.
    public function createShift(Request $json)
    {
        $requiredCheck = $this->validateFields($json, [
            'emp_id'      => 'required|integer|exists:employee,emp_id',
            'shift_date'  => 'required|date_format:Y-m-d',
            'shift_start' => 'required|date_format:H:i',
            'shift_end'   => 'required|date_format:H:i|after:shift_start',
        ], [
            'emp_id.required'         => 'Employee ID is required.',
            'emp_id.integer'          => 'Employee ID must be a whole number.',
            'emp_id.exists'           => 'Employee does not exist.',
            'shift_date.required'     => 'Shift date is required.',
            'shift_date.date_format'  => 'Shift date must use the YYYY-MM-DD format.',
            'shift_start.required'    => 'Shift start time is required.',
            'shift_start.date_format' => 'Shift start time must use the HH:MM 24-hour format.',
            'shift_end.required'      => 'Shift end time is required.',
            'shift_end.date_format'   => 'Shift end time must use the HH:MM 24-hour format.',
            'shift_end.after'         => 'Shift end time must be later than the start time.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        return $this->validateFields($json, [
            'status'         => 'nullable|in:SCHEDULED,ACTIVE,COMPLETED,PENDING REPLACEMENT',
            'shift_type'     => 'nullable|string|max:100',
            'shift_location' => 'nullable|string|max:100',
        ], [
            'status.in' => 'Status must be SCHEDULED, ACTIVE, COMPLETED or PENDING REPLACEMENT.',
        ]);
    }

    public function updateShift(Request $json, Schedule $shift)
    {
        $requiredCheck = $this->validateFields($json, [
            'emp_id'      => 'nullable|integer|exists:employee,emp_id',
            'shift_date'  => 'nullable|date_format:Y-m-d',
            'shift_start' => 'nullable|date_format:H:i',
            'shift_end'   => 'nullable|date_format:H:i',
            'emp_instore' => 'nullable|boolean',
            'shift_type'     => 'nullable|string|max:100',
            'shift_location' => 'nullable|string|max:100',
        ], [
            'emp_id.exists'           => 'Employee does not exist.',
            'shift_date.date_format'  => 'Shift date must use the YYYY-MM-DD format.',
            'shift_start.date_format' => 'Shift start time must use the HH:MM 24-hour format.',
            'shift_end.date_format'   => 'Shift end time must use the HH:MM 24-hour format.',
            'emp_instore.boolean'     => 'Availability must be true or false.',
        ]);
        if ($requiredCheck) return $requiredCheck;

        // A partial update is checked against the window it will end up with,
        // so moving only the end time past the start is still rejected. The
        // block stores one timestamp pair, so an untouched side falls back to
        // the half the stored window already holds; both format to a
        // zero-padded HH:MM, which compares in order.
        $start = (string) $json->input(
            'shift_start',
            optional($shift->sched_time_start)->format('H:i')
        );
        $end = (string) $json->input(
            'shift_end',
            optional($shift->sched_time_end)->format('H:i')
        );

        if ($start !== '' && $end !== '' && $end <= $start) {
            return $this->fail('Shift end time must be later than the start time.');
        }

        return null;
    }

    public function createAppointment(Request $json)
    {
        // The live column is `appoint_start`; `appoint_date` is the legacy
        // request spelling (AppointmentsAPI aliases one onto the other before this
        // runs), so a booking may be expressed with EITHER key - requiring the
        // legacy one alone rejected every modern client that only sends
        // appoint_start.
        return $this->validateFields($json, [
            'cust_id'       => 'required',
            'appoint_date'  => 'required_without:appoint_start',
            'appoint_start' => 'nullable',
            'appoint_type'  => 'required',
        ], [
            'cust_id'       => 'Customer ID is required.',
            'appoint_date.required_without' => 'Appointment date is required: send appoint_start (live column) or appoint_date (legacy alias).',
            'appoint_type'  => 'Appointment type is required.',
        ]);
    }

    public function closeAppointment(Request $json)
    {
        return $this->validateFields($json, [
            'appoint_id' => 'required',
            'reason'     => 'required|string|max:500',
        ], [
            'appoint_id.required' => 'Appointment ID is required.',
            'reason.string'       => 'Reason must be a string.',
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
        return $this->validateAllFormats($json);
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
        $credentials = $this->validateFields($json, [
            'current_password' => 'required|string',
            'new_password' => 'required|string|min:8|regex:/^[^\s\x00-\x1F\x7F]+$/',
            // FLOW-EMP_SET-02 / FLOW-CUST_SET-02 - the new password is typed
            // twice; the second entry must match before anything is checked
            // further. Optional so a client that has not been rebuilt yet is
            // not rejected, but enforced whenever it is sent.
            'new_password_confirmation' => 'nullable|same:new_password',
        ], [
            'current_password.required' => 'Current password is required.',
            'new_password.required' => 'New password is required.',
            'new_password.min' => 'New password must be at least 8 characters.',
            'new_password.regex' => 'New password contains invalid characters.',
            'new_password_confirmation.same' => 'New password confirmation does not match.',
        ]);
        if ($credentials) {
            return $credentials;
        }

        return $this->validateAllFormats($json);
    }

    public function createReview(Request $json)
    {
        // Live behaviour (ProductsAPI::createReview): a review is anchored to
        // an order or a product, and the score arrives under either the live
        // `ord_rating` key or its `rating` alias.
        return $this->validateFields($json, [
            'ord_id'     => 'required_without:prod_id',
            'prod_id'    => 'required_without:ord_id',
            'ord_rating' => 'required_without:rating|numeric|min:1|max:5',
            'rating'     => 'sometimes|nullable|numeric|min:1|max:5',
        ], [
            'ord_id.required_without'     => 'Order ID or product ID is required.',
            'prod_id.required_without'    => 'Order ID or product ID is required.',
            'ord_rating.required_without' => 'Rating score is required.',
            'ord_rating.numeric'          => 'Rating must be a number between 1 and 5.',
            'ord_rating.min'              => 'Rating must be a number between 1 and 5.',
            'ord_rating.max'              => 'Rating must be a number between 1 and 5.',
            'rating.numeric'              => 'Rating must be a number between 1 and 5.',
            'rating.min'                  => 'Rating must be a number between 1 and 5.',
            'rating.max'                  => 'Rating must be a number between 1 and 5.',
        ]);
    }

    public function deleteReview(Request $json)
    {
        // Live behaviour (ProductsAPI::deleteReview -> resolveReview): a review
        // is targeted by its own `rev_id` or by the order it belongs to.
        return $this->validateFields($json, [
            'ord_id' => 'required_without:rev_id',
            'rev_id' => 'sometimes|nullable',
        ], [
            'ord_id.required_without' => 'Order ID is required.',
        ]);
    }

    public function moderateReview(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required_without:rev_id',
            'rev_id' => 'sometimes|nullable',
        ], [
            'ord_id.required_without' => 'Order ID is required.',
        ]);
    }

    public function updateReview(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required_without:rev_id',
            'rev_id' => 'sometimes|nullable',
        ], [
            'ord_id.required_without' => 'Order ID is required.',
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

    // DOMAIN 29 - REQ-CUST_SET-02: every sensitive customer change is
    // preceded by a six-digit phone OTP.
    public function issueOtp(Request $json)
    {
        return $this->validateFields($json, [
            'purpose' => 'required|in:' . implode(',', Controller::OTP_PURPOSES),
        ], [
            'purpose.required' => 'A verification purpose is required.',
            'purpose.in'       => 'Unknown verification purpose.',
        ]);
    }

    public function verifyOtp(Request $json)
    {
        return $this->validateFields($json, [
            'purpose' => 'required|in:' . implode(',', Controller::OTP_PURPOSES),
            'code'    => 'required|string|digits:6',
        ], [
            'purpose.required' => 'A verification purpose is required.',
            'purpose.in'       => 'Unknown verification purpose.',
            'code.required'    => 'The verification code is required.',
            'code.digits'      => 'The verification code must be 6 digits.',
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
        // Live behaviour (UserAPI::addOrder): the customer is taken from the
        // bearer token, so `cust_id` is optional and only checked for shape; a
        // line is either a single `prod_id` or a non-empty `items` array.
        return $this->validateFields($json, [
            'cust_id' => 'sometimes|nullable|integer',
            'prod_id' => 'required_without:items',
            'items'   => 'required_without:prod_id|array',
        ], [
            'cust_id.integer'          => 'Customer ID must be an integer.',
            'prod_id.required_without' => 'prod_id or items array is required.',
            'items.required_without'   => 'prod_id or items array is required.',
            'items.array'              => 'items must be an array of order lines.',
        ]);
    }

    public function removeOrder(Request $json)
    {
        // Live behaviour (UserAPI::removeOrder): the bag row may be named by
        // `bag_id` or either legacy alias (`item_id` / `ord_id`).
        return $this->validateFields($json, [
            'bag_id'  => 'required_without_all:item_id,ord_id',
            'item_id' => 'sometimes|nullable',
            'ord_id'  => 'sometimes|nullable',
        ], [
            'bag_id.required_without_all' => 'bag_id is required.',
        ]);
    }

    public function determineDispatchDetails(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'nullable|integer',
            'bag_ids' => 'nullable|array',
            'bag_ids.*' => 'integer',
            'dispatch_type' => 'required|in:pickup,delivery',
            'speed' => 'nullable|in:priority,standard,saver',
            'deliver_address' => 'nullable|string|max:500',
            'deliver_expect' => 'nullable',
            'appoint_id' => 'nullable|integer',
            'appoint_start' => 'nullable',
        ], [
            'ord_id.integer' => 'Order ID must be an integer.',
            'bag_ids.array' => 'Bag IDs must be a list of bag row IDs.',
            'bag_ids.*.integer' => 'Every bag ID must be an integer.',
            'dispatch_type.required' => 'Dispatch type (pickup or delivery) is required.',
            'dispatch_type.in' => 'Dispatch type must be either pickup or delivery.',
            'speed.in' => 'Delivery speed must be priority, standard, or saver.',
            'deliver_address.string' => 'Delivery address must be text.',
            'deliver_address.max' => 'Delivery address is too long.',
            'appoint_id.integer' => 'Appointment ID must be an integer.',
        ]);
    }

    public function integratePayment(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'nullable|integer',
            'bag_ids' => 'nullable|array',
            'bag_ids.*' => 'integer',
            'pay_given' => 'required|numeric|min:0',
            'pay_ref' => 'nullable|string|max:100',
            'dispatch_type' => 'required|in:pickup,delivery',
            'speed' => 'nullable|in:priority,standard,saver',
            'deliver_address' => 'nullable|string|max:500',
            'deliver_expect' => 'nullable',
            'appoint_id' => 'nullable|integer',
            'appoint_start' => 'nullable',
        ], [
            'ord_id.integer' => 'Order ID must be an integer.',
            'bag_ids.array' => 'Bag IDs must be a list of bag row IDs.',
            'bag_ids.*.integer' => 'Every bag ID must be an integer.',
            'pay_given.required' => 'Payment given amount is required.',
            'pay_given.numeric' => 'Payment given must be a numeric amount.',
            'pay_given.min' => 'Payment given cannot be negative.',
            'pay_ref.max' => 'Payment reference is too long.',
            'dispatch_type.required' => 'Dispatch type (pickup or delivery) is required.',
            'dispatch_type.in' => 'Dispatch type must be either pickup or delivery.',
            'speed.in' => 'Delivery speed must be priority, standard, or saver.',
            'deliver_address.string' => 'Delivery address must be text.',
            'deliver_address.max' => 'Delivery address is too long.',
            'appoint_id.integer' => 'Appointment ID must be an integer.',
        ]);
    }

    public function createPaymentIntent(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'nullable|integer',
            'bag_ids' => 'nullable|array',
            'bag_ids.*' => 'integer',
            'gateway' => 'required|in:paymongo',
            'dispatch_type' => 'nullable|in:pickup,delivery',
            'speed' => 'nullable|in:priority,standard,saver',
            'deliver_address' => 'nullable|string|max:500',
            'deliver_expect' => 'nullable',
            'appoint_id' => 'nullable|integer',
            'appoint_start' => 'nullable',
        ], [
            'ord_id.integer' => 'Order ID must be an integer.',
            'bag_ids.array' => 'Bag IDs must be a list of bag row IDs.',
            'bag_ids.*.integer' => 'Every bag ID must be an integer.',
            'gateway.required' => 'Payment gateway is required.',
            'gateway.in' => 'Payment gateway must be paymongo.',
            'dispatch_type.in' => 'Dispatch type must be either pickup or delivery.',
            'speed.in' => 'Delivery speed must be priority, standard, or saver.',
            'deliver_address.string' => 'Delivery address must be text.',
            'deliver_address.max' => 'Delivery address is too long.',
            'appoint_id.integer' => 'Appointment ID must be an integer.',
        ]);
    }

    // ==========================================
    // ORDERS API VALIDATORS
    // ==========================================

    public function addProductToOrder(Request $json)
    {
        /*
            Canonical validator for POST /pos/add (OrdersAPI::addProductToOrder).

            Live behaviour: `prod_id` is the only hard requirement - the
            register opens a fresh walk-in ticket when `ord_id` is absent and
            appends to an existing one when it is sent. `posAddProductToOrder`
            delegates here so the two names never drift (rule 76).
        */
        return $this->validateFields($json, [
            'prod_id' => 'required',
            'ord_id'  => 'sometimes|nullable|integer',
        ], [
            'prod_id.required' => 'Product ID is required.',
            'ord_id.integer'   => 'Order ID must be an integer.',
        ]);
    }

    public function updateOrderDetails(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required',
        ], [
            'ord_id.required' => 'Order ID is required.',
        ]);
    }

    public function removeProductFromOrder(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'  => 'required',
            'prod_id' => 'required',
        ], [
            'ord_id.required'  => 'Order ID is required.',
            'prod_id.required' => 'Product ID is required.',
        ]);
    }

    // ==========================================
    // POS API VALIDATORS
    // ==========================================

    public function posAddProductToOrder(Request $json)
    {
        // Rule 76: one implementation - the canonical POS validator.
        return $this->addProductToOrder($json);
    }

    public function posCheckoutOrder(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'      => 'required',
            'pay_given'   => 'required|numeric|min:0',
            // The cashier's discount: an optional peso amount taken off the
            // amount due (orders.ord_discount). Never more than the cart.
            'ord_discount' => 'nullable|numeric|min:0',
            // FLOW-WALKIN-06: the tender is optional for legacy clients,
            // but when sent it must be cash or digital.
            'pay_method' => 'nullable|in:cash,digital',
        ], [
            'ord_id.required'      => 'Order ID is required.',
            'pay_given.required'   => 'Payment given amount is required.',
            'pay_given.numeric'    => 'Payment given must be a numeric amount.',
            'pay_given.min'        => 'Payment given cannot be negative.',
            'ord_discount.numeric' => 'Discount must be a numeric amount.',
            'ord_discount.min'     => 'Discount cannot be negative.',
            'pay_method.in'        => 'Payment method must be cash or digital.',
        ]);
    }

    public function posUpdateOrderDetails(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id' => 'required',
        ], [
            'ord_id.required' => 'Order ID is required.',
        ]);
    }


    // ==========================================
    // NOTIF API VALIDATORS
    // ==========================================

    public function createNotification(Request $json)
    {
        return $this->validateFields($json, [
            'recipient_type' => 'required|in:customer,employee',
            'recipient_id'   => 'required',
            'notif_msg'      => 'required',
        ], [
            'recipient_type.required' => 'Recipient type is required.',
            'recipient_type.in'       => 'Recipient type must be either customer or employee.',
            'recipient_id.required'   => 'Recipient ID is required.',
            'notif_msg.required'      => 'Notification message is required.',
        ]);
    }

    public function distributeNotifications(Request $json)
    {
        return $this->validateFields($json, [
            'recipient_type' => 'required|in:customer,employee',
            'notif_msg'      => 'required',
        ], [
            'recipient_type.required' => 'Recipient type is required.',
            'recipient_type.in'       => 'Recipient type must be either customer or employee.',
            'notif_msg.required'      => 'Notification message is required.',
        ]);
    }

    public function updateNotificationStatus(Request $json)
    {
        return $this->validateFields($json, [
            'notif_id'       => 'required',
            'recipient_type' => 'required|in:customer,employee',
        ], [
            'notif_id.required'       => 'Notification ID is required.',
            'recipient_type.required' => 'Recipient type is required.',
            'recipient_type.in'       => 'Recipient type must be either customer or employee.',
        ]);
    }

    // ==========================================
    // APPOINTMENT SLOT VALIDATORS
    // ==========================================

    public function displaySlots(Request $json)
    {
        return $this->validateFields($json, [
            'date' => 'required|date_format:Y-m-d',
        ], [
            'date.required'           => 'A valid date (YYYY-MM-DD) is required.',
            'date.date_format'        => 'A valid date (YYYY-MM-DD) is required.',
        ]);
    }

    // ==========================================
    // TRACKING API VALIDATORS
    // ==========================================

    public function scanCode(Request $json)
    {
        return $this->validateFields($json, [
            'code'       => 'required',
            'scanned_by' => 'nullable|string|max:255',
        ], [
            'code.required' => 'QR code is required.',
        ]);
    }

    public function createFulfillmentTrack(Request $json)
    {
        return $this->validateFields($json, [
            'ord_id'     => 'required',
            'track_type' => 'required|in:pickup,delivery',
        ], [
            'ord_id.required'      => 'Order ID is required.',
            'track_type.required'  => 'Track type is required.',
            'track_type.in'        => 'Track type must be either pickup or delivery.',
        ]);
    }

    public function updateFulfillmentStatus(Request $json)
    {
        return $this->validateFields($json, [
            'track_id'   => 'required',
            'track_type' => 'required|in:pickup,delivery',
            'status'     => 'required',
        ], [
            'track_id.required'    => 'Track ID is required.',
            'track_type.required'  => 'Track type is required.',
            'track_type.in'        => 'Track type must be either pickup or delivery.',
            'status.required'      => 'Status is required.',
        ]);
    }

    public function closeFulfillmentTrack(Request $json)
    {
        return $this->validateFields($json, [
            'track_id'   => 'required',
            'track_type' => 'required|in:pickup,delivery',
        ], [
            'track_id.required'    => 'Track ID is required.',
            'track_type.required'  => 'Track type is required.',
            'track_type.in'        => 'Track type must be either pickup or delivery.',
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
