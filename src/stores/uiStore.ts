import { create } from 'zustand'
import type { ScenarioData } from '../data/scenarioEngine'

export type ViewportMode = 'SPHERES' | 'MAP' | 'TELEMETRY'
export type MissionFlowState = 'IDLE' | 'LAUNCHED' | 'LOITERING' | 'ENGAGING' | 'TERMINAL' | 'RTH' | 'LANDED'
export type RightPanelTab = 'actions' | 'engagement'

export interface TargetLocation {
  id: string
  label: string
  lat: number
  lon: number
}

export const TARGET_LOCATIONS: TargetLocation[] = [
  { id: 'karachi_port', label: 'Karachi Port, Pakistan', lat: 24.8359, lon: 66.9832 },
  { id: 'bahawalpur_masjid', label: 'Bahawalpur, Pakistan', lat: 29.373333, lon: 71.618123 },
]

export interface EngagementConfig {
  attackBearing: number    // degrees — direction to approach from (0=N, 90=E, etc.)
  diveAngle: number        // degrees — engagement dive angle (30-70)
  engageAltitude: number   // meters — start dive from this altitude
  terminalSpeed: number    // knots — target speed at impact
}

export const DEFAULT_ENGAGEMENT: EngagementConfig = {
  attackBearing: 0,
  diveAngle: 45,
  engageAltitude: 1500,
  terminalSpeed: 150,
}

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
  rightPanelTab: RightPanelTab
  leftPanelWidth: number
  rightPanelWidth: number

  hudVisible: boolean
  missionComplete: boolean
  missionFlow: MissionFlowState
  activeTargetId: string
  committedTargetId: string
  targetChanged: boolean
  engagementConfig: EngagementConfig
  engageRequested: boolean
  engagementDialogOpen: boolean
  abortAvailable: boolean
  actionLog: ActionLogEntry[]

  toggleHud: () => void
  setMissionComplete: (v: boolean) => void
  setMissionFlow: (s: MissionFlowState) => void
  setActiveTarget: (id: string) => void
  setTargetChanged: (v: boolean) => void
  launchMission: () => void
  terminateMission: () => void
  lockNewTarget: () => void
  setRightPanelTab: (tab: RightPanelTab) => void
  setEngagementConfig: (cfg: Partial<EngagementConfig>) => void
  setEngagementDialogOpen: (v: boolean) => void
  engageTarget: () => void
  setEngageRequested: (v: boolean) => void
  abortAttack: () => void
  setAbortAvailable: (v: boolean) => void
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
  rightPanelTab: 'actions' as RightPanelTab,
  leftPanelWidth: 280,
  rightPanelWidth: 340,
  hudVisible: true,
  missionComplete: false,
  missionFlow: 'IDLE' as MissionFlowState,
  activeTargetId: 'karachi_port',
  committedTargetId: 'karachi_port',
  targetChanged: false,
  engagementConfig: { ...DEFAULT_ENGAGEMENT },
  engageRequested: false,
  engagementDialogOpen: false,
  abortAvailable: false,
  actionLog: [],

  toggleHud: () => set((s) => ({ hudVisible: !s.hudVisible })),
  setMissionComplete: (v) => set({ missionComplete: v }),
  setMissionFlow: (s) => set({ missionFlow: s }),
  setActiveTarget: (id) => set((s) => ({
    activeTargetId: id,
    targetChanged: s.missionFlow === 'LAUNCHED' && id !== s.committedTargetId,
  })),
  setTargetChanged: (v) => set({ targetChanged: v }),
  launchMission: () => set((s) => ({ missionFlow: 'LAUNCHED', committedTargetId: s.activeTargetId, targetChanged: false, missionComplete: false })),
  terminateMission: () => set({ missionFlow: 'RTH', targetChanged: false, abortAvailable: false }),
  lockNewTarget: () => set((s) => ({ committedTargetId: s.activeTargetId, targetChanged: false })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setEngagementConfig: (cfg) => set((s) => ({ engagementConfig: { ...s.engagementConfig, ...cfg } })),
  setEngagementDialogOpen: (v) => set({ engagementDialogOpen: v }),
  engageTarget: () => set({ engageRequested: true, abortAvailable: true, engagementDialogOpen: false }),
  setEngageRequested: (v) => set({ engageRequested: v }),
  abortAttack: () => set({ missionFlow: 'LOITERING', engageRequested: false, abortAvailable: false }),
  setAbortAvailable: (v) => set({ abortAvailable: v }),
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
