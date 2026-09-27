<?php

namespace App\Http\Controllers;

use App\Models\EmpLog;
use App\Models\Employee;
use Illuminate\Http\Request;

class AccessAPI extends Controller
{
    /*
        Flagging irregularities
        ----------
        JSON REQUEST

        action - string (req)
        desc   - string (req)
    */
    public function flagIrregularity(Request $json)
    {
        $validator = (new InputValidatorAPI())->flagIrregularity($json);
        if ($validator) return $validator;

        try {
            $employee = $json->user('sanctum');
            if (! $employee instanceof Employee) {
                return response()->json(['success' => false, 'message' => 'Employee authentication required'], 403);
            }

            EmpLog::create([
                'emp_id'         => $employee->emp_id,
                'emplog_created' => now(),
                'emplog_action'  => 'FLAG',
                'emplog_desc'    => $json->input('action') . ': ' . $json->input('desc'),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Irregularity flagged successfully',
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to flag irregularity',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }

    /*
        Logging actions
        ----------
        JSON REQUEST

        action - string (req)
        desc   - string (req)
    */
    public function logAction(Request $json)
    {
        $validator = (new InputValidatorAPI())->logAction($json);
        if ($validator) return $validator;

        try {
            $employee = $json->user('sanctum');
            if (! $employee instanceof Employee) {
                return response()->json(['success' => false, 'message' => 'Employee authentication required'], 403);
            }

            EmpLog::create([
                'emp_id'         => $employee->emp_id,
                'emplog_created' => now(),
                'emplog_action'  => $json->input('action'),
                'emplog_desc'    => $json->input('desc'),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Action logged successfully',
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to log action',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }
}