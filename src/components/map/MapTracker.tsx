import { useEffect, useRef } from 'react'
import { useTelemetryStore } from '../../stores/telemetryStore'

// Mission route
const ORIGIN = { lat: 26.8882, lng: 70.9150 }  // Jaisalmer AF Station
const TARGET = { lat: 31.802, lng: 74.255 }     // Muridke, Pakistan

// Interpolate planned route as straight-line waypoints
function generatePlannedRoute(steps = 100): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push({
      lat: ORIGIN.lat + (TARGET.lat - ORIGIN.lat) * t,
      lng: ORIGIN.lng + (TARGET.lng - ORIGIN.lng) * t,
    })
  }
  return pts
}

interface MapTrackerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapInstance: any
}

export default function MapTracker({ mapInstance }: MapTrackerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trailPolyRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectedPolyRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originMarkerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targetMarkerRef = useRef<any>(null)
  const trailRef = useRef<{ lat: number; lng: number }[]>([])
  const initDoneRef = useRef(false)
  const lastCameraUpdate = useRef(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapplsGlobal = (window as any).mappls

  // Initialize map layers once
  useEffect(() => {
    if (!mapInstance || !mapplsGlobal || initDoneRef.current) return
    initDoneRef.current = true

    // Set initial view: tilted 3D, zoomed to show start area
    try {
      if (typeof mapInstance.setCenter === 'function') {
        mapInstance.setCenter({ lat: ORIGIN.lat, lng: ORIGIN.lng })
      }
      if (typeof mapInstance.setZoom === 'function') {
        mapInstance.setZoom(7)
      }
      if (typeof mapInstance.setPitch === 'function') {
        mapInstance.setPitch(45)
      }
      if (typeof mapInstance.setBearing === 'function') {
        mapInstance.setBearing(30)
      }
    } catch {
      // Some methods may not exist
    }

    // Projected route (dashed, dim)
    const planned = generatePlannedRoute()
    try {
      projectedPolyRef.current = mapplsGlobal.Polyline({
        map: mapInstance,
        path: planned,
        strokeColor: '#00E5FF',
        strokeOpacity: 0.25,
        strokeWeight: 2,
        dasharray: [8, 6],
      })
    } catch {
      // Polyline API may differ
    }

    // Origin marker
    try {
      originMarkerRef.current = mapplsGlobal.Marker({
        map: mapInstance,
        position: ORIGIN,
        icon: {
          url: 'data:image/svg+xml,' + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="none" stroke="#00FF88" stroke-width="2"/><circle cx="8" cy="8" r="2" fill="#00FF88"/></svg>`
          ),
          scaledSize: { width: 16, height: 16 },
          anchor: { x: 8, y: 8 },
        },
      })
    } catch {
      // Marker API may differ
    }

    // Target marker
    try {
      targetMarkerRef.current = mapplsGlobal.Marker({
        map: mapInstance,
        position: TARGET,
        icon: {
          url: 'data:image/svg+xml,' + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><polygon points="10,2 18,18 10,14 2,18" fill="none" stroke="#E24B4A" stroke-width="2"/><circle cx="10" cy="10" r="2" fill="#E24B4A"/></svg>`
          ),
          scaledSize: { width: 20, height: 20 },
          anchor: { x: 10, y: 10 },
        },
      })
    } catch {
      // Marker API may differ
    }

    // LM marker (aircraft icon)
    try {
      markerRef.current = mapplsGlobal.Marker({
        map: mapInstance,
        position: ORIGIN,
        icon: {
          url: 'data:image/svg+xml,' + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2L8 10H3l3 4-1 8 7-3 7 3-1-8 3-4h-5L12 2z" fill="#00E5FF" stroke="#003344" stroke-width="0.5"/></svg>`
          ),
          scaledSize: { width: 28, height: 28 },
          anchor: { x: 14, y: 14 },
        },
      })
    } catch {
      // Marker API may differ
    }

    // Trail polyline (solid, bright)
    try {
      trailPolyRef.current = mapplsGlobal.Polyline({
        map: mapInstance,
        path: [ORIGIN, ORIGIN],
        strokeColor: '#00E5FF',
        strokeOpacity: 0.8,
        strokeWeight: 3,
      })
    } catch {
      // Polyline API may differ
    }
  }, [mapInstance, mapplsGlobal])

  // Live position updates
  useEffect(() => {
    if (!mapInstance || !mapplsGlobal) return

    const unsub = useTelemetryStore.subscribe((state) => {
      const lat = state.values.lat
      const lon = state.values.lon
      if (!lat || !lon) return

      const pos = { lat, lng: lon }

      // Update LM marker position
      if (markerRef.current) {
        try {
          markerRef.current.setPosition(pos)
        } catch {
          // setPosition may not exist
        }
      }

      // Append to trail (throttle to avoid too many points)
      const trail = trailRef.current
      if (trail.length === 0 ||
          Math.abs(lat - trail[trail.length - 1].lat) > 0.001 ||
          Math.abs(lon - trail[trail.length - 1].lng) > 0.001) {
        trail.push(pos)

        // Update trail polyline
        if (trailPolyRef.current) {
          try {
            trailPolyRef.current.setPath(trail)
          } catch {
            // setPath may not exist, try removing and re-adding
          }
        }
      }

      // Camera chase — update every 2 seconds to avoid jitter
      const now = Date.now()
      if (now - lastCameraUpdate.current > 2000) {
        lastCameraUpdate.current = now
        try {
          // Smooth camera: center on LM, tilted 3D view, bearing toward target
          const bearing = state.values.psi ?? 0
          if (typeof mapInstance.easeTo === 'function') {
            mapInstance.easeTo({
              center: pos,
              bearing: bearing,
              pitch: 50,
              zoom: 9,
              duration: 2000,
            })
          } else {
            if (typeof mapInstance.setCenter === 'function') mapInstance.setCenter(pos)
            if (typeof mapInstance.setBearing === 'function') mapInstance.setBearing(bearing)
          }
        } catch {
          // Camera methods may not be available
        }
      }
    })

    return unsub
  }, [mapInstance, mapplsGlobal])

  return null
}
