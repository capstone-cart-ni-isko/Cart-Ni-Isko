<?php

    namespace App\Http\Controllers;

    use App\Models\CustLog;
    use App\Models\EmpLog;
    use Illuminate\Http\Request;

    class AccessAPI extends Controller
    {
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
                $userType = strtolower($json->input('user_type', 'customer'));
                $action = '[IRREGULARITY] ' . $json->input('action');
                $desc = $json->input('desc');

                if ($userType === 'employee') {
                    $log = EmpLog::create([
                        'emp_id' => $json->input('user_id') ?? 0,
                        'emplog_created' => now(),
                        'emplog_action' => $action,
                        'emplog_desc' => $desc,
                    ]);
                } else {
                    $log = CustLog::create([
                        'cust_id' => $json->input('user_id') ?? 0,
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
                $userType = strtolower($json->input('user_type', 'customer'));
                $action = $json->input('action');
                $desc = $json->input('desc');

                if ($userType === 'employee') {
                    $log = EmpLog::create([
                        'emp_id' => $json->input('user_id') ?? 0,
                        'emplog_created' => now(),
                        'emplog_action' => $action,
                        'emplog_desc' => $desc,
                    ]);
                } else {
                    $log = CustLog::create([
                        'cust_id' => $json->input('user_id') ?? 0,
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
