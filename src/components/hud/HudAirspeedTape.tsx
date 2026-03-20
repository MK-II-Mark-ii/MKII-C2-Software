import React from 'react'
import { HUD_GREEN, HUD_GREEN_DIM, HUD_BG, HUD_FONT, IAS_PX_PER_KT, HUD_SHADOW_FILTER } from './hudConstants'

interface Props {
  ias: number
  mach: number
}

const W = 100
const H = 360

export default function HudAirspeedTape({ ias, mach }: Props) {
  const cy = H / 2
  const visibleRange = cy / IAS_PX_PER_KT

  const minKt = Math.floor(ias - visibleRange - 10)
  const maxKt = Math.ceil(ias + visibleRange + 10)
  const ticks: React.ReactElement[] = []

  for (let kt = minKt; kt <= maxKt; kt++) {
    if (kt < 0) continue
    if (kt % 5 !== 0) continue
    const isMajor = kt % 10 === 0
    const y = cy - (kt - ias) * IAS_PX_PER_KT
    const tickLen = isMajor ? 16 : 8

    ticks.push(
      <g key={kt}>
        <line
          x1={W - tickLen} y1={y} x2={W} y2={y}
          stroke={HUD_GREEN} strokeWidth={isMajor ? 1.5 : 1}
        />
        {isMajor && (
          <text
            x={W - tickLen - 5} y={y + 4}
            textAnchor="end" fill={HUD_GREEN}
            fontSize={12} fontWeight={600} fontFamily={HUD_FONT}
          >
            {kt}
          </text>
        )}
      </g>
    )
  }

  return (
    <svg width={W} height={H} style={{ overflow: 'hidden' }}>
      <defs>
        <linearGradient id="ias-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="black" stopOpacity={0.9} />
          <stop offset="12%" stopColor="black" stopOpacity={0} />
          <stop offset="88%" stopColor="black" stopOpacity={0} />
          <stop offset="100%" stopColor="black" stopOpacity={0.9} />
        </linearGradient>
      </defs>

      <g filter={`url(#${HUD_SHADOW_FILTER})`}>
        {/* Vertical reference line */}
        <line x1={W} y1={0} x2={W} y2={H}
          stroke={HUD_GREEN_DIM} strokeWidth={1} />

        {ticks}
      </g>

      {/* Fade overlay */}
      <rect x={0} y={0} width={W} height={H} fill="url(#ias-fade)" />

      {/* Current value box */}
      <g filter={`url(#${HUD_SHADOW_FILTER})`}>
        {/* Pointer triangle */}
        <polygon
          points={`${W},${cy} ${W - 8},${cy - 6} ${W - 8},${cy + 6}`}
          fill={HUD_BG} stroke={HUD_GREEN} strokeWidth={1.5}
        />
        <rect x={2} y={cy - 16} width={W - 12} height={32} rx={3}
          fill={HUD_BG} stroke={HUD_GREEN} strokeWidth={1.5} />
        <text x={(W - 10) / 2} y={cy + 6} textAnchor="middle"
          fill={HUD_GREEN} fontSize={18} fontWeight={700} fontFamily={HUD_FONT}>
          {Math.round(ias)}
        </text>

        {/* Mach below */}
        <text x={(W - 10) / 2} y={cy + 32} textAnchor="middle"
          fill={HUD_GREEN_DIM} fontSize={11} fontFamily={HUD_FONT}>
          M{mach.toFixed(2)}
        </text>

        {/* Unit label */}
        <text x={(W - 10) / 2} y={H - 8} textAnchor="middle"
          fill={HUD_GREEN_DIM} fontSize={10} fontWeight={600} fontFamily={HUD_FONT}>
          KTS
        </text>
      </g>
    </svg>
  )
}
