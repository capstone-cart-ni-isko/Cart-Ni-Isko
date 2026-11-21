<?php

namespace App\Support;

/**
 * Makes uploaded pictures small before they are stored: at most 1200 px on
 * the long side, re-encoded as WebP (transparency kept). A 1.5 MB PNG
 * sticker typically ends up around 100-200 KB, which keeps pages fast and
 * Supabase egress low.
 *
 * GIFs (possibly animated) and anything GD cannot read are returned as-is,
 * and so is a result that would not actually be smaller.
 */
final class ImageShrinker
{
    public const MAX_SIDE = 1200;
    public const QUALITY = 80;

    /**
     * @return array{0:string,1:string,2:string} [bytes, extension, mime]
     */
    public static function shrink(string $bytes, string $extension, string $mime): array
    {
        $extension = strtolower($extension);
        $original = [$bytes, $extension, $mime];

        if ($extension === 'gif'
            || ! function_exists('imagecreatefromstring')
            || ! function_exists('imagewebp')) {
            return $original;
        }

        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            return $original;
        }

        $ok = false;
        $webp = '';
        try {
            $width = imagesx($image);
            $height = imagesy($image);
            $scale = min(1, self::MAX_SIDE / max($width, $height, 1));

            if ($scale < 1) {
                $newWidth = max(1, (int) round($width * $scale));
                $newHeight = max(1, (int) round($height * $scale));
                $resized = imagecreatetruecolor($newWidth, $newHeight);
                imagealphablending($resized, false);
                imagesavealpha($resized, true);
                imagefill($resized, 0, 0, imagecolorallocatealpha($resized, 0, 0, 0, 127));
                imagecopyresampled($resized, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
                imagedestroy($image);
                $image = $resized;
            } else {
                if (! imageistruecolor($image)) {
                    imagepalettetotruecolor($image);
                }
                imagealphablending($image, false);
                imagesavealpha($image, true);
            }

            ob_start();
            $ok = imagewebp($image, null, self::QUALITY);
            $webp = (string) ob_get_clean();
        } finally {
            imagedestroy($image);
        }

        if (! $ok || $webp === '' || strlen($webp) >= strlen($bytes)) {
            return $original;
        }

        return [$webp, 'webp', 'image/webp'];
    }
}
