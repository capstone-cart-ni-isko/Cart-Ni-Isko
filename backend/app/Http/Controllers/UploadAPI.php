<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * DOMAIN 6-ish file handling: images are stored on THIS backend's disk
 * (storage/app/public/uploads/<type>/) and served from /storage/...
 *
 * There is no Supabase storage bucket anywhere in this flow (SPEC: 18 tables,
 * no bucket config) — a write failure degrades to a self-contained base64 data
 * URL so the caller still gets a usable `url` instead of a 500.
 */
class UploadAPI extends Controller
{
    /** Images only, and at most 2 MB each. */
    private const RULES = ['required', 'image', 'mimes:png,jpg,jpeg,gif,webp', 'max:2048'];

    /**
     * POST /uploads - accept an actual image file, persist it under
     * storage/app/public/uploads/<type>/, and return its public URL.
     *
     * multipart/form-data
     *   file - image (png/jpg/jpeg/gif/webp, max 2MB) (req)
     *   type - subfolder: avatar | product | banner ... (opt)
     */
    public function uploadImage(Request $request)
    {
        $validator = Validator::make($request->all(), ['file' => self::RULES]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first('file'),
            ], 422);
        }

        try {
            $type = preg_replace('/[^a-z0-9_-]/i', '', (string) $request->input('type', 'general')) ?: 'general';
            $file = $request->file('file');
            $extension = strtolower($file->getClientOriginalExtension() ?: 'png');
            if (!in_array($extension, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
                $extension = 'png';
            }

            // Unique name: no two uploads can ever collide, no clock reuse.
            $filename = now()->format('Ymd_His') . '_' . substr(md5(uniqid('', true)), 0, 8)
                . '.' . $extension;

            $path = false;
            try {
                $path = $file->storeAs('uploads/' . $type, $filename, 'public');
            } catch (\Throwable $e) {
                $path = false;
            }

            if ($path) {
                return response()->json([
                    'success' => true,
                    'message' => 'File uploaded successfully',
                    'data' => [
                        'url'     => $request->getSchemeAndHttpHost() . '/storage/' . $path,
                        'path'    => $path,
                        'storage' => 'public',
                    ],
                ], 200);
            }

            // Write failure (read-only disk, missing link, quota...): hand back
            // a data URL so the caller still has something usable to render.
            $mime = $file->getMimeType() ?: 'image/' . $extension;
            $dataUrl = 'data:' . $mime . ';base64,' . base64_encode((string) $file->get());

            return response()->json([
                'success' => true,
                'message' => 'File stored inline (local storage unavailable)',
                'data' => [
                    'url'     => $dataUrl,
                    'path'    => null,
                    'storage' => 'base64',
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to upload file',
                'error'   => $e->getMessage(),
            ], 500);
        }
    }
}
