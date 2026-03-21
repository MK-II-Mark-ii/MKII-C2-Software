import { create } from 'zustand'
import type { ScenarioData } from '../data/scenarioEngine'

export type ViewportMode = 'SPHERES' | 'MAP' | 'TELEMETRY'
export type MissionFlowState = 'IDLE' | 'LAUNCHED' | 'RTH' | 'LANDED'

export interface TargetLocation {
  id: string
  label: string
  lat: number
  lon: number
}

export const TARGET_LOCATIONS: TargetLocation[] = [
  { id: 'karachi_port', label: 'Karachi Port', lat: 24.8359, lon: 66.9832 },
  { id: 'bahawalpur_masjid', label: 'Subhan Allah Masjid, Bahawalpur', lat: 29.373333, lon: 71.618123 },
]

export interface ActionLogEntry {
  id: string
  timestamp: number
  type: string
  title: string
  detail: string
  status: 'AUTO' | 'PENDING' | 'APPROVED'
}

export const ACTION_TYPE_COLORS: Record<string, string> = {
  NAV_SWITCH: '#00E5FF',
  ALERT: '#FFB800',
  SPOOF_DETECT: '#E24B4A',
  FUSION: '#00FF88',
  DEFAULT: '#8899AA',
}

interface UIStore {
  activeScenario: ScenarioData | null
  isPlaying: boolean
  playbackTime: number
  playbackSpeed: number
  simulationTime: number

  viewportMode: ViewportMode
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  leftPanelWidth: number
  rightPanelWidth: number

  hudVisible: boolean
  missionComplete: boolean
  missionFlow: MissionFlowState
  activeTargetId: string       // what dropdown shows
  committedTargetId: string    // what LM actually flies toward
  targetChanged: boolean
  actionLog: ActionLogEntry[]

  toggleHud: () => void
  setMissionComplete: (v: boolean) => void
  setMissionFlow: (s: MissionFlowState) => void
  setActiveTarget: (id: string) => void
  setTargetChanged: (v: boolean) => void
  launchMission: () => void
  terminateMission: () => void
  lockNewTarget: () => void
  setActiveScenario: (scenario: ScenarioData | null) => void
  setPlaying: (playing: boolean) => void
  setPlaybackTime: (time: number) => void
  setPlaybackSpeed: (speed: number) => void
  setSimulationTime: (time: number) => void
  togglePlayback: () => void
  setViewportMode: (mode: ViewportMode) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setLeftPanelWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
  addAction: (entry: ActionLogEntry) => void
  clearActions: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeScenario: null,
  isPlaying: false,
  playbackTime: 0,
  playbackSpeed: 1,
  simulationTime: 0,
  viewportMode: 'SPHERES',
  leftPanelOpen: true,
  rightPanelOpen: false,
  leftPanelWidth: 280,
  rightPanelWidth: 320,
  hudVisible: true,
  missionComplete: false,
  missionFlow: 'IDLE' as MissionFlowState,
  activeTargetId: 'karachi_port',
  committedTargetId: 'karachi_port',
  targetChanged: false,
  actionLog: [],

  toggleHud: () => set((s) => ({ hudVisible: !s.hudVisible })),
  setMissionComplete: (v) => set({ missionComplete: v }),
  setMissionFlow: (s) => set({ missionFlow: s }),
  setActiveTarget: (id) => set((s) => ({
    activeTargetId: id,
    targetChanged: s.missionFlow === 'LAUNCHED' && id !== s.activeTargetId,
  })),
  setTargetChanged: (v) => set({ targetChanged: v }),
  launchMission: () => set((s) => ({ missionFlow: 'LAUNCHED', committedTargetId: s.activeTargetId, targetChanged: false, missionComplete: false })),
  terminateMission: () => set({ missionFlow: 'RTH', targetChanged: false }),
  lockNewTarget: () => set((s) => ({ committedTargetId: s.activeTargetId, targetChanged: false })),
  setActiveScenario: (scenario) => set({ activeScenario: scenario, playbackTime: 0, isPlaying: false }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackTime: (time) => set({ playbackTime: time }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setSimulationTime: (time) => set({ simulationTime: time }),
  togglePlayback: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setViewportMode: (mode) => set({ viewportMode: mode }),
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftPanelWidth: (w) => set({ leftPanelWidth: Math.max(200, Math.min(500, w)) }),
  setRightPanelWidth: (w) => set({ rightPanelWidth: Math.max(200, Math.min(500, w)) }),
  addAction: (entry) => set((s) => ({ actionLog: [entry, ...s.actionLog].slice(0, 50) })),
  clearActions: () => set({ actionLog: [] }),
}))
