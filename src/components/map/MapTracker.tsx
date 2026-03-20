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

const PHASE_LABELS = ['PRE_LCH', 'LAUNCH', 'CLIMB', 'CRUISE', 'LOITER', 'INGRESS', 'TERMINAL', 'POST_MSN']

function makeLmIcon(phase: string, speed: number, alt: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
    <!-- Blimp label background -->
    <rect x="4" y="0" width="112" height="26" rx="4" fill="rgba(0,20,30,0.85)" stroke="#00E5FF" stroke-width="1"/>
    <text x="60" y="11" text-anchor="middle" fill="#00E5FF" font-family="monospace" font-size="9" font-weight="700">${phase}</text>
    <text x="60" y="22" text-anchor="middle" fill="#88CCDD" font-family="monospace" font-size="8">${Math.round(speed)}kt  ${Math.round(alt)}m</text>
    <!-- Connector line -->
    <line x1="60" y1="26" x2="60" y2="40" stroke="#00E5FF" stroke-width="1" opacity="0.5"/>
    <!-- Aircraft icon (delta wing LM shape) -->
    <g transform="translate(60,58)">
      <path d="M0,-16 L-4,-6 L-18,6 L-18,8 L-4,4 L-3,14 L-6,16 L-6,18 L0,16 L6,18 L6,16 L3,14 L4,4 L18,8 L18,6 L4,-6 Z" fill="#00E5FF" stroke="#003344" stroke-width="0.5"/>
      <!-- Glow pulse -->
      <circle r="4" fill="#00E5FF" opacity="0.3"/>
    </g>
  </svg>`
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

    // LM marker — large aircraft icon with info blimp label
    try {
      markerRef.current = mapplsGlobal.Marker({
        map: mapInstance,
        position: ORIGIN,
        icon: {
          url: 'data:image/svg+xml,' + encodeURIComponent(makeLmIcon('CRUISE', 0, 2000)),
          scaledSize: { width: 120, height: 80 },
          anchor: { x: 60, y: 65 },
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

      // Update LM marker position and icon
      if (markerRef.current) {
        try {
          markerRef.current.setPosition(pos)
        } catch { /* setPosition may not exist */ }

        // Update icon with live telemetry
        const phase = PHASE_LABELS[Math.round(state.values.flt_phase ?? 3)] ?? 'CRUISE'
        const speed = state.values.gs ?? 0
        const alt = state.values.alt_msl ?? 2000
        try {
          markerRef.current.setIcon({
            url: 'data:image/svg+xml,' + encodeURIComponent(makeLmIcon(phase, speed, alt)),
            scaledSize: { width: 120, height: 80 },
            anchor: { x: 60, y: 65 },
          })
        } catch { /* setIcon may not exist */ }
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
