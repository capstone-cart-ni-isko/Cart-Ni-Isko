<?php

    namespace App\Http\Controllers;

    use App\Models\Customer;
    use App\Models\Employee;
    use App\Support\SystemSettings;
    use Illuminate\Http\Request;

    /**
     * DOMAIN 1 / DOMAIN 15 / DOMAIN 29.
     *
     * There is no `settings` table (SPEC section 4): system-wide values live in
     * SystemSettings (storage/app/system-settings.json) and every per-account
     * preference lives on the caller's own customer / employee row.
     */
    class SettingsAPI extends Controller
    {
        /** Preference columns that belong to a customer row (D15/D29). */
        private const CUSTOMER_PREFS = [
            'darkmode'           => 'cust_darkmode',
            'notif_appointremind'=> 'cust_notif_appointremind',
            'notif_email'        => 'cust_notif_email',
            'notif_prod'         => 'cust_notif_prod',
            'backup_phone'       => 'cust_backup_phone',
            'backup_email'       => 'cust_backup_email',
            'backup_ques'        => 'cust_backup_ques',
            'backup_answer'      => 'cust_backup_answer',
            'backup_code'        => 'cust_backup_code',
        ];

        /** Preference columns that belong to an employee row (D15/D29). */
        private const EMPLOYEE_PREFS = [
            'darkmode'           => 'emp_darkmode',
            'notif_appointremind'=> 'emp_notif_appointremind',
            'notif_email'        => 'emp_notif_email',
            'notif_prod'         => 'emp_notif_prod',
            'backup_phone'       => 'emp_backup_phone',
            'backup_email'       => 'emp_backup_email',
            'backup_ques'        => 'emp_backup_ques',
            'backup_answer'      => 'emp_backup_answer',
            'backup_code'        => 'emp_backup_code',
        ];

        /** True when $key is one of the personal preference columns above. */
        private function isPreferenceKey(string $key): bool
        {
            foreach ([self::CUSTOMER_PREFS, self::EMPLOYEE_PREFS] as $map) {
                // Bare aliases the frontend sends: `darkmode`, `notif_email`,
                // `notif_appointremind`, `backup_phone`, ...
                if (array_key_exists($key, $map)) {
                    return true;
                }
                // Canonical column names: `emp_darkmode`, `cust_backup_email`, ...
                if (in_array($key, $map, true)) {
                    return true;
                }
                // Prefixed aliases: `cust_darkmode`, `emp_notif_email`, ...
                foreach ($map as $bare => $column) {
                    if ($key === $column || str_ends_with($key, '_' . $bare)) {
                        return true;
                    }
                }
            }

            return false;
        }

        /** Coerce a preference payload value into the row column type. */
        private function castPreference(string $column, $value)
        {
            if (str_ends_with($column, '_darkmode') || str_ends_with($column, '_notif_email') || str_ends_with($column, '_notif_prod')) {
                return filter_var($value, FILTER_VALIDATE_BOOLEAN);
            }
            if (str_ends_with($column, '_notif_appointremind')) {
                return (int) $value;
            }
            // A contact column stores its contacts as one ';'-separated string.
            if (str_ends_with($column, '_backup_phone') || str_ends_with($column, '_backup_email')) {
                return is_array($value)
                    ? implode('; ', array_values(array_filter(array_map('trim', $value))))
                    : $value;
            }

            return $value;
        }

        /**
         * DOMAIN 29 value rules, checked before anything is written:
         * reminders are whole minutes <= one day (REQ-CUST_SET-01), switches
         * are booleans, and backup contacts are well-formed lists.
         * Returns a 422 response, or null when every value is acceptable.
         */
        private function invalidPreference(array $preferences)
        {
            foreach ($preferences as $key => $value) {
                $key = (string) $key;

                if (str_contains($key, 'notif_appointremind')) {
                    if (filter_var($value, FILTER_VALIDATE_INT) === false
                        || (int) $value < 0 || (int) $value > 1440) {
                        return $this->fail('Appointment reminders must be a whole number of minutes between 0 and 1440.', 422);
                    }
                    continue;
                }

                if (str_contains($key, 'backup_email')) {
                    foreach ($this->contactList($value) as $email) {
                        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                            return $this->fail('Backup email addresses must be valid email addresses.', 422);
                        }
                    }
                    continue;
                }

                if (str_contains($key, 'backup_phone')) {
                    foreach ($this->contactList($value) as $phone) {
                        if (! preg_match('/^\+?[0-9][0-9\s-]{6,19}$/', $phone)) {
                            return $this->fail('Backup phone numbers must be valid phone numbers.', 422);
                        }
                    }
                    continue;
                }

                if (str_contains($key, 'backup_ques') || str_contains($key, 'backup_answer')
                    || str_contains($key, 'backup_code')) {
                    if (is_array($value) || strlen((string) $value) > 255) {
                        return $this->fail('Recovery details must be 255 characters or fewer.', 422);
                    }
                    continue;
                }

                if (str_contains($key, 'darkmode') || str_contains($key, 'notif_email')
                    || str_contains($key, 'notif_prod')) {
                    if (! is_bool($value) && ! in_array($value, [0, 1, '0', '1', 'true', 'false'], true)) {
                        return $this->fail('This setting accepts true or false only.', 422);
                    }
                }
            }

            return null;
        }

        /** A contact column may hold several contacts; ';' or ',' separates them. */
        private function contactList($value): array
        {
            if ($value === null || $value === '') {
                return [];
            }
            if (is_array($value)) {
                $value = implode(';', $value);
            }

            return array_values(array_filter(array_map('trim', preg_split('/[;,]+/', (string) $value))));
        }

        /** 422 envelope for a preference that failed its value rule. */
        private function fail(string $message, int $status = 422)
        {
            return response()->json([
                'success' => false,
                'message' => $message,
            ], $status);
        }

        /** The caller's own preference columns (prefixed + bare aliases). */
        private function callerPreferences($user): array
        {
            if (!$user instanceof Customer && !$user instanceof Employee) {
                return [];
            }

            $map = $user instanceof Customer ? self::CUSTOMER_PREFS : self::EMPLOYEE_PREFS;
            $prefs = [];
            foreach ($map as $bare => $column) {
                $value = $user->getAttribute($column);
                if ($value === null) {
                    continue;
                }
                $prefs[$column] = $value;   // canonical new name
                $prefs[$bare]    = $value;   // legacy alias the frontend reads
            }

            return $prefs;
        }

        /** System settings + caller prefs + the FLOW-SETUP-01 readiness flag. */
        private function payload($user): array
        {
            $settings = SystemSettings::all();

            $missing = SystemSettings::missingCritical();
            $settings['setup_complete'] = count($missing) === 0;
            $settings['missing_critical'] = $missing;

            return array_merge($settings, $this->callerPreferences($user));
        }

        /*
            Displaying settings
            ----------
            JSON REQUEST (No required params)

            Returns the system-wide settings (SystemSettings JSON document),
            the caller's own preference columns and `setup_complete`.
        */
        public function displaySettings(Request $json)
        {
            try {
                $user = $json->user('api');
                $settings = $this->payload($user);

                // D32 - reading settings is a 'view' action.
                if ($user instanceof Employee) {
                    $this->logEmployee((int) $user->getKey(), 'view', 'GET /api/settings/display');
                } elseif ($user instanceof Customer) {
                    $this->logCustomer((int) $user->getKey(), 'view', 'GET /api/settings/display');
                }

                return response()->json([
                    'success' => true,
                    'message' => 'System settings retrieved successfully',
                    'data' => $settings
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display settings',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating settings
            ----------
            JSON REQUEST

            settings - array (req: key-value dictionary)

            Personal preference keys are written to the caller's own row; every
            other key is system-wide and needs a super admin (D1).
        */
        public function updateSettings(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateSettings($json);
            if ($validator) return $validator;

            try {
                $user = $json->user('api');
                if (!$user instanceof Customer && !$user instanceof Employee) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Unauthenticated access.'
                    ], 403);
                }

                $newSettings = $json->input('settings');

                // Split the dictionary: personal preferences vs system keys.
                $preferences = [];
                $system      = [];
                foreach ((array) $newSettings as $key => $value) {
                    $key = (string) $key;
                    if ($this->isPreferenceKey($key)) {
                        $preferences[$key] = $value;
                    } else {
                        $system[$key] = $value;
                    }
                }

                // D1: system-wide values are super-admin only.
                if (!empty($system) && !$this->isSuperAdmin($user)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Only super admin employees may perform this action'
                    ], 403);
                }

                $endpoint = 'PUT /api/settings/update';

                // Personal preferences -> the caller's own row (D15/D29).
                $appliedPreferences = [];
                if (!empty($preferences)) {
                    $map    = $user instanceof Customer ? self::CUSTOMER_PREFS : self::EMPLOYEE_PREFS;
                    $table  = $user instanceof Customer ? 'customer' : 'employee';
                    $keyCol = $user instanceof Customer ? 'cust_id' : 'emp_id';

                    $invalid = $this->invalidPreference($preferences);
                    if ($invalid !== null) {
                        return $invalid;
                    }

                    $updates = [];
                    foreach ($preferences as $key => $value) {
                        $column = $map[$key] ?? null;
                        if ($column === null) {
                            // `cust_darkmode` / `emp_backup_phone` style keys
                            foreach ($map as $bare => $candidate) {
                                if ($key === $candidate || str_ends_with($key, '_' . $bare)) {
                                    $column = $candidate;
                                    break;
                                }
                            }
                        }
                        if ($column !== null) {
                            // A preference key whose column is not part of this
                            // schema (e.g. `emp_notif_prod` on the employee row,
                            // which system-new.docx SCHEMA does not list) is
                            // skipped instead of producing invalid SQL - and it
                            // is NOT counted as a change below, because nothing
                            // was written for it.
                            if (! \Schema::hasColumn($table, $column)) {
                                continue;
                            }
                            $updates[$column] = $this->castPreference($column, $value);
                            $appliedPreferences[] = (string) $key;
                        }
                    }

                    // FLOW-CUST_SET-06 / REQ-CUST_SET-02: backup contacts are
                    // sensitive, so a customer must clear the phone OTP first.
                    $backupTouched = array_key_exists('cust_backup_phone', $updates)
                        || array_key_exists('cust_backup_email', $updates);
                    if ($user instanceof Customer && $backupTouched) {
                        $gate = $this->otpGate($json, 'backup_contacts');
                        if ($gate) return $gate;
                    }

                    if (!empty($updates)) {
                        \DB::table($table)
                            ->where($keyCol, (int) $user->getKey())
                            ->update($updates);
                    }

                    if ($user instanceof Customer && $backupTouched) {
                        // One verification covers exactly one saved change.
                        $this->consumeOtp($json, 'backup_contacts');
                    }
                }

                /*
                    System-wide values -> SystemSettings (D1).

                    REQ-SETUP-01: every value is validated BEFORE it is saved,
                    and a document that could not be written answers with a
                    real error - a super admin must never be told "saved"
                    while the change only ever lived in this one request.
                */
                foreach ($system as $key => $value) {
                    $problem = SystemSettings::invalid((string) $key, $value);
                    if ($problem !== null) {
                        return $this->fail($problem, 422);
                    }
                }
                if (!empty($system) && ! SystemSettings::putMany($system)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'System settings could not be written to storage. Nothing was saved.',
                    ], 500);
                }

                // D32 / REQ-CUST_SET-04 - changing settings is an 'edit' action,
                // recorded with the preference that actually changed.
                $changed = $appliedPreferences;
                if (!empty($system)) {
                    $changed = array_merge($changed, array_keys($system));
                }
                $endpoint .= $changed !== [] ? ' - ' . implode(', ', $changed) : '';

                if ($user instanceof Employee) {
                    $this->logEmployee((int) $user->getKey(), 'edit', $endpoint);
                } else {
                    $this->logCustomer((int) $user->getKey(), 'edit', $endpoint);
                }

                $user->refresh();

                return response()->json([
                    'success' => true,
                    'message' => empty($system)
                        ? 'Settings updated successfully'
                        : 'System settings updated successfully',
                    'data' => $this->payload($user)
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update settings',
                    'error'   => $e->getMessage()
                ], 500);
            }
        }
    }
