<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Support\EmployeePassword;
use App\Support\SystemSettings;
use Illuminate\Http\Request;

/**
 * DOMAIN 1 - SETUP.
 *
 * FLOW-SETUP-05: a setup wizard has to be able to ask the system what is
 * still missing and to mint the very first super admin (FLOW-SETUP-04) with a
 * securely generated, stored password (REQ-SETUP-03).
 *
 * Nothing here may create a row unless the store has no employees at all:
 * `POST /setup/initialize` is a one-shot bootstrap, so against a database
 * that already holds a staff roster it answers 409 and changes nothing.
 *
 * Configuration is written to the SystemSettings JSON document, never to the
 * database - the system-new.docx SCHEMA lists no settings table (FLOW-SETUP-01).
 */
class SetupAPI extends Controller
{
    /** The only store configuration the wizard is allowed to write (FLOW-SETUP-01). */
    private const CONFIG_KEYS = [
        'store_name' => 'string',
        'store_location' => 'string',
        'store_contact' => 'string',
        'operating_hours' => 'string',
    ];

    /** Rule 27 / REQ-EMP_ENROLL-02: staff identities live on the university domain. */
    private const BICOL_DOMAIN = '@bicol-u.edu.ph';

    /*
        GET /api/setup/status  (public - nothing is authenticated yet)
    */
    public function status()
    {
        $missing = SystemSettings::missingCritical();

        return response()->json([
            'success' => true,
            'message' => 'Setup status retrieved successfully.',
            'data'    => [
                // REQ-SETUP-02: false until every critical field is filled.
                'setup_complete' => count($missing) === 0,
                'missing_critical' => $missing,
                // FLOW-SETUP-04: the wizard only has an account to create
                // while the roster is empty.
                'needs_initial_super_admin' => $this->rosterEmpty(),
                'bicol_domain' => self::BICOL_DOMAIN,
                'store' => [
                    'store_name'      => (string) SystemSettings::get('store_name', ''),
                    'store_location'  => (string) SystemSettings::get('store_location', ''),
                    'store_contact'   => (string) SystemSettings::get('store_contact', ''),
                    'operating_hours' => (string) SystemSettings::get('operating_hours', ''),
                ],
            ],
        ], 200);
    }

    /*
        POST /api/setup/initialize  (public, throttled - one-shot bootstrap)

        JSON REQUEST
        email    - string (req - Bicol University address)
        surname  - string (req)
        givname  - string (req)
        phone    - string (req)
        password - string (opt - generated when absent; must clear REQ-SETUP-03)
        store_name / store_location / store_contact / operating_hours - opt
    */
    public function initialize(Request $json)
    {
        if (! $this->rosterEmpty()) {
            return response()->json([
                'success' => false,
                'code'    => 'ALREADY_INITIALIZED',
                'message' => 'The store already has employees. Ask a super admin to enroll you instead.',
            ], 409);
        }

        // REQ-SETUP-01: every posted value is validated before anything is
        // written - to the settings document or to the database.
        $email = strtolower(trim((string) $json->input('email', '')));
        $surname = trim((string) $json->input('surname', ''));
        $givname = trim((string) $json->input('givname', ''));
        $phone = trim((string) $json->input('phone', ''));

        if ($email === '' || $surname === '' || $givname === '' || $phone === '') {
            return response()->json([
                'success' => false,
                'message' => 'Email, surname, given name and phone are required.',
            ], 422);
        }

        if (! str_ends_with($email, self::BICOL_DOMAIN)) {
            return response()->json([
                'success' => false,
                'message' => 'The super admin email must be a Bicol University address (' . self::BICOL_DOMAIN . ').',
            ], 422);
        }

        if (Employee::where('emp_email', $email)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Email already exists',
            ], 409);
        }

        // FLOW-SETUP-04: secure password generation. A wizard may hand one in
        // instead, but REQ-SETUP-03 decides whether it is good enough.
        $generated = false;
        $password = (string) $json->input('password', '');

        if ($password === '') {
            $password = EmployeePassword::generateTemporary(20);
            $generated = true;
        } elseif (! EmployeePassword::meetsStandard($password)) {
            return response()->json([
                'success' => false,
                'code'    => 'WEAK_PASSWORD',
                'message' => 'Super admin passwords must be at least 16 characters and include an uppercase letter, a lowercase letter, a number and a symbol.',
            ], 422);
        }

        // REQ-SETUP-02: configuration is saved only when the critical fields
        // it carries are all non-empty - a partial block may never half-apply.
        $config = [];
        foreach (self::CONFIG_KEYS as $key => $_type) {
            if ($json->has($key)) {
                $config[$key] = trim((string) $json->input($key));
            }
        }

        $configuring = count($config) > 0;
        if ($configuring) {
            foreach ($config as $value) {
                if ($value === '') {
                    return response()->json([
                        'success' => false,
                        'code'    => 'INCOMPLETE_CONFIG',
                        'message' => 'Critical configuration fields may not be left empty.',
                    ], 422);
                }
            }
        }

        try {
            $employee = Employee::forceCreate($this->existingColumns('employee', [
                'emp_created'  => now(),
                'emp_password' => EmployeePassword::make($password),
                'emp_surname'  => $surname,
                'emp_givname'  => $givname,
                'emp_midname'  => '',
                'emp_suffix'   => '',
                'emp_pronoun'  => 'they/them',
                'emp_callcode' => '+63',
                'emp_phone'    => $phone,
                'emp_email'    => $email,
                'emp_categ'    => 'super admin',
                'emp_type'     => 'SUPER ADMIN',
                'emp_instore'  => false,
                // FLOW-SETUP-04: the account opens active, never suspended.
                'emp_suspended' => null,
                'emp_deleted'   => null,
            ]));

            if ($configuring) {
                SystemSettings::putMany($config);
            }

            // REQ-SETUP-04: the setup action is logged for audit, filed under
            // the id of the account it just created.
            $this->logEmployee((int) $employee->emp_id, 'edit',
                'POST /api/setup/initialize - initial super admin created'
                . ($configuring ? ' and configuration saved' : ''));

            return response()->json([
                'success' => true,
                'message' => $generated
                    ? 'Setup complete. Your super admin account is ready - copy the generated password now, it is shown once.'
                    : 'Setup complete. Your super admin account is ready.',
                'data'    => array_merge($employee->toArray(), [
                    'setup_complete' => count(SystemSettings::missingCritical()) === 0,
                    // Only a generated secret is echoed back; a chosen one is
                    // already stored as a bcrypt digest and never round-trips.
                    'generated_password' => $generated ? $password : null,
                    'must_change_password' => $generated,
                ]),
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Setup failed',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /** True while no employee row exists - the only state a bootstrap may run in. */
    private function rosterEmpty(): bool
    {
        try {
            return ! Employee::query()->exists();
        } catch (\Throwable $e) {
            return false;
        }
    }
}
