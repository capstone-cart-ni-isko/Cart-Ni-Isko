<?php

    namespace App\Http\Controllers;

    use App\Models\Appointment;
    use Illuminate\Http\Request;
    use Illuminate\Support\Str;

    class AppointAPI extends Controller
    {
        /*
            Closing appointments
            ----------
            JSON REQUEST

            appoint_id - integer (req)
        */
        public function closeAppointment(Request $json)
        {
            $validator = (new InputValidatorAPI())->closeAppointment($json);
            if ($validator) return $validator;

            try {
                $appointId = $json->input('appoint_id');
                $appointment = Appointment::where('appoint_id', $appointId)->first();

                if (!$appointment) {
                    return response()->json(['success' => false, 'message' => 'Appointment not found'], 404);
                }

                $appointment->update([
                    'appoint_closed' => now()
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Appointment closed successfully',
                    'data' => $appointment
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to close appointment',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Creating appointments
            ----------
            JSON REQUEST

            cust_id - integer (req)
            appoint_date - string/datetime (req)
            appoint_type - string (req: CLAIM | VISIT)
            appoint_desc - string (opt)
        */
        public function createAppointment(Request $json)
        {
            $validator = (new InputValidatorAPI())->createAppointment($json);
            if ($validator) return $validator;

            try {
                $appointment = Appointment::create([
                    'cust_id'        => $json->input('cust_id'),
                    'appoint_created'=> now(),
                    'appoint_closed' => null,
                    'appoint_date'   => $json->input('appoint_date'),
                    'appoint_type'   => $json->input('appoint_type', 'VISIT'),
                    'appoint_qr'     => 'APPT-' . strtoupper(Str::random(10)),
                    'appoint_desc'   => $json->input('appoint_desc'),
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Appointment created successfully',
                    'data' => $appointment
                ], 201);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to create appointment',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Displaying appointments
            ----------
            JSON REQUEST

            cust_id - integer (opt)
            type - string (opt)
        */
        public function displayAppointments(Request $json)
        {
            try {
                $query = Appointment::query();

                if ($json->has('cust_id')) {
                    $query->where('cust_id', $json->input('cust_id'));
                }
                if ($json->has('type')) {
                    $query->where('appoint_type', $json->input('type'));
                }

                $appointments = $query->orderBy('appoint_date', 'asc')->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Appointments retrieved successfully',
                    'data' => $appointments
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to display appointments',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Searching appointments
            ----------
            JSON REQUEST

            q - string (opt)
            cust_id - integer (opt)
        */
        public function searchAppointments(Request $json)
        {
            try {
                $q = $json->input('q', '');
                $query = Appointment::query();

                if ($json->has('cust_id')) {
                    $query->where('cust_id', $json->input('cust_id'));
                }

                if (!empty($q)) {
                    $query->where(function($builder) use ($q) {
                        $builder->where('appoint_desc', 'like', "%{$q}%")
                                ->orWhere('appoint_qr', 'like', "%{$q}%")
                                ->orWhere('appoint_type', 'like', "%{$q}%");
                    });
                }

                $appointments = $query->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Appointments search completed',
                    'data' => $appointments
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to search appointments',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Sorting appointments
            ----------
            JSON REQUEST

            sort_by - string (opt: date | created | type)
            order - string (opt: asc | desc)
        */
        public function sortAppointments(Request $json)
        {
            try {
                $sortBy = $json->input('sort_by', 'date');
                $order = strtolower($json->input('order', 'asc')) === 'desc' ? 'desc' : 'asc';

                $col = $sortBy === 'created' ? 'appoint_created' : ($sortBy === 'type' ? 'appoint_type' : 'appoint_date');

                $appointments = Appointment::orderBy($col, $order)->get();

                return response()->json([
                    'success' => true,
                    'message' => 'Appointments sorted successfully',
                    'data' => $appointments
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to sort appointments',
                    'error' => $e->getMessage()
                ], 500);
            }
        }

        /*
            Updating appointment details
            ----------
            JSON REQUEST

            appoint_id - integer (req)
            appoint_date - string/datetime (opt)
            appoint_type - string (opt)
            appoint_desc - string (opt)
        */
        public function updateAppointmentDetails(Request $json)
        {
            $validator = (new InputValidatorAPI())->updateAppointmentDetails($json);
            if ($validator) return $validator;

            try {
                $appointId = $json->input('appoint_id');
                $appointment = Appointment::where('appoint_id', $appointId)->first();

                if (!$appointment) {
                    return response()->json(['success' => false, 'message' => 'Appointment not found'], 404);
                }

                $appointment->update($json->only([
                    'appoint_date', 'appoint_type', 'appoint_desc'
                ]));

                return response()->json([
                    'success' => true,
                    'message' => 'Appointment details updated successfully',
                    'data' => $appointment
                ], 200);

            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to update appointment details',
                    'error' => $e->getMessage()
                ], 500);
            }
        }
    }
