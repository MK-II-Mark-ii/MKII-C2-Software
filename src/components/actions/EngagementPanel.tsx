import { useUIStore, DEFAULT_ENGAGEMENT } from '../../stores/uiStore'
import { useTelemetryStore } from '../../stores/telemetryStore'
import { X } from 'lucide-react'

const BEARING_PRESETS = [
  { label: 'N', value: 0, angle: -90 },
  { label: 'NE', value: 45, angle: -45 },
  { label: 'E', value: 90, angle: 0 },
  { label: 'SE', value: 135, angle: 45 },
  { label: 'S', value: 180, angle: 90 },
  { label: 'SW', value: 225, angle: 135 },
  { label: 'W', value: 270, angle: 180 },
  { label: 'NW', value: 315, angle: 225 },
]

export default function EngagementDialog() {
  const open = useUIStore((s) => s.engagementDialogOpen)
  const missionFlow = useUIStore((s) => s.missionFlow)
  const config = useUIStore((s) => s.engagementConfig)
  const setConfig = useUIStore((s) => s.setEngagementConfig)
  const engageTarget = useUIStore((s) => s.engageTarget)
  const abortAttack = useUIStore((s) => s.abortAttack)
  const abortAvailable = useUIStore((s) => s.abortAvailable)
  const engageRequested = useUIStore((s) => s.engageRequested)
  const closeDialog = () => useUIStore.getState().setEngagementDialogOpen(false)
  const values = useTelemetryStore((s) => s.values)

  const isLoitering = missionFlow === 'LOITERING'
  const isPositioning = isLoitering && engageRequested
  const isEngaging = missionFlow === 'ENGAGING'
  const isTerminal = missionFlow === 'TERMINAL'
  const canConfigure = isLoitering && !engageRequested
  const distKm = Math.round((values.wpt_dist ?? 0) / 1000)

  if (!open) return null

  // Status color/text
  let statusColor = '#8899AA'
  let statusText = `EN ROUTE — ${distKm} km`
  if (isPositioning) { statusColor = '#FFB800'; statusText = 'POSITIONING' }
  else if (isLoitering) { statusColor = '#00FF88'; statusText = 'LOITERING' }
  else if (isEngaging) { statusColor = '#E24B4A'; statusText = 'INBOUND' }
  else if (isTerminal) { statusColor = '#E24B4A'; statusText = 'TERMINAL' }

  return (
    <div style={{
      position: 'absolute',
      top: 56,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 20,
      pointerEvents: 'auto',
      width: 420,
      backgroundColor: 'rgba(6, 10, 18, 0.92)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(0, 229, 255, 0.15)',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: '#00E5FF', letterSpacing: '0.12em' }}>
            ENGAGEMENT
          </span>
          <span className="font-mono" style={{
            fontSize: '9px', fontWeight: 600, color: statusColor,
            padding: '2px 8px', borderRadius: '3px',
            backgroundColor: `${statusColor}15`, border: `1px solid ${statusColor}40`,
          }}>
            {statusText}
          </span>
        </div>
        <button onClick={closeDialog} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
          color: '#5A6A82', display: 'flex',
        }}>
          <X size={16} />
        </button>
      </div>

      {/* Main content: compass left, sliders right */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Left: Circular attack direction compass */}
        <div style={{ flexShrink: 0 }}>
          <div className="font-mono" style={{ fontSize: '8px', color: '#5A6A82', letterSpacing: '0.1em', marginBottom: '6px', textAlign: 'center' }}>
            ATTACK FROM
          </div>
          <AttackCompass
            value={config.attackBearing}
            onChange={(v) => canConfigure && setConfig({ attackBearing: v })}
            disabled={!canConfigure}
          />
        </div>

        {/* Right: Sliders + buttons */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <SliderRow label="DIVE ANGLE" value={config.diveAngle} min={20} max={70} step={5} unit="°"
            onChange={(v) => canConfigure && setConfig({ diveAngle: v })} disabled={!canConfigure} />
          <SliderRow label="ENGAGE ALT" value={config.engageAltitude} min={500} max={3000} step={100} unit="m"
            onChange={(v) => canConfigure && setConfig({ engageAltitude: v })} disabled={!canConfigure} />
          <SliderRow label="TERM SPEED" value={config.terminalSpeed} min={80} max={220} step={10} unit="kt"
            onChange={(v) => canConfigure && setConfig({ terminalSpeed: v })} disabled={!canConfigure} />

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            {isLoitering && !engageRequested && (
              <button onClick={engageTarget} className="font-mono" style={{
                flex: 1, padding: '8px', borderRadius: '6px',
                border: '1px solid rgba(226, 75, 74, 0.5)',
                backgroundColor: 'rgba(226, 75, 74, 0.12)', color: '#E24B4A',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
              }}>
                ENGAGE
              </button>
            )}
            {(isEngaging || isTerminal) && abortAvailable && (
              <button onClick={abortAttack} className="font-mono" style={{
                flex: 1, padding: '8px', borderRadius: '6px',
                border: '1px solid rgba(255, 184, 0, 0.5)',
                backgroundColor: 'rgba(255, 184, 0, 0.12)', color: '#FFB800',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
              }}>
                ABORT
              </button>
            )}
            {canConfigure && (
              <button onClick={() => setConfig({ ...DEFAULT_ENGAGEMENT })} className="font-mono" style={{
                padding: '8px 12px', borderRadius: '6px', border: 'none',
                backgroundColor: 'rgba(255,255,255,0.03)', color: '#5A6A82',
                fontSize: '9px', cursor: 'pointer', letterSpacing: '0.08em',
              }}>
                RESET
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── D-pad style compass with 8 wedge buttons ──
function AttackCompass({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled: boolean
}) {
  const size = 160
  const cx = size / 2
  const cy = size / 2
  const outerR = 68
  const innerR = 28
  const gap = 1.5 // degrees gap between wedges

  // Build wedge arc path for each of the 8 sectors
  function wedgePath(centerDeg: number): string {
    const halfSector = 22.5 - gap
    const startDeg = centerDeg - halfSector - 90
    const endDeg = centerDeg + halfSector - 90
    const startRad = startDeg * Math.PI / 180
    const endRad = endDeg * Math.PI / 180

    const ox1 = cx + outerR * Math.cos(startRad)
    const oy1 = cy + outerR * Math.sin(startRad)
    const ox2 = cx + outerR * Math.cos(endRad)
    const oy2 = cy + outerR * Math.sin(endRad)
    const ix1 = cx + innerR * Math.cos(endRad)
    const iy1 = cy + innerR * Math.sin(endRad)
    const ix2 = cx + innerR * Math.cos(startRad)
    const iy2 = cy + innerR * Math.sin(startRad)

    return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 0 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 0 0 ${ix2} ${iy2} Z`
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring */}
      <circle cx={cx} cy={cy} r={outerR + 4} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

      {/* 8 wedge buttons */}
      {BEARING_PRESETS.map((p) => {
        const isActive = value === p.value
        const midRad = (p.value - 90) * Math.PI / 180
        // Label position: midpoint of wedge
        const labelR = (outerR + innerR) / 2
        const lx = cx + labelR * Math.cos(midRad)
        const ly = cy + labelR * Math.sin(midRad)

        // Arrow indicator for active wedge
        const arrowR = outerR - 8
        const ax = cx + arrowR * Math.cos(midRad)
        const ay = cy + arrowR * Math.sin(midRad)

        return (
          <g key={p.label}
            onClick={() => !disabled && onChange(p.value)}
            style={{ cursor: disabled ? 'default' : 'pointer' }}
            opacity={disabled ? 0.3 : 1}
          >
            <path d={wedgePath(p.value)}
              fill={isActive ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255,255,255,0.04)'}
              stroke={isActive ? '#00E5FF' : 'rgba(255,255,255,0.08)'}
              strokeWidth={isActive ? 1.5 : 0.5}
            />
            {/* Direction arrow triangle pointing outward */}
            <g transform={`translate(${ax},${ay}) rotate(${p.value})`}>
              <polygon points="0,-5 -3.5,3 3.5,3"
                fill={isActive ? '#00E5FF' : '#3A4A5A'}
              />
            </g>
            {/* Label */}
            <text x={lx} y={ly + 3} textAnchor="middle"
              fill={isActive ? '#00E5FF' : '#6A7A8A'}
              fontSize={p.label.length > 1 ? 8 : 10} fontWeight={700}
              fontFamily="'JetBrains Mono', monospace"
            >
              {p.label}
            </text>
          </g>
        )
      })}

      {/* Center circle — bearing readout */}
      <circle cx={cx} cy={cy} r={innerR - 2}
        fill="rgba(6, 10, 18, 0.9)" stroke="rgba(0,229,255,0.2)" strokeWidth={1.5}
      />
      <text x={cx} y={cy - 2} textAnchor="middle"
        fill="#00E5FF" fontSize={14} fontWeight={700}
        fontFamily="'JetBrains Mono', monospace">
        {value}°
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle"
        fill="#5A6A82" fontSize={7}
        fontFamily="'JetBrains Mono', monospace">
        BEARING
      </text>
    </svg>
  )
}

function SliderRow({ label, value, min, max, step, unit, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number; unit: string
  onChange: (v: number) => void; disabled: boolean
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span className="font-mono" style={{ fontSize: '8px', color: '#5A6A82', letterSpacing: '0.08em' }}>{label}</span>
        <span className="font-mono" style={{ fontSize: '11px', fontWeight: 600, color: '#00E5FF', opacity: disabled ? 0.3 : 1 }}>
          {value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} disabled={disabled}
        style={{ width: '100%', accentColor: '#00E5FF', opacity: disabled ? 0.3 : 1 }}
      />
    </div>
  )
}
