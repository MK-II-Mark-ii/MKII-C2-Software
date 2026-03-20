import { useEffect, useCallback } from 'react'
import ClassificationBar from './ClassificationBar'
import TopBar from './TopBar'
import BottomBar from './BottomBar'
import LeftPanel from './LeftPanel'
import RightPanel from './RightPanel'
import ActionNotifications from '../actions/ActionNotifications'
import ResizeHandle from '../common/ResizeHandle'
import SphereViewport from '../spheres/SphereViewport'
import MapView from '../map/MapView'
import TelemetryPage from '../telemetry-page/TelemetryPage'
import HudOverlay from '../hud/HudOverlay'
import { useUIStore } from '../../stores/uiStore'
import { useSimulation } from '../../hooks/useSimulation'
import { useFaultStore } from '../../stores/faultStore'
import type { ViewportMode } from '../../stores/uiStore'

function CenterViewport() {
  const mode = useUIStore((s) => s.viewportMode)

  return (
    <>
      {/* Map is always mounted — hidden via CSS when not active, preserving state/position */}
      <div style={{
        position: 'absolute', inset: 0,
        visibility: mode === 'MAP' ? 'visible' : 'hidden',
        zIndex: mode === 'MAP' ? 1 : 0,
      }}>
        <MapView />
        {mode === 'MAP' && <HudOverlay />}
      </div>

      {/* Other views mount/unmount normally */}
      {mode === 'SPHERES' && <SphereViewport />}
      {mode === 'TELEMETRY' && <TelemetryPage />}
    </>
  )
}

function ViewportTabs() {
  const mode = useUIStore((s) => s.viewportMode)
  const setMode = useUIStore((s) => s.setViewportMode)

  const tabs: { key: ViewportMode; label: string; shortcut: string }[] = [
    { key: 'SPHERES', label: 'SPHERES', shortcut: '1' },
    { key: 'MAP', label: 'MAP', shortcut: '2' },
    { key: 'TELEMETRY', label: 'TELEMETRY', shortcut: '3' },
  ]

  return (
    <div style={{
      position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 10,
      display: 'flex', gap: '4px', padding: '4px 6px', borderRadius: '10px',
      backgroundColor: 'rgba(10, 14, 26, 0.85)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setMode(t.key)}
          className="font-mono text-xs tracking-wider uppercase font-medium"
          style={{
            padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            transition: 'all 0.15s',
            backgroundColor: mode === t.key ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
            color: mode === t.key ? '#00E5FF' : '#5A6A82',
          }}
        >
          {t.label}
          <span style={{ marginLeft: '4px', opacity: 0.4 }}>{t.shortcut}</span>
        </button>
      ))}
    </div>
  )
}

export default function Shell() {
  useSimulation()

  const setMode = useUIStore((s) => s.setViewportMode)
  const toggleLeft = useUIStore((s) => s.toggleLeftPanel)
  const toggleRight = useUIStore((s) => s.toggleRightPanel)
  const toggleHud = useUIStore((s) => s.toggleHud)
  const leftOpen = useUIStore((s) => s.leftPanelOpen)
  const rightOpen = useUIStore((s) => s.rightPanelOpen)
  const setLeftWidth = useUIStore((s) => s.setLeftPanelWidth)
  const setRightWidth = useUIStore((s) => s.setRightPanelWidth)

  const onResizeLeft = useCallback((delta: number) => {
    const current = useUIStore.getState().leftPanelWidth
    setLeftWidth(current + delta)
  }, [setLeftWidth])

  const onResizeRight = useCallback((delta: number) => {
    const current = useUIStore.getState().rightPanelWidth
    setRightWidth(current + delta)
  }, [setRightWidth])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const faults = useFaultStore.getState()
      const simTime = performance.now() / 1000

      switch (e.key) {
        case '1': setMode('SPHERES'); break
        case '2': setMode('MAP'); break
        case '3': setMode('TELEMETRY'); break
        case '[': toggleLeft(); break
        case ']': toggleRight(); break
        case 'j': case 'J':
          if (faults.jamming) faults.clearJamming()
          else faults.injectJamming(simTime)
          break
        case 'k': case 'K':
          if (faults.spoofing) faults.clearSpoofing()
          else faults.injectSpoofing(simTime)
          break
        case 'h': case 'H':
          toggleHud()
          break
        case 'Escape':
          faults.clearAll()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setMode, toggleLeft, toggleRight, toggleHud])

  return (
    <div style={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#060A12',
      padding: '8px',
      gap: '6px',
    }}>
      <ClassificationBar />
      <TopBar />

      <div style={{ flex: 1, display: 'flex', minHeight: 0, gap: '6px', position: 'relative' }}>
        {leftOpen && (
          <>
            <LeftPanel />
            <ResizeHandle side="left" onResize={onResizeLeft} />
          </>
        )}

        <div style={{ flex: 1, minWidth: 0, position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
          <ViewportTabs />
          <CenterViewport />
          {/* Stacked notifications when right panel is collapsed */}
          {!rightOpen && <ActionNotifications />}
        </div>

        {rightOpen && (
          <>
            <ResizeHandle side="right" onResize={onResizeRight} />
            <RightPanel />
          </>
        )}
      </div>

      <BottomBar />
    </div>
  )
}
