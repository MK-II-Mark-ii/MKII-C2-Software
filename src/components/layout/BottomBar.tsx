import EWStatusStrip from '../telemetry/EWStatusStrip'
import MissionClock from '../telemetry/MissionClock'
import { useFaultStore } from '../../stores/faultStore'
import { useUIStore } from '../../stores/uiStore'

const SPEEDS = [1, 2, 5, 10, 20, 50]

export default function BottomBar() {
  const jamming = useFaultStore((s) => s.jamming)
  const spoofing = useFaultStore((s) => s.spoofing)
  const speed = useUIStore((s) => s.playbackSpeed)
  const setSpeed = useUIStore((s) => s.setPlaybackSpeed)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        height: '40px',
        backgroundColor: '#0A0E1A',
        borderRadius: '10px',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        {/* Left: EW status + fault badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <EWStatusStrip />

          {jamming && (
            <span
              className="font-mono text-xs tracking-wider uppercase font-medium px-2 py-0.5 rounded"
              style={{
                color: '#FFB800',
                backgroundColor: 'rgba(255, 184, 0, 0.1)',
                border: '1px solid rgba(255, 184, 0, 0.3)',
              }}
            >
              JAM ACTIVE
            </span>
          )}
          {spoofing && (
            <span
              className="font-mono text-xs tracking-wider uppercase font-medium px-2 py-0.5 rounded"
              style={{
                color: '#E24B4A',
                backgroundColor: 'rgba(226, 75, 74, 0.1)',
                border: '1px solid rgba(226, 75, 74, 0.3)',
              }}
            >
              SPOOF ACTIVE
            </span>
          )}
        </div>

        {/* Right: Mission clock + speed controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MissionClock />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            padding: '3px 4px',
            borderRadius: '6px',
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className="font-mono"
                style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: speed === s ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                  color: speed === s ? '#00E5FF' : '#5A6A82',
                  transition: 'all 0.15s',
                }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
