import { useEffect, useRef, useState, useCallback } from 'react'
import { useTelemetryStore } from '../../stores/telemetryStore'

// Mission route
const ORIGIN = { lat: 26.9167, lng: 70.9000 }  // 26°55'N 70°54'E
const TARGET = { lat: 24.8359, lng: 66.9832 }   // Target location

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

  // LM screen position for HTML overlay
  const [lmScreen, setLmScreen] = useState<{ x: number; y: number } | null>(null)
  const [lmHeading, setLmHeading] = useState(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapplsGlobal = (window as any).mappls

  // Project lat/lng to screen pixel
  const projectToScreen = useCallback((lat: number, lng: number): { x: number; y: number } | null => {
    if (!mapInstance) return null
    try {
      // Mappls/Mapbox GL project method
      if (typeof mapInstance.project === 'function') {
        const pt = mapInstance.project({ lat, lng })
        if (pt && typeof pt.x === 'number') return { x: pt.x, y: pt.y }
      }
      // Try latLngToContainerPoint (Leaflet-style)
      if (typeof mapInstance.latLngToContainerPoint === 'function') {
        const pt = mapInstance.latLngToContainerPoint({ lat, lng })
        if (pt && typeof pt.x === 'number') return { x: pt.x, y: pt.y }
      }
    } catch { /* ignore */ }
    return null
  }, [mapInstance])

  // Unlock camera when user interacts with map
  useEffect(() => {
    if (!mapInstance) return
    const unlock = () => setCameraLocked(false)
    try {
      mapInstance.on('dragstart', unlock)
      mapInstance.on('zoomstart', unlock)
      mapInstance.on('pitchstart', unlock)
      mapInstance.on('rotatestart', unlock)
    } catch { /* ignore */ }
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
    try {
      projectedPolyRef.current = mapplsGlobal.Polyline({
        map: mapInstance,
        path: generatePlannedRoute(),
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
      })
    } catch { /* ignore */ }

    // Target marker
    try {
      targetMarkerRef.current = mapplsGlobal.Marker({
        map: mapInstance,
        position: TARGET,
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

  // Reproject LM position on map move/zoom
  useEffect(() => {
    if (!mapInstance) return
    const reproject = () => {
      const vals = useTelemetryStore.getState().values
      const lat = vals.lat; const lon = vals.lon
      if (!lat || !lon) return
      const pt = projectToScreen(lat, lon)
      if (pt) setLmScreen(pt)
    }
    try {
      mapInstance.on('move', reproject)
      mapInstance.on('zoom', reproject)
      mapInstance.on('pitch', reproject)
      mapInstance.on('rotate', reproject)
    } catch { /* ignore */ }
    return () => {
      try {
        mapInstance.off('move', reproject)
        mapInstance.off('zoom', reproject)
        mapInstance.off('pitch', reproject)
        mapInstance.off('rotate', reproject)
      } catch { /* ignore */ }
    }
  }, [mapInstance, projectToScreen])

  // Live position updates
  useEffect(() => {
    if (!mapInstance || !mapplsGlobal) return

    const unsub = useTelemetryStore.subscribe((state) => {
      const lat = state.values.lat
      const lon = state.values.lon
      if (!lat || !lon) return

      const pos = { lat, lng: lon }
      const heading = state.values.psi ?? 0
      setLmHeading(heading)

      // Project to screen for HTML overlay
      const pt = projectToScreen(lat, lon)
      if (pt) setLmScreen(pt)

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
              mapInstance.easeTo({ center: pos, bearing: heading, pitch: 50, zoom: 9, duration: 2000 })
            } else {
              if (typeof mapInstance.setCenter === 'function') mapInstance.setCenter(pos)
              if (typeof mapInstance.setBearing === 'function') mapInstance.setBearing(heading)
            }
          } catch { /* ignore */ }
        }
      }
    })

    return unsub
  }, [mapInstance, mapplsGlobal, cameraLocked, projectToScreen])

  // Telemetry for blimp overlay
  const values = useTelemetryStore((s) => s.values)
  const phase = PHASE_LABELS[Math.round(values.flt_phase ?? 3)] ?? 'CRUISE'
  const speed = Math.round(values.gs ?? 0)
  const alt = Math.round(values.alt_msl ?? 2000)
  const distKm = Math.round((values.wpt_dist ?? 0) / 1000)

  return (
    <>
      {/* HTML aircraft icon overlay — positioned via screen projection */}
      {lmScreen && (
        <img
          src={`${import.meta.env.BASE_URL}lm-icon.svg`}
          alt="LM"
          style={{
            position: 'absolute',
            left: lmScreen.x - 32,
            top: lmScreen.y - 32,
            width: 64,
            height: 64,
            zIndex: 12,
            pointerEvents: 'none',
            transform: `rotate(${lmHeading}deg)`,
            transition: 'left 0.25s linear, top 0.25s linear, transform 0.25s linear',
          }}
        />
      )}

      {/* Info blimp overlay */}
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
          const lat = useTelemetryStore.getState().values.lat
          const lon = useTelemetryStore.getState().values.lon
          const hdg = useTelemetryStore.getState().values.psi ?? 0
          if (lat && lon) {
            try {
              mapInstance.easeTo?.({ center: { lat, lng: lon }, bearing: hdg, pitch: 50, zoom: 9, duration: 1000 })
            } catch { /* ignore */ }
          }
        }}
        className="font-mono"
        style={{
          position: 'absolute',
          top: 56,
          right: 12,
          zIndex: 15,
          pointerEvents: 'auto',
          padding: '5px 10px',
          borderRadius: '6px',
          border: `1px solid ${cameraLocked ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.15)'}`,
          backgroundColor: cameraLocked ? 'rgba(0,229,255,0.12)' : 'rgba(10,14,26,0.9)',
          color: cameraLocked ? '#00E5FF' : '#8899AA',
          fontSize: '9px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          cursor: 'pointer',
          textTransform: 'uppercase' as const,
          backdropFilter: 'blur(8px)',
        }}
      >
        {cameraLocked ? '◉ TRACKING LM' : '○ LOCK ON LM'}
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
