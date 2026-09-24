<?php

    namespace App\Http\Controllers;

    use App\Models\CustLog;
    use App\Models\Customer;
    use App\Models\EmpLog;
    use App\Models\Employee;
    use Illuminate\Http\Request;

    class AccessAPI extends Controller
    {
        // REQ-UM-04: user_id is optional, but the log tables carry a foreign
        // key, so unknown/missing ids fall back to the authenticated actor
        protected function resolveActor(Request $json): array
        {
            $type = strtolower($json->input('user_type', 'customer'));
            $id = $json->input('user_id');
            $auth = $json->user();

            $exists = $type === 'employee'
                ? $id && Employee::where('emp_id', $id)->exists()
                : $id && Customer::where('cust_id', $id)->exists();

            if (!$exists) {
                $type = $auth instanceof Employee ? 'employee' : 'customer';
                $id = $auth?->getKey();
            }

            return [$type, (int) $id];
        }

        /*
            Flagging irregularities
            ----------
            JSON REQUEST

            user_id - integer (opt)
            user_type - string (opt: customer | employee)
            action - string (req)
            desc - string (req)
        */
        public function flagIrregularity(Request $json)
        {
            $validator = (new InputValidatorAPI())->flagIrregularity($json);
            if ($validator) return $validator;

            try {
                [$userType, $userId] = $this->resolveActor($json);
                $action = '[IRREGULARITY] ' . $json->input('action');
                $desc = $json->input('desc');

                if ($userType === 'employee') {
                    $log = EmpLog::create([
                        'emp_id' => $userId,
                        'emplog_created' => now(),
                        'emplog_action' => $action,
                        'emplog_desc' => $desc,
                    ]);
                } else {
                    $log = CustLog::create([
                        'cust_id' => $userId,
                        'custlog_created' => now(),
                        'custlog_action' => $action,
                        'custlog_desc' => $desc,
                    ]);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Irregularity flagged and logged successfully',
                    'data' => $log
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to flag irregularity',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Logging actions
            ----------
            JSON REQUEST

            user_id - integer (opt)
            user_type - string (opt: customer | employee)
            action - string (req)
            desc - string (req)
        */
        public function logAction(Request $json)
        {
            $validator = (new InputValidatorAPI())->logAction($json);
            if ($validator) return $validator;

            try {
                [$userType, $userId] = $this->resolveActor($json);
                $action = $json->input('action');
                $desc = $json->input('desc');

                if ($userType === 'employee') {
                    $log = EmpLog::create([
                        'emp_id' => $userId,
                        'emplog_created' => now(),
                        'emplog_action' => $action,
                        'emplog_desc' => $desc,
                    ]);
                } else {
                    $log = CustLog::create([
                        'cust_id' => $userId,
                        'custlog_created' => now(),
                        'custlog_action' => $action,
                        'custlog_desc' => $desc,
                    ]);
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Action logged successfully',
                    'data' => $log
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to log action',
                    'error' => $e->getMessage()
                ], 500);
            }
        }
    }
