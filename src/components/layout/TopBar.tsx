import Logo from '../common/Logo'
import StatusLED from '../common/StatusLED'
import { useFaultStore } from '../../stores/faultStore'
import { useNavigationStore } from '../../stores/navigationStore'
import { useUIStore, TARGET_LOCATIONS } from '../../stores/uiStore'

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

      {/* Center: Target selector + Launch/Terminate */}
      <MissionControls />

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

function MissionControls() {
  const missionFlow = useUIStore((s) => s.missionFlow)
  const missionComplete = useUIStore((s) => s.missionComplete)
  const activeTargetId = useUIStore((s) => s.activeTargetId)
  const targetChanged = useUIStore((s) => s.targetChanged)
  const setActiveTarget = useUIStore((s) => s.setActiveTarget)
  const launchMission = useUIStore((s) => s.launchMission)
  const terminateMission = useUIStore((s) => s.terminateMission)
  const lockNewTarget = useUIStore((s) => s.lockNewTarget)

  const isIdle = missionFlow === 'IDLE'
  const isRTH = missionFlow === 'RTH'
  const isLanded = missionFlow === 'LANDED'

  // Determine button state
  let buttonLabel: string
  let buttonColor: string
  let buttonBg: string
  let buttonBorder: string
  let onButtonClick: () => void

  if (missionComplete) {
    buttonLabel = 'MISSION COMPLETE'
    buttonColor = '#5A6A82'
    buttonBg = 'rgba(255, 255, 255, 0.03)'
    buttonBorder = 'rgba(255, 255, 255, 0.1)'
    onButtonClick = () => {}
  } else if (isIdle || isLanded) {
    buttonLabel = 'LAUNCH'
    buttonColor = '#00FF88'
    buttonBg = 'rgba(0, 255, 136, 0.1)'
    buttonBorder = 'rgba(0, 255, 136, 0.4)'
    onButtonClick = launchMission
  } else if (targetChanged) {
    buttonLabel = 'LOCK ON NEW TARGET'
    buttonColor = '#FFB800'
    buttonBg = 'rgba(255, 184, 0, 0.1)'
    buttonBorder = 'rgba(255, 184, 0, 0.4)'
    onButtonClick = lockNewTarget
  } else if (isRTH) {
    buttonLabel = 'RETURNING HOME...'
    buttonColor = '#FFB800'
    buttonBg = 'rgba(255, 184, 0, 0.08)'
    buttonBorder = 'rgba(255, 184, 0, 0.3)'
    onButtonClick = () => {} // no action during RTH
  } else {
    buttonLabel = 'TERMINATE'
    buttonColor = '#E24B4A'
    buttonBg = 'rgba(226, 75, 74, 0.1)'
    buttonBorder = 'rgba(226, 75, 74, 0.4)'
    onButtonClick = terminateMission
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {/* Target label */}
      <span className="font-mono" style={{ fontSize: '9px', color: '#5A6A82', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        TARGET
      </span>

      {/* Dropdown */}
      <select
        value={activeTargetId}
        onChange={(e) => setActiveTarget(e.target.value)}
        disabled={isRTH || missionComplete}
        className="font-mono"
        style={{
          padding: '4px 8px',
          borderRadius: '5px',
          border: '1px solid rgba(255,255,255,0.1)',
          backgroundColor: '#0A0E1A',
          color: '#00E5FF',
          fontSize: '10px',
          fontWeight: 600,
          cursor: isRTH ? 'not-allowed' : 'pointer',
          outline: 'none',
          minWidth: '180px',
          opacity: isRTH ? 0.5 : 1,
        }}
      >
        {TARGET_LOCATIONS.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>

      {/* Action button */}
      <button
        onClick={onButtonClick}
        disabled={isRTH || missionComplete}
        className="font-mono"
        style={{
          padding: '5px 16px',
          borderRadius: '5px',
          border: `1px solid ${buttonBorder}`,
          backgroundColor: buttonBg,
          color: buttonColor,
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          cursor: isRTH ? 'not-allowed' : 'pointer',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          transition: 'all 0.2s',
        }}
      >
        {buttonLabel}
      </button>
    </div>
  )
}
