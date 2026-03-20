import React from 'react'
import { HUD_GREEN, HUD_GREEN_DIM, HUD_FONT, PITCH_PX_PER_DEG, HUD_SHADOW_FILTER } from './hudConstants'

interface Props {
  pitch: number  // degrees, positive = nose up
  roll: number   // degrees, positive = right wing down
}

const SIZE = 400

export default function HudPitchLadder({ pitch, roll }: Props) {
  const cx = SIZE / 2
  const cy = SIZE / 2
  const pitchOffset = pitch * PITCH_PX_PER_DEG

  // Generate pitch lines from -30 to +30
  const lines: React.ReactElement[] = []
  for (let deg = -30; deg <= 30; deg += 5) {
    if (deg === 0) continue
    const isMajor = deg % 10 === 0
    const halfW = isMajor ? 55 : 28
    const gap = 15
    const y = -deg * PITCH_PX_PER_DEG
    const stubLen = deg < 0 ? 8 : 0

    lines.push(
      <g key={deg}>
        {/* Left segment */}
        <line x1={-halfW} y1={y} x2={-gap} y2={y}
          stroke={HUD_GREEN} strokeWidth={isMajor ? 1.5 : 1} />
        {/* Right segment */}
        <line x1={gap} y1={y} x2={halfW} y2={y}
          stroke={HUD_GREEN} strokeWidth={isMajor ? 1.5 : 1} />
        {/* Negative pitch end stubs (downward) */}
        {stubLen > 0 && (
          <>
            <line x1={-halfW} y1={y} x2={-halfW} y2={y + stubLen}
              stroke={HUD_GREEN} strokeWidth={1.5} />
            <line x1={halfW} y1={y} x2={halfW} y2={y + stubLen}
              stroke={HUD_GREEN} strokeWidth={1.5} />
          </>
        )}
        {/* Positive pitch end stubs (upward) */}
        {deg > 0 && (
          <>
            <line x1={-halfW} y1={y} x2={-halfW} y2={y + 5}
              stroke={HUD_GREEN} strokeWidth={1.5} />
            <line x1={halfW} y1={y} x2={halfW} y2={y + 5}
              stroke={HUD_GREEN} strokeWidth={1.5} />
          </>
        )}
        {/* Degree labels */}
        {isMajor && (
          <>
            <text x={-halfW - 8} y={y + 4} textAnchor="end"
              fill={HUD_GREEN} fontSize={11} fontWeight={600} fontFamily={HUD_FONT}>
              {deg}
            </text>
            <text x={halfW + 8} y={y + 4} textAnchor="start"
              fill={HUD_GREEN} fontSize={11} fontWeight={600} fontFamily={HUD_FONT}>
              {deg}
            </text>
          </>
        )}
      </g>
    )
  }

  // Roll indicator ticks
  const rollTicks = [10, 20, 30, 45, 60, -10, -20, -30, -45, -60]
  const rollR = 160

  return (
    <svg width={SIZE} height={SIZE} style={{ overflow: 'hidden' }}>
      <defs>
        <clipPath id="pitch-clip">
          <rect x={0} y={0} width={SIZE} height={SIZE} rx={8} />
        </clipPath>
      </defs>

      <g clipPath="url(#pitch-clip)" filter={`url(#${HUD_SHADOW_FILTER})`}>
        {/* Roll arc and ticks (fixed, not rotated) */}
        <g transform={`translate(${cx}, ${cy})`}>
          <path
            d={describeArc(0, 0, rollR, -60, 60)}
            fill="none" stroke={HUD_GREEN_DIM} strokeWidth={1.5}
          />
          {rollTicks.map((deg) => {
            const rad = (deg - 90) * Math.PI / 180
            const x1 = Math.cos(rad) * rollR
            const y1 = Math.sin(rad) * rollR
            const isBig = [30, 45, 60, -30, -45, -60].includes(deg)
            const len = isBig ? 14 : 8
            const x2 = Math.cos(rad) * (rollR + len)
            const y2 = Math.sin(rad) * (rollR + len)
            return (
              <line key={`roll-${deg}`}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={HUD_GREEN} strokeWidth={isBig ? 1.5 : 1} />
            )
          })}
          {/* Zero roll tick (top center) — wider */}
          <line x1={0} y1={-rollR} x2={0} y2={-rollR - 14}
            stroke={HUD_GREEN} strokeWidth={2} />

          {/* Roll pointer (rotates with roll) */}
          <g transform={`rotate(${roll})`}>
            <polygon
              points={`0,${-rollR + 3} -7,${-rollR - 10} 7,${-rollR - 10}`}
              fill={HUD_GREEN} />
          </g>
        </g>

        {/* Pitch ladder group — translates with pitch, rotates with roll */}
        <g transform={`translate(${cx}, ${cy}) rotate(${-roll})`}>
          <g transform={`translate(0, ${pitchOffset})`}>
            {/* Horizon line — wider, brighter */}
            <line x1={-180} y1={0} x2={180} y2={0}
              stroke={HUD_GREEN} strokeWidth={2} opacity={0.9} />
            {lines}
          </g>
        </g>

        {/* Fixed aircraft symbol (always centered) */}
        <g transform={`translate(${cx}, ${cy})`}>
          <line x1={-45} y1={0} x2={-14} y2={0}
            stroke={HUD_GREEN} strokeWidth={2.5} />
          <line x1={14} y1={0} x2={45} y2={0}
            stroke={HUD_GREEN} strokeWidth={2.5} />
          <line x1={-45} y1={0} x2={-45} y2={7}
            stroke={HUD_GREEN} strokeWidth={2.5} />
          <line x1={45} y1={0} x2={45} y2={7}
            stroke={HUD_GREEN} strokeWidth={2.5} />
          {/* Center dot */}
          <circle r={3} fill="none" stroke={HUD_GREEN} strokeWidth={2} />
        </g>
      </g>
    </svg>
  )
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCart(cx, cy, r, endAngle - 90)
  const end = polarToCart(cx, cy, r, startAngle - 90)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = angleDeg * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
