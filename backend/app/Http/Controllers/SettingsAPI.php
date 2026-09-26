<?php

    namespace App\Http\Controllers;

    use App\Models\Setting;
    use Illuminate\Http\Request;

    class SettingsAPI extends Controller
    {
        // Built-in store configuration used until a value is persisted
        private function defaults(): array
        {
            return [
                'store_name'         => 'Tindahan ni Isko',
                'operating_hours'    => '08:00 - 18:00',
                'max_claiming_slots' => 10,
                'max_visit_slots'    => 1,
                'visit_slot_duration'=> 10,
                'claim_slot_duration'=> 30,
                'min_in_store_staff' => 2,
                'low_stock_threshold'=> 5,
                'maintenance_mode'   => false,
                // REQ-SS-01: the day the term opens. Active employees are set
                // back to Available from this date. It stays a code default so
                // the settings table keeps its zero-row baseline; storing it
                // later simply overrides this value. The default is a future
                // date on purpose: the academic-period job is a bulk write over
                // live employee rows, so it must not fire until a term is
                // actually configured here.
                'academic_period_start' => '2027-08-02',
            ];
        }

        /*
            Displaying system settings
            ----------
            JSON REQUEST (No required params)
        */
        public function displaySettings(Request $json)
        {
            try {
                // Defaults first, then every persisted key on top so pages
                // that store their own keys (store slides, banners, toggles)
                // read back exactly what they saved
                $settings = $this->defaults();
                try {
                    foreach (Setting::all() as $row) {
                        $settings[$row->key] = Setting::getValue($row->key, $row->value);
                    }
                } catch (\Throwable $e) {
                    // Settings table not migrated yet: defaults still apply
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
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating system settings
            ----------
            JSON REQUEST

            settings - array (req: key-value dictionary)
        */
        public function updateSettings(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateSettings($json);
            if ($validator) return $validator;

            try {
                $newSettings = $json->input('settings');

                // Persist each key so later reads (and other endpoints that
                // consume these values) observe the updated configuration
                foreach ($newSettings as $key => $value) {
                    Setting::setValue((string) $key, $value);
                }

                // Return the merged view (stored values + untouched defaults)
                $settings = [];
                foreach ($this->defaults() as $key => $default) {
                    $settings[$key] = Setting::getValue($key, $default);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'System settings updated successfully',
                    'data' => $settings
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update settings',
                    'error' => $e->getMessage()
                ], 500);
            }
        }
    }
