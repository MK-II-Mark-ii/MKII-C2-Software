import { useMemo } from 'react'
import type { TelemetryParamDef } from '../../types/telemetry'

interface Props {
  param: TelemetryParamDef
  history: number[]
  value: number
  width?: number
  height?: number
}

export default function TelemetrySparkline({ param, history, value, width, height = 48 }: Props) {
  // Use a normalized viewBox width; SVG stretches to fill container
  const vw = width ?? 300
  const { pathD, color, formattedValue } = useMemo(() => {
    const data = history.length > 1 ? history : [value, value]

    // Dynamic Y range from actual data with padding
    let dataMin = data[0], dataMax = data[0]
    for (const v of data) {
      if (v < dataMin) dataMin = v
      if (v > dataMax) dataMax = v
    }
    // Add 15% padding so the line doesn't touch edges
    const dataRange = dataMax - dataMin || 1
    const pad = dataRange * 0.15
    const min = dataMin - pad
    const max = dataMax + pad
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
      case 'bool': fv = value ? 'TRUE' : 'FALSE'; break
      case 'hex': fv = '0x' + Math.round(value).toString(16).toUpperCase().padStart(2, '0'); break
      case 'enum': fv = param.enumLabels?.[Math.round(value)] ?? Math.round(value).toString(); break
      default: fv = value.toFixed(1)
    }

    return { pathD: d, color: c, formattedValue: fv }
  }, [history, value, param, vw, height])

  return (
    <div
      style={{
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '6px',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="font-mono" style={{ color: '#8899AA', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {param.label}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
          <span className="font-mono" style={{ color, fontSize: '13px', fontWeight: 600 }}>
            {formattedValue}
          </span>
          {param.unit && (
            <span className="font-mono" style={{ color: '#5A6A82', fontSize: '9px' }}>
              {param.unit}
            </span>
          )}
        </div>
      </div>
      <svg viewBox={`0 0 ${vw} ${height}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height }}>
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8} />
      </svg>
    </div>
  )
}
