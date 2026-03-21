import { useEffect, useRef, useState, useCallback } from 'react'
import { useTelemetryStore } from '../../stores/telemetryStore'
import { useUIStore } from '../../stores/uiStore'

const ORIGIN = { lat: 26.9167, lng: 70.9000 }

function generatePlannedRoute(target: { lat: number; lng: number }, steps = 100): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push({
      lat: ORIGIN.lat + (target.lat - ORIGIN.lat) * t,
      lng: ORIGIN.lng + (target.lng - ORIGIN.lng) * t,
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
  const trailRef = useRef<{ lat: number; lng: number }[]>([])
  const initDoneRef = useRef(false)
  const lastCameraUpdate = useRef(0)
  const [cameraLocked, setCameraLocked] = useState(true)
  const isAnimatingRef = useRef(false) // true during programmatic easeTo — ignore unlock events

  // Screen positions for HTML overlays
  const [lmScreen, setLmScreen] = useState<{ x: number; y: number } | null>(null)
  const [tgtScreen, setTgtScreen] = useState<{ x: number; y: number } | null>(null)
  // Use a cumulative rotation angle (not clamped to 0-360) to avoid CSS wrap jumps
  const lmHeadingRef = useRef(0)
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
    const unlock = () => {
      // Ignore unlocks caused by programmatic easeTo animations
      if (isAnimatingRef.current) return
      setCameraLocked(false)
    }
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
      if (typeof mapInstance.setPitch === 'function') mapInstance.setPitch(0)
      if (typeof mapInstance.setBearing === 'function') mapInstance.setBearing(0)
    } catch { /* ignore */ }

    // Projected route (dashed, dim)
    try {
      projectedPolyRef.current = mapplsGlobal.Polyline({
        map: mapInstance,
        path: generatePlannedRoute({ lat: 24.8359, lng: 66.9832 }),
        strokeColor: '#00E5FF',
        strokeOpacity: 0.25,
        strokeWeight: 2,
        dasharray: [8, 6],
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
      // Target crosshair
      const tgtLat = vals.tgt_lat ?? 24.8359
      const tgtLon = vals.tgt_lon ?? 66.9832
      const tpt = projectToScreen(tgtLat, tgtLon)
      if (tpt) setTgtScreen(tpt)
      // Update icon rotation when map bearing changes (2D/3D switch)
      const heading = vals.psi ?? 0
      let mapBearing = 0
      try { mapBearing = mapInstance.getBearing?.() ?? 0 } catch { /* ignore */ }
      const targetDeg = heading - mapBearing
      let hdgDiff = targetDeg - lmHeadingRef.current
      hdgDiff = ((hdgDiff + 180) % 360 + 360) % 360 - 180
      lmHeadingRef.current += hdgDiff
      setLmHeading(lmHeadingRef.current)
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
      // Subtract map bearing so icon always points in correct screen direction
      let mapBearing = 0
      try { mapBearing = mapInstance.getBearing?.() ?? 0 } catch { /* ignore */ }
      // Unwrap to avoid CSS rotation jumping (e.g. 350→10 should go +20, not -340)
      const targetDeg = heading - mapBearing
      let diff = targetDeg - lmHeadingRef.current
      // Normalize to [-180, 180]
      diff = ((diff + 180) % 360 + 360) % 360 - 180
      lmHeadingRef.current += diff
      setLmHeading(lmHeadingRef.current)

      // Project to screen for HTML overlays
      const pt = projectToScreen(lat, lon)
      if (pt) setLmScreen(pt)
      const tgtLat = state.values.tgt_lat ?? 24.8359
      const tgtLon = state.values.tgt_lon ?? 66.9832
      const tpt = projectToScreen(tgtLat, tgtLon)
      if (tpt) setTgtScreen(tpt)

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
          isAnimatingRef.current = true
          try {
            if (typeof mapInstance.easeTo === 'function') {
              mapInstance.easeTo({ center: pos, bearing: heading, pitch: 50, zoom: 9, duration: 2000 })
            } else {
              if (typeof mapInstance.setCenter === 'function') mapInstance.setCenter(pos)
              if (typeof mapInstance.setBearing === 'function') mapInstance.setBearing(heading)
            }
          } catch { /* ignore */ }
          // Clear animation flag after easeTo completes
          setTimeout(() => { isAnimatingRef.current = false }, 2200)
        }
      }
    })

    return unsub
  }, [mapInstance, mapplsGlobal, cameraLocked, projectToScreen])

  // Telemetry for blimp overlay
  const values = useTelemetryStore((s) => s.values)
  const missionComplete = useUIStore((s) => s.missionComplete)
  const missionFlow = useUIStore((s) => s.missionFlow)
  const isLanded = missionFlow === 'LANDED'
  const phase = PHASE_LABELS[Math.round(values.flt_phase ?? 3)] ?? 'CRUISE'
  const speed = Math.round(values.gs ?? 0)
  const alt = Math.round(values.alt_msl ?? 2000)
  const distKm = Math.round((values.wpt_dist ?? 0) / 1000)

  const handleResetMission = () => {
    window.location.reload()
  }


  return (
    <>
      {/* Mission complete popup */}
      {missionComplete && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            backgroundColor: '#0A0E1A',
            border: '1px solid rgba(0, 229, 255, 0.3)',
            borderRadius: '12px',
            padding: '32px 48px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 0 60px rgba(0, 229, 255, 0.15)',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              backgroundColor: 'rgba(0, 229, 255, 0.1)',
              border: '2px solid #00E5FF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '28px',
            }}>
              ✓
            </div>
            <div className="font-mono" style={{
              fontSize: '18px', fontWeight: 700, color: '#00E5FF',
              letterSpacing: '0.15em', textTransform: 'uppercase',
            }}>
              CONTACT SUCCESSFUL
            </div>
            <div className="font-mono" style={{
              fontSize: '11px', color: '#8899AA', maxWidth: 280,
            }}>
              Target neutralized. All mission objectives complete. BDA sensor activated.
            </div>
            <button
              onClick={handleResetMission}
              className="font-mono"
              style={{
                marginTop: '8px',
                padding: '10px 32px',
                borderRadius: '8px',
                border: '1px solid rgba(0, 229, 255, 0.3)',
                backgroundColor: 'rgba(0, 229, 255, 0.1)',
                color: '#00E5FF',
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              RESET MISSION
            </button>
          </div>
        </div>
      )}

      {/* RTH Landed popup */}
      {isLanded && !missionComplete && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            backgroundColor: '#0A0E1A',
            border: '1px solid rgba(0, 255, 136, 0.3)',
            borderRadius: '12px',
            padding: '32px 48px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 0 60px rgba(0, 255, 136, 0.15)',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              backgroundColor: 'rgba(0, 255, 136, 0.1)',
              border: '2px solid #00FF88',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '28px', color: '#00FF88',
            }}>
              ✓
            </div>
            <div className="font-mono" style={{
              fontSize: '18px', fontWeight: 700, color: '#00FF88',
              letterSpacing: '0.15em', textTransform: 'uppercase',
            }}>
              SAFELY RETURNED & CAPTURED
            </div>
            <div className="font-mono" style={{
              fontSize: '11px', color: '#8899AA', maxWidth: 300,
            }}>
              LM successfully returned to launch point and captured in safety net. Mission terminated. All systems nominal.
            </div>
            <button
              onClick={handleResetMission}
              className="font-mono"
              style={{
                marginTop: '8px',
                padding: '10px 32px',
                borderRadius: '8px',
                border: '1px solid rgba(0, 255, 136, 0.3)',
                backgroundColor: 'rgba(0, 255, 136, 0.1)',
                color: '#00FF88',
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              RESET MISSION
            </button>
          </div>
        </div>
      )}

      {/* Target crosshair — hide after contact */}
      {tgtScreen && !missionComplete && (
        <div
          style={{
            position: 'absolute',
            left: tgtScreen.x - 20,
            top: tgtScreen.y - 20,
            width: 40,
            height: 40,
            zIndex: 5,
            pointerEvents: 'none',
          }}
          dangerouslySetInnerHTML={{ __html: TARGET_CROSSHAIR_SVG }}
        />
      )}

      {/* HTML aircraft icon overlay — hide after contact */}
      {lmScreen && !missionComplete && (
        <img
          src={`${import.meta.env.BASE_URL}lm-icon.svg`}
          alt="LM"
          style={{
            position: 'absolute',
            left: lmScreen.x - 24,
            top: lmScreen.y - 24,
            width: 48,
            height: 48,
            zIndex: 5,
            pointerEvents: 'none',
            transform: `rotate(${lmHeading}deg)`,
            transition: 'left 0.3s linear, top 0.3s linear, transform 0.5s ease-out',
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
          isAnimatingRef.current = true
          setCameraLocked(true)
          const lat = useTelemetryStore.getState().values.lat
          const lon = useTelemetryStore.getState().values.lon
          const hdg = useTelemetryStore.getState().values.psi ?? 0
          if (lat && lon) {
            try {
              mapInstance.easeTo?.({ center: { lat, lng: lon }, bearing: hdg, pitch: 50, zoom: 9, duration: 1000 })
            } catch { /* ignore */ }
            setTimeout(() => { isAnimatingRef.current = false }, 1200)
          } else {
            isAnimatingRef.current = false
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

const TARGET_CROSSHAIR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="12" fill="none" stroke="#E24B4A" stroke-width="1.5" opacity="0.7"/>
  <circle cx="20" cy="20" r="5" fill="none" stroke="#E24B4A" stroke-width="1.5" opacity="0.9"/>
  <line x1="20" y1="2" x2="20" y2="14" stroke="#E24B4A" stroke-width="1.5"/>
  <line x1="20" y1="26" x2="20" y2="38" stroke="#E24B4A" stroke-width="1.5"/>
  <line x1="2" y1="20" x2="14" y2="20" stroke="#E24B4A" stroke-width="1.5"/>
  <line x1="26" y1="20" x2="38" y2="20" stroke="#E24B4A" stroke-width="1.5"/>
  <circle cx="20" cy="20" r="1.5" fill="#E24B4A"/>
</svg>`

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
