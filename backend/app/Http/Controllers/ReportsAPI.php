<?php

namespace App\Http\Controllers;

use App\Models\Report;
use App\Services\ReportBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ReportsAPI extends Controller
{
    private ReportBuilder $builder;

    public function __construct()
    {
        $this->builder = new ReportBuilder();
    }

    public function index(Request $json)
    {
        try {
            $user = $json->user();
            $isAdmin = $user instanceof \App\Models\Employee && in_array($user->emp_type, ['ADMIN', 'SUPER ADMIN']);

            if (! $isAdmin) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $reports = Report::with('employee')
                ->where('emp_id', $user->emp_id)
                ->orderBy('report_created', 'desc')
                ->get();

            return response()->json([
                'success' => true,
                'message' => 'Reports retrieved successfully',
                'data' => $reports,
            ], 200);
        } catch (\Exception $e) {
            Log::error('ReportsAPI index error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve reports',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function show(Request $json, $id)
    {
        try {
            $user = $json->user();
            $isAdmin = $user instanceof \App\Models\Employee && in_array($user->emp_type, ['ADMIN', 'SUPER ADMIN']);

            if (! $isAdmin) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $report = Report::where('report_id', $id)
                ->where('emp_id', $user->emp_id)
                ->first();

            if (! $report) {
                return response()->json(['success' => false, 'message' => 'Report not found'], 404);
            }

            return response()->json([
                'success' => true,
                'message' => 'Report retrieved successfully',
                'data' => $report,
            ], 200);
        } catch (\Exception $e) {
            Log::error('ReportsAPI show error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve report',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function store(Request $json)
    {
        try {
            $user = $json->user();
            $isAdmin = $user instanceof \App\Models\Employee && in_array($user->emp_type, ['ADMIN', 'SUPER ADMIN']);

            if (! $isAdmin) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $reportType = $json->input('report_type');
            $filters = $json->input('filters', []);
            $saveTemplate = $json->input('save_template', false);
            $templateName = $json->input('template_name');

            $reportData = match ($reportType) {
                'sales' => $this->builder->buildSalesReport($filters),
                'inventory' => $this->builder->buildInventoryReport($filters),
                'appointments' => $this->builder->buildAppointmentsReport($filters),
                'staffing' => $this->builder->buildStaffingReport($filters),
                default => throw new \InvalidArgumentException('Invalid report type'),
            };

            $report = null;
            if ($saveTemplate && $templateName) {
                $report = Report::create([
                    'emp_id' => $user->emp_id,
                    'report_created' => now(),
                    'report_title' => $templateName,
                    'report_text' => json_encode([
                        'type' => $reportType,
                        'filters' => $filters,
                    ]),
                    'report_file' => null,
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Report generated successfully',
                'data' => [
                    'report' => $report,
                    'report_data' => $reportData,
                ],
            ], 201);
        } catch (\Exception $e) {
            Log::error('ReportsAPI store error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to generate report',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function update(Request $json, $id)
    {
        try {
            $user = $json->user();
            $isAdmin = $user instanceof \App\Models\Employee && in_array($user->emp_type, ['ADMIN', 'SUPER ADMIN']);

            if (! $isAdmin) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $report = Report::where('report_id', $id)
                ->where('emp_id', $user->emp_id)
                ->first();

            if (! $report) {
                return response()->json(['success' => false, 'message' => 'Report not found'], 404);
            }

            $report->update([
                'report_title' => $json->input('report_title', $report->report_title),
                'report_text' => $json->input('report_text', $report->report_text),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Report template updated successfully',
                'data' => $report->fresh(),
            ], 200);
        } catch (\Exception $e) {
            Log::error('ReportsAPI update error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to update report',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function destroy(Request $json, $id)
    {
        try {
            $user = $json->user();
            $isAdmin = $user instanceof \App\Models\Employee && in_array($user->emp_type, ['ADMIN', 'SUPER ADMIN']);

            if (! $isAdmin) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            $report = Report::where('report_id', $id)
                ->where('emp_id', $user->emp_id)
                ->first();

            if (! $report) {
                return response()->json(['success' => false, 'message' => 'Report not found'], 404);
            }

            $report->delete();

            return response()->json([
                'success' => true,
                'message' => 'Report template deleted successfully',
            ], 200);
        } catch (\Exception $e) {
            Log::error('ReportsAPI destroy error', ['error' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to delete report',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}