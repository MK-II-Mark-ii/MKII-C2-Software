import { useUIStore } from '../../stores/uiStore'
import AIActionFeed from '../actions/AIActionFeed'
import { PanelRightClose } from 'lucide-react'

export default function RightPanel() {
  const open = useUIStore((s) => s.rightPanelOpen)
  const width = useUIStore((s) => s.rightPanelWidth)
  const toggleRight = useUIStore((s) => s.toggleRightPanel)

  if (!open) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        width: `${width}px`,
        backgroundColor: '#0A0E1A',
        borderRadius: '10px',
      }}
    >
      <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="font-mono text-xs tracking-[0.15em] uppercase font-medium" style={{ color: '#8899AA' }}>
          AI ACTIONS
        </div>
        <button
          onClick={toggleRight}
          title="Collapse panel (])"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px', borderRadius: '4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <PanelRightClose size={14} color="#5A6A82" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        <AIActionFeed />
      </div>
    </div>
  )
}
