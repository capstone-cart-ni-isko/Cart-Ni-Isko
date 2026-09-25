import { API_BASE_URL, getApiToken } from './api.js'

/**
 * POST /uploads — upload a real image file to the backend storage layer and
 * return its public URL (served by the same backend, e.g. 127.0.0.1:8000).
 * Used for product photos and account profile photos.
 */
export async function uploadImage(file, type = 'general') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('type', type)

  const response = await fetch(`${API_BASE_URL}/uploads`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(getApiToken() ? { Authorization: `Bearer ${getApiToken()}` } : {}),
    },
    body: formData,
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    // Non-JSON failure is handled by the status check below.
  }

  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || 'Upload failed')
  }

  return data?.data?.url || data?.data?.path || ''
}