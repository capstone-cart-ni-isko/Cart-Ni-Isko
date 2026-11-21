/*
    Shared settings for the simulated delivery rider (see
    components/orders/SimulatedRiderMap.jsx). Kept apart from the component so
    the order screens can ask about the trip without importing the map.
*/

/** Turn the demo rider off with VITE_DELIVERY_SIMULATION=false. */
export const SIMULATION_ENABLED = import.meta.env.VITE_DELIVERY_SIMULATION !== 'false'

/** Where every simulated trip starts (Tindahan ni Isko, BU). */
export const STORE = {
  lat: Number(import.meta.env.VITE_STORE_LAT) || 13.1440608,
  lng: Number(import.meta.env.VITE_STORE_LNG) || 123.7228153,
}

/** How long a simulated trip takes. */
export const TRIP_MS = 3 * 60 * 1000

/** True while a simulated trip for this order is still under way. */
export function simulationInProgress(raw, now = Date.now()) {
  if (!SIMULATION_ENABLED) return false
  const lat = Number(raw?.deliver_lat)
  const lng = Number(raw?.deliver_lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return false
  const start = Date.parse(raw?.deliver_pickedup || '')
  return Number.isFinite(start) && now - start < TRIP_MS
}
