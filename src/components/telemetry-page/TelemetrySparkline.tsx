import { useMemo } from 'react'
import type { TelemetryParamDef } from '../../types/telemetry'

export type YScaleMode = 'auto' | 'full'

interface Props {
  param: TelemetryParamDef
  history: number[]
  value: number
  width?: number
  height?: number
  yScale?: YScaleMode
  xWindow?: number
}

export default function TelemetrySparkline(props: Props) {
  const { param } = props

  if (param.format === 'bool') return <BoolIndicator {...props} />
  if (param.format === 'hex') return <HexBadge {...props} />
  if (param.format === 'enum') return <EnumStepChart {...props} />
  return <LineChart {...props} />
}

// ═══════════════════════════════════════════
// BOOL — ON/OFF status bar
// ═══════════════════════════════════════════
function BoolIndicator({ param, history, value }: Props) {
  const isOn = value > 0.5
  const color = isOn ? '#00E5FF' : '#E24B4A'
  const label = isOn ? 'TRUE' : 'FALSE'

  // Mini timeline of recent bool states
  const recent = history.length > 1 ? history.slice(-60) : [value]

  return (
    <CardShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="font-mono" style={{ color: '#8899AA', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {param.label}
        </span>
        <span className="font-mono" style={{
          fontSize: '13px', fontWeight: 700, color,
          padding: '2px 10px', borderRadius: '3px',
          backgroundColor: isOn ? 'rgba(0,229,255,0.1)' : 'rgba(226,75,74,0.1)',
          border: `1px solid ${isOn ? 'rgba(0,229,255,0.25)' : 'rgba(226,75,74,0.25)'}`,
        }}>
          {label}
        </span>
      </div>
      {/* Mini bool timeline */}
      <div style={{ display: 'flex', gap: '1px', height: '8px', marginTop: '4px' }}>
        {recent.map((v, i) => (
          <div key={i} style={{
            flex: 1, borderRadius: '1px',
            backgroundColor: v > 0.5 ? 'rgba(0,229,255,0.4)' : 'rgba(226,75,74,0.15)',
          }} />
        ))}
      </div>
    </CardShell>
  )
}

// ═══════════════════════════════════════════
// HEX — Status badge
// ═══════════════════════════════════════════
function HexBadge({ param, value }: Props) {
  const hexStr = '0x' + Math.round(value).toString(16).toUpperCase().padStart(2, '0')
  const allSet = Math.round(value) === 255
  const color = allSet ? '#00E5FF' : '#FFB800'

  return (
    <CardShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="font-mono" style={{ color: '#8899AA', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {param.label}
        </span>
        <span className="font-mono" style={{
          fontSize: '13px', fontWeight: 700, color,
          padding: '2px 10px', borderRadius: '4px',
          backgroundColor: allSet ? 'rgba(0,229,255,0.08)' : 'rgba(255,184,0,0.08)',
          border: `1px solid ${allSet ? 'rgba(0,229,255,0.2)' : 'rgba(255,184,0,0.2)'}`,
        }}>
          {hexStr}
        </span>
      </div>
      <div className="font-mono" style={{ fontSize: '10px', color: '#5A6A82', marginTop: '4px' }}>
        {allSet ? 'ALL INTERLOCKS SET' : 'INTERLOCKS INCOMPLETE'}
      </div>
    </CardShell>
  )
}

// ═══════════════════════════════════════════
// ENUM — Step chart with label
// ═══════════════════════════════════════════
function EnumStepChart({ param, history, value, width, height = 48, xWindow = 0 }: Props) {
  const vw = width ?? 300
  const labels = param.enumLabels ?? []
  const currentIdx = Math.round(value)
  const currentLabel = labels[currentIdx] ?? String(currentIdx)

  // Color based on position in enum (higher values tend to be more critical)
  const color = currentIdx === 0 ? '#5A6A82' : '#00E5FF'

  const { pathD } = useMemo(() => {
    let data = history.length > 1 ? history : [value, value]
    if (xWindow > 0 && data.length > xWindow) {
      data = data.slice(-xWindow)
    }

    const min = param.min
    const max = param.max
    const range = max - min || 1

    // Step chart: horizontal lines with vertical transitions
    const segments: string[] = []
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * vw
      const y = height - 4 - ((Math.round(data[i]) - min) / range) * (height - 8)
      if (i === 0) {
        segments.push(`M ${x},${y}`)
      } else {
        // Vertical step then horizontal
        const prevY = height - 4 - ((Math.round(data[i - 1]) - min) / range) * (height - 8)
        if (Math.round(data[i]) !== Math.round(data[i - 1])) {
          segments.push(`L ${x},${prevY}`) // horizontal to current x at old y
          segments.push(`L ${x},${y}`)     // vertical step to new y
        } else {
          segments.push(`L ${x},${y}`)
        }
      }
    }

    return { pathD: segments.join(' ') }
  }, [history, value, param, vw, height, xWindow])

  return (
    <CardShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="font-mono" style={{ color: '#8899AA', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {param.label}
        </span>
        <span className="font-mono" style={{
          fontSize: '12px', fontWeight: 700, color,
          padding: '2px 10px', borderRadius: '3px',
          backgroundColor: 'rgba(0,229,255,0.08)',
          border: '1px solid rgba(0,229,255,0.15)',
        }}>
          {currentLabel}
        </span>
      </div>

      {/* Step chart + Y labels */}
      <div style={{ display: 'flex', gap: '2px', marginTop: '2px' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          width: '48px', flexShrink: 0, padding: '2px 0',
        }}>
          <span className="font-mono" style={{ fontSize: '8px', color: '#4A5A6A', lineHeight: 1 }}>
            {labels[param.max] ?? param.max}
          </span>
          <span className="font-mono" style={{ fontSize: '8px', color: '#4A5A6A', lineHeight: 1 }}>
            {labels[param.min] ?? param.min}
          </span>
        </div>
        <svg viewBox={`0 0 ${vw} ${height}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: height - 4, flex: 1 }}>
          {/* Horizontal gridlines for each enum value */}
          {labels.map((_, i) => {
            const y = height - 4 - ((i - param.min) / (param.max - param.min || 1)) * (height - 8)
            return <line key={i} x1={0} y1={y} x2={vw} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          })}
          <path d={pathD} fill="none" stroke={color} strokeWidth={2} opacity={0.9} />
        </svg>
      </div>
    </CardShell>
  )
}

// ═══════════════════════════════════════════
// LINE CHART — continuous values (default)
// ═══════════════════════════════════════════
function LineChart({ param, history, value, width, height = 48, yScale = 'auto', xWindow = 0 }: Props) {
  const vw = width ?? 300

  const { pathD, color, formattedValue, yMin, yMax } = useMemo(() => {
    let data = history.length > 1 ? history : [value, value]
    if (xWindow > 0 && data.length > xWindow) {
      data = data.slice(-xWindow)
    }

    let min: number, max: number
    if (yScale === 'full') {
      min = param.min
      max = param.max
    } else {
      let dataMin = data[0], dataMax = data[0]
      for (const v of data) {
        if (v < dataMin) dataMin = v
        if (v > dataMax) dataMax = v
      }
      const dataRange = dataMax - dataMin || 1
      const pad = dataRange * 0.15
      min = dataMin - pad
      max = dataMax + pad
    }

    const range = max - min || 1
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * vw
      const y = height - 4 - ((v - min) / range) * (height - 8)
      return `${x},${y}`
    })
    const d = `M ${points.join(' L ')}`

    let c = '#00E5FF'
    if (param.criticalHigh !== undefined && value >= param.criticalHigh) c = '#E24B4A'
    else if (param.criticalLow !== undefined && value <= param.criticalLow) c = '#E24B4A'
    else if (param.warningHigh !== undefined && value >= param.warningHigh) c = '#FFB800'
    else if (param.warningLow !== undefined && value <= param.warningLow) c = '#FFB800'

    let fv: string
    switch (param.format) {
      case 'int': fv = Math.round(value).toString(); break
      case 'float1': fv = value.toFixed(1); break
      case 'float2': fv = value.toFixed(2); break
      case 'float4': fv = value.toFixed(4); break
      default: fv = value.toFixed(1)
    }

    return { pathD: d, color: c, formattedValue: fv, yMin: min, yMax: max }
  }, [history, value, param, vw, height, yScale, xWindow])

  const fmtAxis = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`
    if (Math.abs(v) >= 100) return Math.round(v).toString()
    if (Math.abs(v) >= 1) return v.toFixed(1)
    return v.toFixed(2)
  }

  return (
    <CardShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="font-mono" style={{ color: '#8899AA', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {param.label}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
          <span className="font-mono" style={{ color, fontSize: '15px', fontWeight: 600 }}>
            {formattedValue}
          </span>
          {param.unit && (
            <span className="font-mono" style={{ color: '#5A6A82', fontSize: '11px' }}>
              {param.unit}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2px' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          width: '36px', flexShrink: 0, padding: '2px 0',
        }}>
          <span className="font-mono" style={{ fontSize: '9px', color: '#4A5A6A', lineHeight: 1 }}>
            {fmtAxis(yMax)}
          </span>
          <span className="font-mono" style={{ fontSize: '9px', color: '#4A5A6A', lineHeight: 1 }}>
            {fmtAxis(yMin)}
          </span>
        </div>
        <svg viewBox={`0 0 ${vw} ${height}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height, flex: 1 }}>
          {param.warningHigh !== undefined && yScale === 'full' && (
            <rect x={0} y={0} width={vw}
              height={Math.max(0, (1 - (param.warningHigh - yMin) / (yMax - yMin || 1)) * height)}
              fill="#FFB800" opacity={0.06} />
          )}
          {param.warningLow !== undefined && yScale === 'full' && (
            <rect x={0}
              y={height - Math.max(0, ((param.warningLow - yMin) / (yMax - yMin || 1)) * height)}
              width={vw}
              height={Math.max(0, ((param.warningLow - yMin) / (yMax - yMin || 1)) * height)}
              fill="#FFB800" opacity={0.06} />
          )}
          <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8} />
        </svg>
      </div>
    </CardShell>
  )
}

// ═══════════════════════════════════════════
// Shared card container
// ═══════════════════════════════════════════
function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '6px',
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>
      {children}
    </div>
  )
}
