import { apiPost, apiPut } from './api.js'

/** GET-style lookup via POST /tracking/create - fulfillment track of an order. */
export function getTrack(ordId, trackType) {
  return apiPost('/tracking/create', { ord_id: ordId, track_type: trackType })
}

/** PUT /tracking/update - advance pickup/delivery status. */
export function updateTrack(trackId, trackType, status) {
  return apiPut('/tracking/update', { track_id: trackId, track_type: trackType, status })
}

/** PUT /tracking/close - fulfil and close the track. */
export function closeTrack(trackId, trackType) {
  return apiPut('/tracking/close', { track_id: trackId, track_type: trackType })
}

/** POST /tracking/scan - QR verification (SRS QR-code Verification). */
export function scanQr(code, scannedBy = '') {
  return apiPost('/tracking/scan', { code, scanned_by: scannedBy })
}
