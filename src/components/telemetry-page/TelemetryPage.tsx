import { useState } from 'react'
import { useTelemetryStore } from '../../stores/telemetryStore'
import { TELEMETRY_PARAMS, TELEMETRY_CATEGORIES, TELEMETRY_PARAM_MAP } from '../../types/telemetry'
import type { TelemetryCategory } from '../../types/telemetry'
import TelemetrySparkline from './TelemetrySparkline'
import type { YScaleMode } from './TelemetrySparkline'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'

const X_WINDOWS = [
  { label: 'ALL', value: 0 },
  { label: '60s', value: 60 },
  { label: '30s', value: 30 },
  { label: '10s', value: 10 },
]

export default function TelemetryPage() {
  const values = useTelemetryStore((s) => s.values)
  const history = useTelemetryStore((s) => s.history)
  const [activeCategory, setActiveCategory] = useState<TelemetryCategory>('FLIGHT')
  const [yScale, setYScale] = useState<YScaleMode>('auto')
  const [xWindow, setXWindow] = useState(0)
  const tabsRef = useRef<HTMLDivElement>(null)

  const categoryParams = TELEMETRY_PARAMS.filter((p) => p.category === activeCategory)

  const scrollTabs = (dir: number) => {
    tabsRef.current?.scrollBy({ left: dir * 120, behavior: 'smooth' })
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#060A12',
      overflow: 'hidden',
    }}>
      {/* Spacer for viewport tab island */}
      <div style={{ height: '44px', flexShrink: 0 }} />

      {/* Top status strip */}
      <StatusStrip values={values} />

      {/* Category tabs with scroll arrows */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => scrollTabs(-1)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px',
            color: '#5A6A82', flexShrink: 0,
          }}
        >
          <ChevronLeft size={14} />
        </button>
        <div
          ref={tabsRef}
          className="hide-scrollbar"
          style={{
            display: 'flex',
            gap: '2px',
            padding: '6px 0',
            overflowX: 'auto',
            flex: 1,
          }}
        >
          {TELEMETRY_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as TelemetryCategory)}
              className="font-mono uppercase tracking-wider whitespace-nowrap"
              style={{
                padding: '5px 10px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 600,
                backgroundColor: activeCategory === cat.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: activeCategory === cat.id ? cat.color : '#5A6A82',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => scrollTabs(1)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px',
            color: '#5A6A82', flexShrink: 0,
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Graph controls: Y scale + X window */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '6px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        flexShrink: 0,
      }}>
        {/* Y-axis scale toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="font-mono" style={{ fontSize: '8px', color: '#5A6A82', letterSpacing: '0.08em' }}>Y-AXIS</span>
          <div style={{ display: 'flex', gap: '2px', padding: '2px 3px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {(['auto', 'full'] as YScaleMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setYScale(mode)}
                className="font-mono"
                style={{
                  padding: '2px 8px', borderRadius: '3px', border: 'none', cursor: 'pointer',
                  fontSize: '9px', fontWeight: 600, textTransform: 'uppercase',
                  backgroundColor: yScale === mode ? 'rgba(0,229,255,0.12)' : 'transparent',
                  color: yScale === mode ? '#00E5FF' : '#5A6A82',
                  transition: 'all 0.15s',
                }}
              >
                {mode === 'auto' ? 'AUTO' : 'FULL'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: '1px', height: '16px', backgroundColor: 'rgba(255,255,255,0.06)' }} />

        {/* X-axis time window */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="font-mono" style={{ fontSize: '8px', color: '#5A6A82', letterSpacing: '0.08em' }}>X-WINDOW</span>
          <div style={{ display: 'flex', gap: '2px', padding: '2px 3px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {X_WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => setXWindow(w.value)}
                className="font-mono"
                style={{
                  padding: '2px 8px', borderRadius: '3px', border: 'none', cursor: 'pointer',
                  fontSize: '9px', fontWeight: 600,
                  backgroundColor: xWindow === w.value ? 'rgba(0,229,255,0.12)' : 'transparent',
                  color: xWindow === w.value ? '#00E5FF' : '#5A6A82',
                  transition: 'all 0.15s',
                }}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Graph grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', minHeight: 0 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
        }}>
          {categoryParams.map((p) => (
            <TelemetrySparkline
              key={p.id}
              param={p}
              value={values[p.id] ?? p.nominalCruise}
              history={history[p.id] ?? []}
              height={90}
              yScale={yScale}
              xWindow={xWindow}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function StatusStrip({ values }: { values: Record<string, number> }) {
  const items = [
    { label: 'IAS', value: `${Math.round(values.ias ?? 95)} kt`, param: 'ias' },
    { label: 'ALT', value: `${Math.round(values.alt_msl ?? 2000)} m`, param: 'alt_msl' },
    { label: 'HDG', value: `${Math.round(values.psi ?? 270)}°`, param: 'psi' },
    { label: 'GS', value: `${Math.round(values.gs ?? 98)} kt`, param: 'gs' },
    { label: 'FUEL', value: `${(values.fuel_rem ?? 14).toFixed(1)} kg`, param: 'fuel_rem' },
    { label: 'FUEL%', value: `${Math.round(values.fuel_pct ?? 78)}%`, param: 'fuel_pct' },
    { label: 'RPM', value: `${Math.round(values.eng_rpm ?? 6200)}`, param: 'eng_rpm' },
    { label: 'EGT', value: `${Math.round(values.egt ?? 580)}°C`, param: 'egt' },
    { label: 'VBUS', value: `${(values.vbus ?? 25.2).toFixed(1)}V`, param: 'vbus' },
    { label: 'BAT', value: `${Math.round(values.bat_soc ?? 92)}%`, param: 'bat_soc' },
    { label: 'LINK', value: `${Math.round(values.link_qual ?? 92)}%`, param: 'link_qual' },
    { label: 'PHASE', value: TELEMETRY_PARAM_MAP.flt_phase?.enumLabels?.[Math.round(values.flt_phase ?? 3)] ?? 'CRUISE', param: 'flt_phase' },
  ]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      padding: '6px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      backgroundColor: 'rgba(10, 14, 26, 0.8)',
      flexShrink: 0,
      overflowX: 'auto',
    }}>
      {items.map((item) => {
        const p = TELEMETRY_PARAM_MAP[item.param]
        const v = values[item.param] ?? p?.nominalCruise ?? 0
        let color = '#B0BFCC'
        if (p) {
          if ((p.criticalHigh !== undefined && v >= p.criticalHigh) ||
              (p.criticalLow !== undefined && v <= p.criticalLow)) {
            color = '#E24B4A'
          } else if ((p.warningHigh !== undefined && v >= p.warningHigh) ||
                     (p.warningLow !== undefined && v <= p.warningLow)) {
            color = '#FFB800'
          }
        }

        return (
          <div key={item.label} className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono" style={{ fontSize: '9px', color: '#5A6A82', letterSpacing: '0.08em' }}>
              {item.label}
            </span>
            <span className="font-mono font-semibold" style={{ fontSize: '11px', color }}>
              {item.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}
