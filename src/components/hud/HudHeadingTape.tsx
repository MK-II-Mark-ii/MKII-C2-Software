import React from 'react'
import { HUD_GREEN, HUD_GREEN_DIM, HUD_BG, HUD_FONT, HDG_PX_PER_DEG, HUD_SHADOW_FILTER } from './hudConstants'

interface Props {
  heading: number
}

const W = 520
const H = 56

const CARDINALS: Record<number, string> = {
  0: 'N', 90: 'E', 180: 'S', 270: 'W',
}

export default function HudHeadingTape({ heading }: Props) {
  const cx = W / 2
  const visibleDegs = cx / HDG_PX_PER_DEG

  const ticks: React.ReactElement[] = []
  const minDeg = Math.floor(heading - visibleDegs - 10)
  const maxDeg = Math.ceil(heading + visibleDegs + 10)

  for (let d = minDeg; d <= maxDeg; d++) {
    if (d % 5 !== 0) continue
    const norm = ((d % 360) + 360) % 360
    const isMajor = norm % 10 === 0
    const x = cx + (d - heading) * HDG_PX_PER_DEG
    const tickLen = isMajor ? 12 : 6
    const cardinal = CARDINALS[norm]

    ticks.push(
      <g key={d}>
        <line x1={x} y1={0} x2={x} y2={tickLen}
          stroke={HUD_GREEN} strokeWidth={isMajor ? 1.5 : 1} />
        {isMajor && !cardinal && (
          <text x={x} y={tickLen + 14} textAnchor="middle"
            fill={HUD_GREEN_DIM} fontSize={11} fontFamily={HUD_FONT}>
            {String(norm).padStart(3, '0')}
          </text>
        )}
        {cardinal && (
          <text x={x} y={tickLen + 14} textAnchor="middle"
            fill={HUD_GREEN} fontSize={13} fontWeight={700} fontFamily={HUD_FONT}>
            {cardinal}
          </text>
        )}
      </g>
    )
  }

  const hdgStr = String(Math.round(((heading % 360) + 360) % 360)).padStart(3, '0')

  return (
    <svg width={W} height={H} style={{ overflow: 'hidden' }}>
      <defs>
        <linearGradient id="hdg-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="black" stopOpacity={0.9} />
          <stop offset="12%" stopColor="black" stopOpacity={0} />
          <stop offset="88%" stopColor="black" stopOpacity={0} />
          <stop offset="100%" stopColor="black" stopOpacity={0.9} />
        </linearGradient>
      </defs>

      <g filter={`url(#${HUD_SHADOW_FILTER})`}>
        {ticks}
      </g>

      {/* Fade edges */}
      <rect x={0} y={0} width={W} height={H} fill="url(#hdg-fade)" />

      <g filter={`url(#${HUD_SHADOW_FILTER})`}>
        {/* Center marker triangle */}
        <polygon points={`${cx - 6},0 ${cx + 6},0 ${cx},9`}
          fill={HUD_GREEN} />

        {/* Heading value box */}
        <rect x={cx - 28} y={H - 24} width={56} height={22} rx={3}
          fill={HUD_BG} stroke={HUD_GREEN} strokeWidth={1.5} />
        <text x={cx} y={H - 9} textAnchor="middle"
          fill={HUD_GREEN} fontSize={14} fontWeight={700} fontFamily={HUD_FONT}>
          {hdgStr}°
        </text>
      </g>
    </svg>
  )
}
