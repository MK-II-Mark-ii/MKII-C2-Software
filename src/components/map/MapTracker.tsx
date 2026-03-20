import { useEffect, useRef, useState } from 'react'
import { useTelemetryStore } from '../../stores/telemetryStore'

// Mission route
const ORIGIN = { lat: 26.8882, lng: 70.9150 }  // Jaisalmer AF Station
const TARGET = { lat: 31.802, lng: 74.255 }     // Muridke, Pakistan

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
  const [cameraLocked, setCameraLocked] = useState(true)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapplsGlobal = (window as any).mappls

  // Unlock camera when user interacts with map
  useEffect(() => {
    if (!mapInstance) return
    const unlock = () => setCameraLocked(false)
    try {
      mapInstance.on('dragstart', unlock)
      mapInstance.on('zoomstart', unlock)
      mapInstance.on('pitchstart', unlock)
      mapInstance.on('rotatestart', unlock)
    } catch { /* events may not exist */ }
    return () => {
      try {
        mapInstance.off('dragstart', unlock)
        mapInstance.off('zoomstart', unlock)
        mapInstance.off('pitchstart', unlock)
        mapInstance.off('rotatestart', unlock)
      } catch { /* ignore */ }
    }
  }, [mapInstance])

  // Initialize map layers once
  useEffect(() => {
    if (!mapInstance || !mapplsGlobal || initDoneRef.current) return
    initDoneRef.current = true

    try {
      if (typeof mapInstance.setCenter === 'function') mapInstance.setCenter(ORIGIN)
      if (typeof mapInstance.setZoom === 'function') mapInstance.setZoom(7)
      if (typeof mapInstance.setPitch === 'function') mapInstance.setPitch(45)
      if (typeof mapInstance.setBearing === 'function') mapInstance.setBearing(30)
    } catch { /* ignore */ }

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
    } catch { /* ignore */ }

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
    } catch { /* ignore */ }

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
    } catch { /* ignore */ }

    // LM marker — use a simple HTML marker via Mappls
    try {
      markerRef.current = mapplsGlobal.Marker({
        map: mapInstance,
        position: ORIGIN,
        icon: {
          url: 'data:image/svg+xml,' + encodeURIComponent(makeLmSvg(0)),
          scaledSize: { width: 40, height: 40 },
          anchor: { x: 20, y: 20 },
        },
      })
    } catch { /* ignore */ }

    // Trail polyline (solid, bright)
    try {
      trailPolyRef.current = mapplsGlobal.Polyline({
        map: mapInstance,
        path: [ORIGIN, ORIGIN],
        strokeColor: '#00E5FF',
        strokeOpacity: 0.8,
        strokeWeight: 3,
      })
    } catch { /* ignore */ }
  }, [mapInstance, mapplsGlobal])

  // Live position updates
  useEffect(() => {
    if (!mapInstance || !mapplsGlobal) return

    const unsub = useTelemetryStore.subscribe((state) => {
      const lat = state.values.lat
      const lon = state.values.lon
      if (!lat || !lon) return

      const pos = { lat, lng: lon }
      const heading = state.values.psi ?? 0

      // Update LM marker position and heading rotation
      if (markerRef.current) {
        try { markerRef.current.setPosition(pos) } catch { /* ignore */ }
        try {
          markerRef.current.setIcon({
            url: 'data:image/svg+xml,' + encodeURIComponent(makeLmSvg(heading)),
            scaledSize: { width: 40, height: 40 },
            anchor: { x: 20, y: 20 },
          })
        } catch { /* ignore */ }
      }

      // Append to trail
      const trail = trailRef.current
      if (trail.length === 0 ||
          Math.abs(lat - trail[trail.length - 1].lat) > 0.001 ||
          Math.abs(lon - trail[trail.length - 1].lng) > 0.001) {
        trail.push(pos)
        if (trailPolyRef.current) {
          try { trailPolyRef.current.setPath(trail) } catch { /* ignore */ }
        }
      }

      // Camera chase (only when locked)
      if (cameraLocked) {
        const now = Date.now()
        if (now - lastCameraUpdate.current > 2000) {
          lastCameraUpdate.current = now
          try {
            if (typeof mapInstance.easeTo === 'function') {
              mapInstance.easeTo({
                center: pos,
                bearing: heading,
                pitch: 50,
                zoom: 9,
                duration: 2000,
              })
            } else {
              if (typeof mapInstance.setCenter === 'function') mapInstance.setCenter(pos)
              if (typeof mapInstance.setBearing === 'function') mapInstance.setBearing(heading)
            }
          } catch { /* ignore */ }
        }
      }
    })

    return unsub
  }, [mapInstance, mapplsGlobal, cameraLocked])

  // HTML overlay blimp (always visible, positioned via CSS)
  const values = useTelemetryStore((s) => s.values)
  const phase = PHASE_LABELS[Math.round(values.flt_phase ?? 3)] ?? 'CRUISE'
  const speed = Math.round(values.gs ?? 0)
  const alt = Math.round(values.alt_msl ?? 2000)
  const distKm = Math.round((values.wpt_dist ?? 0) / 1000)

  return (
    <>
      {/* Info blimp overlay — always visible at top of map */}
      <div style={{
        position: 'absolute',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 15,
        pointerEvents: 'none',
        display: 'flex',
        gap: '8px',
        padding: '6px 14px',
        borderRadius: '8px',
        backgroundColor: 'rgba(6, 10, 18, 0.88)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(0, 229, 255, 0.2)',
      }}>
        <BlimpItem label="PHASE" value={phase} color="#00E5FF" />
        <BlimpSep />
        <BlimpItem label="GS" value={`${speed} kt`} />
        <BlimpSep />
        <BlimpItem label="ALT" value={`${alt} m`} />
        <BlimpSep />
        <BlimpItem label="DTG" value={`${distKm} km`} />
      </div>

      {/* Camera lock button */}
      <button
        onClick={() => {
          setCameraLocked(true)
          // Immediately snap to LM
          const lat = useTelemetryStore.getState().values.lat
          const lon = useTelemetryStore.getState().values.lon
          const hdg = useTelemetryStore.getState().values.psi ?? 0
          if (lat && lon) {
            try {
              mapInstance.easeTo?.({
                center: { lat, lng: lon },
                bearing: hdg,
                pitch: 50,
                zoom: 9,
                duration: 1000,
              })
            } catch { /* ignore */ }
          }
        }}
        className="font-mono"
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 15,
          pointerEvents: 'auto',
          padding: '6px 16px',
          borderRadius: '8px',
          border: `1px solid ${cameraLocked ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.15)'}`,
          backgroundColor: cameraLocked ? 'rgba(0,229,255,0.1)' : 'rgba(10,14,26,0.9)',
          color: cameraLocked ? '#00E5FF' : '#8899AA',
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.1em',
          cursor: 'pointer',
          textTransform: 'uppercase',
          backdropFilter: 'blur(8px)',
        }}
      >
        {cameraLocked ? '◉ LOCKED ON LM' : '○ LOCK ON LM'}
      </button>
    </>
  )
}

function BlimpItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
      <span className="font-mono" style={{ fontSize: '8px', color: '#5A6A82', letterSpacing: '0.08em' }}>{label}</span>
      <span className="font-mono" style={{ fontSize: '11px', color: color ?? '#B0BFCC', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function BlimpSep() {
  return <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center' }} />
}

// Simple LM aircraft SVG rotated to heading
function makeLmSvg(heading: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <g transform="rotate(${heading}, 20, 20)">
      <path d="M20,4 L16,14 L6,22 L6,24 L16,20 L17,32 L14,34 L14,36 L20,34 L26,36 L26,34 L23,32 L24,20 L34,24 L34,22 L24,14 Z" fill="#00E5FF" stroke="#001a22" stroke-width="1"/>
      <circle cx="20" cy="20" r="2" fill="#ffffff" opacity="0.8"/>
    </g>
    <circle cx="20" cy="20" r="18" fill="none" stroke="#00E5FF" stroke-width="1" opacity="0.25"/>
  </svg>`
}
