import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * Drop-a-pin map for a delivery address (OpenStreetMap tiles, the same data
 * source as the backend geocoder). The pin's coordinates travel with the
 * address as deliver_lat / deliver_lng, so the courier quote no longer has to
 * guess the spot from the typed text.
 *
 * value: { lat, lng } | null - onChange({ lat, lng } | null)
 * query: the typed address, used by "Find on map".
 */
const BU_LEGAZPI = { lat: 13.1440, lng: 123.7240 }

function ClickToPin({ onPick }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng })
    },
  })
  return null
}

function FollowPin({ value }) {
  const map = useMap()
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 16))
  }, [map, value])
  return null
}

const round = (n) => Math.round(Number(n) * 1e6) / 1e6

export default function MapPinPicker({ value, onChange, query = '' }) {
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  const pick = (spot) => {
    setNote('')
    onChange({ lat: round(spot.lat), lng: round(spot.lng) })
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setNote('Your browser cannot share its location.')
      return
    }
    setBusy('locate')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy('')
        pick({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setBusy('')
        setNote('Location permission was denied. Tap the map to drop the pin instead.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const findOnMap = async () => {
    const text = query.trim()
    if (text.length < 5) {
      setNote('Type the address first, then use “Find on map”.')
      return
    }
    setBusy('search')
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(text)}`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      const rows = res.ok ? await res.json() : []
      if (rows[0]) pick({ lat: Number(rows[0].lat), lng: Number(rows[0].lon) })
      else setNote('That address was not found on the map. Tap the map to drop the pin.')
    } catch {
      setNote('The map search is unavailable right now. Tap the map to drop the pin.')
    } finally {
      setBusy('')
    }
  }

  const center = value || BU_LEGAZPI

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700">Pin on map <span className="font-normal text-gray-400">(recommended for delivery)</span></span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={findOnMap}
            disabled={Boolean(busy)}
            className="text-[11px] font-semibold text-brand-orange hover:underline disabled:opacity-50 cursor-pointer"
          >
            {busy === 'search' ? 'Searching…' : 'Find on map'}
          </button>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={Boolean(busy)}
            className="text-[11px] font-semibold text-brand-orange hover:underline disabled:opacity-50 cursor-pointer"
          >
            {busy === 'locate' ? 'Locating…' : 'Use my location'}
          </button>
        </div>
      </div>
      <div className="h-56 rounded-xl overflow-hidden border border-gray-200 relative z-0">
        <MapContainer center={[center.lat, center.lng]} zoom={value ? 16 : 14} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPin onPick={pick} />
          <FollowPin value={value} />
          {value && (
            <CircleMarker
              center={[value.lat, value.lng]}
              radius={10}
              pathOptions={{ color: '#FF6A00', fillColor: '#FF6A00', fillOpacity: 0.6, weight: 3 }}
            />
          )}
        </MapContainer>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
        <span>{value ? `Pinned at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'Tap the map where the rider should go.'}</span>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="font-semibold text-red-500 hover:underline cursor-pointer">
            Remove pin
          </button>
        )}
      </div>
      {note && <p className="text-[11px] font-semibold text-amber-700">{note}</p>}
    </div>
  )
}
