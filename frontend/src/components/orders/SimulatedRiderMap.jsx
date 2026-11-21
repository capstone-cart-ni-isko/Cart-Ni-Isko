import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { STORE, TRIP_MS } from '../../utils/riderSimulation.js'

/*
    Demo rider for deliveries that have no real courier booking.

    When an order is In Transit and LalaMove has not booked a rider (no API
    keys, or sandbox only), the order screen shows a SIMULATED rider moving
    from the store to the customer's pinned drop-off. Nothing is sent to or
    stored on the server: the position is worked out from the moment staff
    marked the order In Transit (deliver_pickedup), so every device shows the
    same spot. A real booking shows LalaMove's own tracking link instead.

    Turn it off with VITE_DELIVERY_SIMULATION=false.
*/


const riderIcon = L.divIcon({
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  html: `<div style="width:34px;height:34px;border-radius:9999px;background:#FF6600;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/>
      <path d="M8.5 17.5h6l-3-7H8"/><path d="M15 6h2l1.5 4.5"/><path d="M18.5 17.5 16 10.5h-4.5"/>
    </svg></div>`,
})

/** Metres between two points (haversine). */
function distance(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** The point `fraction` (0..1) of the way along a path. */
function pointAlong(path, fraction) {
  if (path.length < 2) return path[0]
  const legs = path.slice(1).map((p, i) => distance(path[i], p))
  const total = legs.reduce((a, b) => a + b, 0) || 1
  let target = Math.min(Math.max(fraction, 0), 1) * total
  for (let i = 0; i < legs.length; i += 1) {
    if (target <= legs[i] || i === legs.length - 1) {
      const t = legs[i] ? Math.min(target / legs[i], 1) : 1
      return {
        lat: path[i].lat + (path[i + 1].lat - path[i].lat) * t,
        lng: path[i].lng + (path[i + 1].lng - path[i].lng) * t,
      }
    }
    target -= legs[i]
  }
  return path[path.length - 1]
}

function FitRoute({ path }) {
  const map = useMap()
  useEffect(() => {
    if (path.length >= 2) map.fitBounds(L.latLngBounds(path.map((p) => [p.lat, p.lng])), { padding: [28, 28] })
  }, [map, path])
  return null
}

/**
 * @param {object} props
 * @param {object} props.raw  order payload (deliver_lat, deliver_lng, deliver_pickedup)
 */
export default function SimulatedRiderMap({ raw }) {
  const dest = useMemo(() => {
    const lat = Number(raw?.deliver_lat)
    const lng = Number(raw?.deliver_lng)
    return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null
  }, [raw?.deliver_lat, raw?.deliver_lng])

  // Trip clock: when staff marked the order In Transit. An order without that
  // stamp (set In Transit before it was recorded) counts as arrived - the
  // same rule as simulationInProgress(), so the map and the "I received"
  // check always agree and the trip never restarts on each open.
  const [firstSeen] = useState(() => Date.now())
  const startedAt = useMemo(() => {
    const t = Date.parse(raw?.deliver_pickedup || '')
    return Number.isFinite(t) ? t : firstSeen - TRIP_MS
  }, [raw?.deliver_pickedup, firstSeen])

  const [now, setNow] = useState(() => Date.now())
  const done = now - startedAt >= TRIP_MS
  useEffect(() => {
    if (done) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [done])

  // Road route from the public OSRM demo server; a straight line if it fails.
  const [route, setRoute] = useState(null)
  useEffect(() => {
    if (!dest) return undefined
    let alive = true
    const url = `https://router.project-osrm.org/route/v1/driving/${STORE.lng},${STORE.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`
    fetch(url)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('route'))))
      .then((data) => {
        const coords = data?.routes?.[0]?.geometry?.coordinates
        if (alive && Array.isArray(coords) && coords.length >= 2) {
          setRoute(coords.map(([lng, lat]) => ({ lat, lng })))
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [dest])

  // Stable between the per-second ticks, so FitRoute only re-fits when the
  // route itself changes and the customer can pan and zoom freely.
  const path = useMemo(() => route || (dest ? [STORE, dest] : []), [route, dest])

  if (!dest) {
    return (
      <p className="text-xs text-gray-500">
        Rider map unavailable: this order has no pinned drop-off location.
      </p>
    )
  }

  const fraction = Math.min((now - startedAt) / TRIP_MS, 1)
  const rider = pointAlong(path, fraction)
  const minutesLeft = Math.max(0, Math.ceil((TRIP_MS - (now - startedAt)) / 60000))

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="h-56 w-full">
        <MapContainer center={[rider.lat, rider.lng]} zoom={14} scrollWheelZoom={false} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitRoute path={path} />
          <Polyline positions={path.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#FF6600', weight: 4, opacity: 0.7 }} />
          <CircleMarker center={[STORE.lat, STORE.lng]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#1e293b', fillOpacity: 1 }} />
          <CircleMarker center={[dest.lat, dest.lng]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }} />
          <Marker position={[rider.lat, rider.lng]} icon={riderIcon} />
        </MapContainer>
      </div>
      <div className="px-3 py-2 flex items-center justify-between gap-3 border-t border-slate-100">
        <p className="text-xs font-semibold text-gray-800">
          {done ? 'Rider has arrived' : `Rider on the way · about ${minutesLeft} min`}
        </p>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          Simulation
        </span>
      </div>
    </div>
  )
}
