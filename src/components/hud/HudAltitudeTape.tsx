import React from 'react'
import { HUD_GREEN, HUD_GREEN_DIM, HUD_BG, HUD_AMBER, HUD_FONT, ALT_PX_PER_M, HUD_SHADOW_FILTER } from './hudConstants'

interface Props {
  altitude: number  // meters MSL
  vs: number        // m/s vertical speed
}

const W = 130
const TAPE_W = 90
const H = 360

export default function HudAltitudeTape({ altitude, vs }: Props) {
  const cy = H / 2
  const visibleRange = cy / ALT_PX_PER_M

  const minAlt = Math.floor(altitude - visibleRange - 100)
  const maxAlt = Math.ceil(altitude + visibleRange + 100)
  const ticks: React.ReactElement[] = []

  for (let m = Math.floor(minAlt / 50) * 50; m <= maxAlt; m += 50) {
    if (m < 0) continue
    const isMajor = m % 100 === 0
    const y = cy - (m - altitude) * ALT_PX_PER_M
    const tickLen = isMajor ? 16 : 8

    ticks.push(
      <g key={m}>
        <line x1={0} y1={y} x2={tickLen} y2={y}
          stroke={HUD_GREEN} strokeWidth={isMajor ? 1.5 : 1} />
        {isMajor && (
          <text x={tickLen + 5} y={y + 4} textAnchor="start"
            fill={HUD_GREEN} fontSize={12} fontWeight={600} fontFamily={HUD_FONT}>
            {m >= 1000 ? `${(m / 1000).toFixed(1)}k` : m}
          </text>
        )}
      </g>
    )
  }

  // VS arrow
  const vsMax = 20
  const maxArrowLen = 80
  const arrowLen = Math.min(Math.abs(vs) / vsMax, 1) * maxArrowLen
  const vsDir = vs >= 0 ? -1 : 1
  const vsColor = vs >= 0 ? HUD_GREEN : HUD_AMBER
  const vsX = W - 18

  return (
    <svg width={W} height={H} style={{ overflow: 'hidden' }}>
      <defs>
        <linearGradient id="alt-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="black" stopOpacity={0.9} />
          <stop offset="12%" stopColor="black" stopOpacity={0} />
          <stop offset="88%" stopColor="black" stopOpacity={0} />
          <stop offset="100%" stopColor="black" stopOpacity={0.9} />
        </linearGradient>
      </defs>

      <g filter={`url(#${HUD_SHADOW_FILTER})`}>
        {/* Vertical reference line */}
        <line x1={0} y1={0} x2={0} y2={H}
          stroke={HUD_GREEN_DIM} strokeWidth={1} />

        {ticks}
      </g>

      {/* Fade overlay */}
      <rect x={0} y={0} width={TAPE_W} height={H} fill="url(#alt-fade)" />

      {/* Current value box */}
      <g filter={`url(#${HUD_SHADOW_FILTER})`}>
        {/* Pointer triangle */}
        <polygon
          points={`0,${cy} 8,${cy - 6} 8,${cy + 6}`}
          fill={HUD_BG} stroke={HUD_GREEN} strokeWidth={1.5}
        />
        <rect x={10} y={cy - 16} width={TAPE_W - 12} height={32} rx={3}
          fill={HUD_BG} stroke={HUD_GREEN} strokeWidth={1.5} />
        <text x={10 + (TAPE_W - 12) / 2} y={cy + 6} textAnchor="middle"
          fill={HUD_GREEN} fontSize={17} fontWeight={700} fontFamily={HUD_FONT}>
          {altitude >= 1000
            ? `${(altitude / 1000).toFixed(1)}k`
            : Math.round(altitude)}
        </text>

        {/* Unit label */}
        <text x={TAPE_W / 2} y={H - 8} textAnchor="middle"
          fill={HUD_GREEN_DIM} fontSize={10} fontWeight={600} fontFamily={HUD_FONT}>
          MSL m
        </text>

        {/* VS indicator */}
        {arrowLen > 3 && (
          <g>
            <line x1={vsX} y1={cy} x2={vsX} y2={cy + arrowLen * vsDir}
              stroke={vsColor} strokeWidth={2.5} />
            <polygon
              points={`${vsX},${cy + (arrowLen + 6) * vsDir} ${vsX - 5},${cy + (arrowLen - 4) * vsDir} ${vsX + 5},${cy + (arrowLen - 4) * vsDir}`}
              fill={vsColor}
            />
            <text x={vsX} y={cy + (arrowLen + 6) * vsDir + (vs >= 0 ? -6 : 14)}
              textAnchor="middle" fill={vsColor}
              fontSize={10} fontWeight={600} fontFamily={HUD_FONT}>
              {vs > 0 ? '+' : ''}{vs.toFixed(1)}
            </text>
          </g>
        )}
      </g>
    </svg>
  )
}
