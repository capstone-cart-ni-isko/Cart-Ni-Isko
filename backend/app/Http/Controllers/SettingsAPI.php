<?php

    namespace App\Http\Controllers;

    use Illuminate\Http\Request;

    class SettingsAPI extends Controller
    {
        /*
            Displaying system settings
            ----------
            JSON REQUEST (No required params)
        */
        public function displaySettings(Request $json)
        {
            try {
                // Return default store configuration parameters
                $settings = [
                    'store_name' => 'Tindahan ni Isko',
                    'operating_hours' => '08:00 - 17:00',
                    'max_claiming_slots' => 10,
                    'visit_slot_duration' => 10,
                    'claim_slot_duration' => 30,
                    'min_in_store_staff' => 2,
                    'low_stock_threshold' => 5,
                    'maintenance_mode' => false,
                ];

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

                return response()->json([
                    'success' => true,
                    'message' => 'System settings updated successfully',
                    'data' => $newSettings
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
