import { useState, useEffect, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { ACTION_TYPE_COLORS } from '../../stores/uiStore'
import { Zap, AlertTriangle, ArrowRightLeft, Shield, Info, PanelRight } from 'lucide-react'

const TYPE_ICONS: Record<string, typeof Zap> = {
  NAV_SWITCH: ArrowRightLeft,
  ALERT: AlertTriangle,
  SPOOF_DETECT: Shield,
  FUSION: Zap,
  DEFAULT: Info,
}

const TOAST_DURATION = 4000 // ms before toast fades out

export default function ActionNotifications() {
  const actionLog = useUIStore((s) => s.actionLog)
  const toggleRight = useUIStore((s) => s.toggleRightPanel)
  const setTab = useUIStore((s) => s.setRightPanelTab)

  const openActionsPanel = () => {
    setTab('actions')
    if (!useUIStore.getState().rightPanelOpen) {
      toggleRight()
    }
  }
  const [visibleToasts, setVisibleToasts] = useState<string[]>([])
  const prevCountRef = useRef(actionLog.length)

  // When new actions arrive, show them as toasts that auto-dismiss
  useEffect(() => {
    if (actionLog.length > prevCountRef.current) {
      const newIds = actionLog
        .slice(0, actionLog.length - prevCountRef.current)
        .map((a) => a.id)
      setVisibleToasts((prev) => [...newIds, ...prev].slice(0, 3))

      // Auto-dismiss after TOAST_DURATION
      const timer = setTimeout(() => {
        setVisibleToasts((prev) => prev.filter((id) => !newIds.includes(id)))
      }, TOAST_DURATION)

      prevCountRef.current = actionLog.length
      return () => clearTimeout(timer)
    }
    prevCountRef.current = actionLog.length
  }, [actionLog])

  const toastEntries = visibleToasts
    .map((id) => actionLog.find((a) => a.id === id))
    .filter(Boolean)

  return (
    <>
      {/* Expand button — top-right, same position as panel close button */}
      <button
        onClick={openActionsPanel}
        className="flex items-center justify-center gap-1.5 font-mono text-xs tracking-wider uppercase"
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 20,
          padding: '6px 12px',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.1)',
          backgroundColor: 'rgba(10, 14, 26, 0.92)',
          backdropFilter: 'blur(8px)',
          color: '#8899AA',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        <PanelRight size={13} />
        AI ACTIONS{actionLog.length > 0 ? ` (${actionLog.length})` : ''}
      </button>

      {/* Toast notifications — bottom-right, auto-dismiss */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '12px',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          width: '280px',
          pointerEvents: 'auto',
        }}
      >
      {toastEntries.map((entry, i) => {
        if (!entry) return null
        const color = ACTION_TYPE_COLORS[entry.type] ?? ACTION_TYPE_COLORS.DEFAULT
        const Icon = TYPE_ICONS[entry.type] ?? TYPE_ICONS.DEFAULT
        const opacity = 1 - i * 0.25

        return (
          <div
            key={entry.id}
            onClick={openActionsPanel}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              borderLeft: `2px solid ${color}`,
              backgroundColor: 'rgba(10, 14, 26, 0.92)',
              backdropFilter: 'blur(8px)',
              opacity,
              cursor: 'pointer',
              animation: 'notif-slide-in 0.3s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon size={12} style={{ color, flexShrink: 0 }} />
              <span className="font-mono uppercase tracking-wider font-medium" style={{ color, fontSize: '10px' }}>
                {entry.title}
              </span>
              <span className="font-mono" style={{ color: '#5A6A82', fontSize: '9px', marginLeft: 'auto' }}>
                T+{entry.timestamp.toFixed(0)}s
              </span>
            </div>
            {i === 0 && (
              <div className="font-mono" style={{ color: '#8899AA', fontSize: '10px', marginTop: '3px', paddingLeft: '18px' }}>
                {entry.detail}
              </div>
            )}
          </div>
        )
      })}

      <style>{`
        @keyframes notif-slide-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      </div>
    </>
  )
}
