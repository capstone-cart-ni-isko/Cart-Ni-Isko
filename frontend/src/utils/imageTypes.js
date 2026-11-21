/*
    The one list of pictures the app accepts - products, profile photos,
    admin avatars and store banners. It mirrors the server's upload rule
    (ProductsAPI::imageRules): PNG, JPEG or WebP, at most 2 MB. Uploads are
    shrunk and stored as WebP on the server.
*/

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

/** For <input type="file" accept={IMAGE_ACCEPT}>. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

/** Plain-language problem with a picked file, or '' when it is fine. */
export function imageFileProblem(file, what = 'Images') {
  if (!file) return ''
  if (!IMAGE_MIME_TYPES.includes(file.type)) return `${what} must be PNG, JPEG or WebP files.`
  if (file.size > MAX_IMAGE_BYTES) return `${what} must be 2 MB or smaller.`
  return ''
}
