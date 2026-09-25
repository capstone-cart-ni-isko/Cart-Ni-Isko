<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;

class UploadAPI extends Controller
{
    /**
     * POST /uploads - accept an actual image file, persist it under
     * storage/app/public/uploads/<type>/, and return its public URL.
     *
     * The file bytes live on THIS backend (never a pasted URL or an
     * embedded base64 blob), so product / profile photos survive reloads
     * and other devices. The auth:sanctum route group gates access.
     *
     * multipart/form-data
     *   file - image (png/jpg/jpeg/gif/webp, max 10MB) (req)
     *   type - subfolder: avatar | product | banner ... (opt)
     */
    public function uploadImage(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => ['required', 'image', 'mimes:png,jpg,jpeg,gif,webp', 'max:10240'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first('file'),
            ], 422);
        }

        try {
            $type = preg_replace('/[^a-z0-9_-]/i', '', (string) $request->input('type', 'general')) ?: 'general';
            $file = $request->file('file');
            $filename = now()->format('Ymd_His') . '_' . substr(md5(uniqid('', true)), 0, 8)
                . '.' . strtolower($file->getClientOriginalExtension());

            $path = $file->storeAs('uploads/' . $type, $filename, 'public');

            return response()->json([
                'success' => true,
                'message' => 'File uploaded successfully',
                'data' => [
                    'url' => $request->getSchemeAndHttpHost() . '/storage/' . $path,
                    'path' => $path,
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to upload file',
                'error' => $e->getMessage(),
            ], 500);
        }
    }
}