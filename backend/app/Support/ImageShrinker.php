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

        // A phone photo is often stored sideways with an EXIF "Orientation"
        // tag telling viewers how to turn it. Re-encoding drops that tag, so
        // the turn is applied to the pixels first. Without the exif extension
        // a JPEG is left as it is rather than risk a sideways picture.
        $orientation = 1;
        if (in_array($extension, ['jpg', 'jpeg'], true)) {
            if (! function_exists('exif_read_data')) {
                return $original;
            }
            $exif = @exif_read_data('data://image/jpeg;base64,' . base64_encode($bytes));
            $orientation = (int) ($exif['Orientation'] ?? 1);
        }

        $image = @imagecreatefromstring($bytes);
        if ($image === false) {
            return $original;
        }
        $image = self::orient($image, $orientation);

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

    /** Applies an EXIF orientation (1-8) to the pixels. */
    private static function orient(\GdImage $image, int $orientation): \GdImage
    {
        if (in_array($orientation, [2, 4, 5, 7], true)) {
            imageflip($image, IMG_FLIP_HORIZONTAL);
        }

        $angle = match ($orientation) {
            3, 4 => 180,
            6, 7 => 270,   // imagerotate turns counter-clockwise
            5, 8 => 90,
            default => 0,
        };

        if ($angle === 0) {
            return $image;
        }

        $rotated = imagerotate($image, $angle, 0);
        if ($rotated === false) {
            return $image;
        }
        imagedestroy($image);

        return $rotated;
    }
}
