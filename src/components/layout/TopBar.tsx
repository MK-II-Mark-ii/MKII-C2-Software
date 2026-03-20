import Logo from '../common/Logo'
import MissionClock from '../telemetry/MissionClock'
import StatusLED from '../common/StatusLED'
import { useFaultStore } from '../../stores/faultStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { useUIStore } from '../../stores/uiStore'

export default function TopBar() {
  const jamming = useFaultStore((s) => s.jamming)
  const spoofing = useFaultStore((s) => s.spoofing)
  const gnssHealth = useNavigationStore((s) => s.techniques.GNSS.health_status)
  const ewJam = useNavigationStore((s) => s.parameters['ew_jam_power']?.confidence ?? 1)
  const commsSat = useNavigationStore((s) => s.parameters['comms_satcom']?.confidence ?? 1)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: '48px',
        backgroundColor: '#0A0E1A',
        borderRadius: '10px',
        flexShrink: 0,
      }}
    >
      {/* Left: Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Logo height={22} />
        <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(255,255,255,0.08)' }} />
        <span className="font-mono text-xs tracking-[0.2em] uppercase" style={{ color: '#8899AA' }}>
          CII AUTONOMY DASHBOARD
        </span>
      </div>

      {/* Center: Mission clock + speed controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <MissionClock />
        <SpeedControls />
      </div>

      {/* Right: Status LEDs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <StatusLED status="nominal" label="INS" />
        <StatusLED
          status={gnssHealth === 'DENIED' || gnssHealth === 'SPOOFED' ? 'critical' : gnssHealth === 'DEGRADED' ? 'caution' : 'nominal'}
          label="GNSS"
          blink={jamming || spoofing}
        />
        <StatusLED status="nominal" label="NAV" />
        <StatusLED status={ewJam < 0.5 ? 'caution' : 'nominal'} label="EW" />
        <StatusLED status={commsSat < 0.5 ? 'caution' : 'nominal'} label="COMMS" />
      </div>
    </div>
  )
}

const SPEEDS = [1, 2, 5, 10]

function SpeedControls() {
  const speed = useUIStore((s) => s.playbackSpeed)
  const setSpeed = useUIStore((s) => s.setPlaybackSpeed)

  return (
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
  )
}
