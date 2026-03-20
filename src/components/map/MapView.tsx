import { useRef, useEffect, useState, useCallback } from 'react'
import MapTracker from './MapTracker'

const MAPPLS_KEY = import.meta.env.VITE_MAPPLS_KEY || ''
const SDK_URL = `https://apis.mappls.com/advancedmaps/api/${MAPPLS_KEY}/map_sdk?layer=vector&v=3.0`

let sdkLoaded = false
let sdkLoading = false
const sdkCallbacks: (() => void)[] = []

function loadMapplsSDK(cb: () => void) {
  if (sdkLoaded) { cb(); return }
  sdkCallbacks.push(cb)
  if (sdkLoading) return
  sdkLoading = true

  const script = document.createElement('script')
  script.src = SDK_URL
  script.async = true
  script.onload = () => {
    sdkLoaded = true
    sdkCallbacks.forEach((fn) => fn())
    sdkCallbacks.length = 0
  }
  script.onerror = () => {
    console.error('Failed to load Mappls SDK')
    sdkLoading = false
  }
  document.head.appendChild(script)
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initMap = useCallback(() => {
    if (!containerRef.current || mapRef.current) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapplsGlobal = (window as any).mappls as any

    if (!mapplsGlobal) {
      setError('Mappls SDK failed to initialize')
      return
    }

    try {
      const map = mapplsGlobal.Map('mappls-container', {
        center: { lat: 26.8882, lng: 70.9150 }, // Jaisalmer AF Station
        zoom: 7,
        zoomControl: true,
        traffic: false,
      })

      mapRef.current = map

      const applyDarkStyle = () => {
        try {
          const styles = mapplsGlobal.getStyles?.()
          if (styles && Array.isArray(styles)) {
            const dark = styles.find((s: { name: string }) =>
              /night|dark/i.test(s.name)
            )
            if (dark) {
              mapplsGlobal.setStyle(dark.name)
            } else {
              for (const name of ['standard-night', 'grey-night', 'night', 'dark']) {
                try { mapplsGlobal.setStyle(name); break } catch { /* try next */ }
              }
            }
          }
        } catch (e) {
          console.warn('Could not set dark style:', e)
        }
        setReady(true)
      }

      if (map && typeof map.on === 'function') {
        map.on('load', applyDarkStyle)
        setTimeout(() => { if (!ready) applyDarkStyle() }, 5000)
      } else {
        setTimeout(applyDarkStyle, 2000)
      }
    } catch (e) {
      console.error('Map init error:', e)
      setError('Map initialization failed')
    }
  }, [])

  useEffect(() => {
    if (!MAPPLS_KEY) {
      setError('VITE_MAPPLS_KEY not set — add it to .env')
      return
    }

    loadMapplsSDK(initMap)
  }, [initMap])

  // Resize map when container size changes
  useEffect(() => {
    if (!containerRef.current || !mapRef.current) return
    const map = mapRef.current as { resize?: () => void }
    if (typeof map.resize !== 'function') return

    const ro = new ResizeObserver(() => {
      map.resize?.()
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [ready])

  if (error) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', backgroundColor: '#060A12', gap: '8px',
      }}>
        <span className="font-mono text-xs" style={{ color: '#E24B4A' }}>MAP UNAVAILABLE</span>
        <span className="font-mono text-[11px]" style={{ color: '#5A6A82' }}>{error}</span>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} id="mappls-container" style={{ width: '100%', height: '100%' }} />
      {!ready && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#060A12',
        }}>
          <span className="font-mono text-xs" style={{ color: '#5A6A82' }}>LOADING MAP...</span>
        </div>
      )}
      {/* Live LM tracker — route, trail, camera chase */}
      {ready && mapRef.current && <MapTracker mapInstance={mapRef.current} />}
    </div>
  )
}
