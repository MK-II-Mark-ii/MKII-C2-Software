import { useEffect, useRef } from 'react'
import { useNavigationStore } from '../stores/navigationStore'
import { useFaultStore } from '../stores/faultStore'
import { useUIStore, TARGET_LOCATIONS } from '../stores/uiStore'
import type { ParameterState } from '../stores/navigationStore'
import type { ActionLogEntry } from '../stores/uiStore'
import { deriveTechniqueStates, deriveFusionState } from '../data/parameterMap'
import { computeAllThreatUpdates } from '../simulation/faultInjectionEngine'
import { computeResponseUpdates } from '../simulation/aiResponseModel'
import { deriveEnvironmentUpdates, deriveMissionUpdates } from '../simulation/environmentModel'
import { generateTelemetryFrame } from '../simulation/telemetryGenerator'
import { useTelemetryStore } from '../stores/telemetryStore'

// ── State-transition action triggers ──

interface TransitionState {
  gnssJamming: boolean
  gnssDenied: boolean
  spoofDetected: boolean
  multiSourceActive: boolean
}

function detectTransitionState(
  params: Record<string, ParameterState>,
  fusionActiveCount: number,
): TransitionState {
  const jamPower = params['ew_jam_power']?.confidence ?? 1
  const spoofConf = params['ew_spoof_conf']?.confidence ?? 1
  const gnssConf = params['gnss_l1_snr']?.confidence ?? 1

  return {
    gnssJamming: jamPower < 0.5,
    gnssDenied: gnssConf < 0.35,
    spoofDetected: spoofConf < 0.5,
    multiSourceActive: fusionActiveCount >= 3,
  }
}

export function useSimulation() {
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const simTimeRef = useRef<number>(0)
  const prevStateRef = useRef<TransitionState>({
    gnssJamming: false,
    gnssDenied: false,
    spoofDetected: false,
    multiSourceActive: false,
  })
  const startedRef = useRef(false)
  const lastTelemetryRef = useRef<number>(0)
  const prevTelemetryValues = useRef<Record<string, number> | null>(null)

  useEffect(() => {
    const tick = (timestamp: number) => {
      const baseDt = lastTimeRef.current ? Math.min((timestamp - lastTimeRef.current) / 1000, 0.1) : 0
      lastTimeRef.current = timestamp
      const simSpeed = useUIStore.getState().playbackSpeed
      const dt = baseDt * simSpeed
      simTimeRef.current += dt

      const simTime = simTimeRef.current
      useUIStore.getState().setSimulationTime(simTime)
      const faults = useFaultStore.getState()
      const navStore = useNavigationStore.getState()

      // 1. Compute threat parameter targets and apply exponential approach
      const threatUpdates = computeAllThreatUpdates(navStore.parameters, faults, simTime, dt)
      const batchUpdates: Record<string, Partial<ParameterState>> = {}
      for (const [id, confidence] of Object.entries(threatUpdates)) {
        batchUpdates[id] = { confidence }
      }
      navStore.batchUpdate(batchUpdates)

      // 2. Derive technique and fusion state from updated params
      const updatedParams = useNavigationStore.getState().parameters
      const techniqueStates = deriveTechniqueStates(updatedParams)
      const fusionState = deriveFusionState(techniqueStates)
      navStore.setAllTechniques(techniqueStates)
      navStore.setFusion(fusionState)

      // 3. Compute AI response parameters
      const responseUpdates = computeResponseUpdates(
        updatedParams, faults, techniqueStates, fusionState, dt,
      )
      const responseBatch: Record<string, Partial<ParameterState>> = {}
      for (const [id, confidence] of Object.entries(responseUpdates)) {
        responseBatch[id] = { confidence }
      }
      navStore.batchUpdate(responseBatch)

      // 4. Update environment state
      const telValues = prevTelemetryValues.current
      const envUpdates = deriveEnvironmentUpdates(navStore.environment, faults, dt, telValues)
      navStore.setEnvironment(envUpdates)

      // 5. Update mission state
      const gnssConfidence = techniqueStates.GNSS.confidence_score
      const missionUpdates = deriveMissionUpdates(
        navStore.mission, faults, dt, gnssConfidence,
        fusionState.composite_confidence, fusionState.active_technique_count,
        simTime, telValues,
      )
      navStore.setMission(missionUpdates)

      // 6. Fire state-transition actions
      const currentState = detectTransitionState(
        useNavigationStore.getState().parameters,
        fusionState.active_technique_count,
      )
      const prev = prevStateRef.current
      const { addAction } = useUIStore.getState()

      if (currentState.gnssJamming && !prev.gnssJamming) {
        addAction(makeAction('ALERT', 'GNSS DEGRADATION', 'L1/L5 SNR below threshold — jamming suspected', simTime))
      }
      if (currentState.gnssDenied && !prev.gnssDenied) {
        addAction(makeAction('NAV_SWITCH', 'NAV SOURCE SWITCH', 'GNSS → TERCOM/TAN — confidence below threshold', simTime))
      }
      if (currentState.spoofDetected && !prev.spoofDetected) {
        addAction(makeAction('SPOOF_DETECT', 'SPOOFING DETECTED', 'Inertial cross-check FAIL — GNSS integrity compromised', simTime))
      }
      if (currentState.multiSourceActive && !prev.multiSourceActive && (faults.jamming || faults.spoofing)) {
        addAction(makeAction('FUSION', 'MULTI-SOURCE FUSION', 'TERCOM + MagNav + Scene Match — GPS-denied fusion active', simTime))
      }
      if (!currentState.gnssDenied && prev.gnssDenied && !faults.jamming && !faults.spoofing) {
        addAction(makeAction('FUSION', 'GNSS RECOVERED', 'GNSS signal restored — resuming multi-constellation fix', simTime))
      }

      prevStateRef.current = currentState

      // 7. Generate telemetry data (throttled to ~4Hz to avoid store churn)
      if (simTime - lastTelemetryRef.current >= 0.25) {
        lastTelemetryRef.current = simTime
        const uiState = useUIStore.getState()
        const activeTarget = TARGET_LOCATIONS.find(t => t.id === uiState.committedTargetId)
        const telemetryValues = generateTelemetryFrame(
          simTime, prevTelemetryValues.current, dt, faults, techniqueStates, fusionState,
          uiState.missionFlow, activeTarget?.lat, activeTarget?.lon, uiState.engagementConfig,
        )
        // Save ref to previous frame before overwriting
        const prevTelFrame = prevTelemetryValues.current
        prevTelemetryValues.current = telemetryValues
        useTelemetryStore.getState().updateValues(telemetryValues)

        // 8. State transitions
        const currentFlow = useUIStore.getState().missionFlow

        // Auto-enter loiter when within 5km of target during LAUNCHED
        // Auto-enter loiter when within 5km of target
        if (currentFlow === 'LAUNCHED' && telemetryValues.wpt_dist < 5000 && simTime > 45) {
          useUIStore.getState().setMissionFlow('LOITERING')
          useUIStore.getState().setEngagementDialogOpen(true)
          addAction(makeAction('ALERT', 'LOITER ENTERED', 'Target area reached — orbiting at 2.5km radius. Configure engagement.', simTime))
        }

        // LOITERING + engageRequested → orbit to correct angular position, then ENGAGING
        if (currentFlow === 'LOITERING' && uiState.engageRequested) {
          const attackBrg = uiState.engagementConfig.attackBearing
          const ipAngle = attackBrg
          const dirLabels: Record<number, string> = { 0:'N', 45:'NE', 90:'E', 135:'SE', 180:'S', 225:'SW', 270:'W', 315:'NW' }
          const dirLabel = dirLabels[attackBrg] ?? `${attackBrg}°`

          const tgtLat = activeTarget?.lat ?? 24.8359
          const tgtLon = activeTarget?.lon ?? 66.9832
          const lmLat = telemetryValues.lat ?? 0
          const lmLon = telemetryValues.lon ?? 0
          const dLatT = lmLat - tgtLat
          const dLonT = (lmLon - tgtLon) * Math.cos(tgtLat * Math.PI / 180)
          const currentAngleDeg = ((Math.atan2(dLonT, dLatT) * 180 / Math.PI) + 360) % 360

          let angError = ipAngle - currentAngleDeg
          if (angError > 180) angError -= 360
          if (angError < -180) angError += 360

          // Only notify once when engage is first requested
          if (!prevTelFrame?._engageNotified) {
            telemetryValues._engageNotified = 1
            const errorDeg = Math.round(Math.abs(angError))
            addAction(makeAction('NAV_SWITCH', 'POSITIONING',
              `Orbiting to ${dirLabel} approach angle — ${errorDeg}° remaining`, simTime))
          } else {
            telemetryValues._engageNotified = 1
          }

          if (Math.abs(angError) < 15) {
            useUIStore.getState().setMissionFlow('ENGAGING')
            useUIStore.getState().setEngageRequested(false)
            const inboundHdg = (attackBrg + 180) % 360
            addAction(makeAction('ALERT', 'INBOUND',
              `Breaking orbit — attack from ${dirLabel}, inbound heading ${inboundHdg}°`, simTime))
          }
        }

        // ENGAGING → TERMINAL when at dive start point
        if (currentFlow === 'ENGAGING' && telemetryValues._readyForTerminal === 1) {
          const cfg = uiState.engagementConfig
          useUIStore.getState().setMissionFlow('TERMINAL')
          addAction(makeAction('ALERT', 'TERMINAL DIVE',
            `Dive initiated — angle ${cfg.diveAngle}°, target speed ${cfg.terminalSpeed}kt, from ${cfg.engageAltitude}m`, simTime))
        }

        // TERMINAL: disable abort below 100m AGL (one-time notification)
        if (currentFlow === 'TERMINAL') {
          const prevAltFlag = prevTelFrame?._termAltFlag ?? 0
          if (telemetryValues.alt_agl < 100 && prevAltFlag < 1) {
            telemetryValues._termAltFlag = 1
            useUIStore.getState().setAbortAvailable(false)
            addAction(makeAction('SPOOF_DETECT', 'COMMITTED', 'Point of no return — abort disabled', simTime))
          } else {
            telemetryValues._termAltFlag = prevAltFlag
          }
        }

        // Contact
        if (Math.round(telemetryValues.flt_phase) === 7 && (currentFlow === 'TERMINAL' || currentFlow === 'LAUNCHED') && !useUIStore.getState().missionComplete) {
          useUIStore.getState().setMissionComplete(true)
        }

        // RTH landed
        if (telemetryValues._landed === 1 && currentFlow === 'RTH') {
          useUIStore.getState().setMissionFlow('LANDED')
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    startedRef.current = true
    return () => cancelAnimationFrame(rafRef.current)
  }, [])
}

function makeAction(type: string, title: string, detail: string, simTime: number): ActionLogEntry {
  return {
    id: `${type}_${Date.now()}`,
    timestamp: simTime,
    type,
    title,
    detail,
    status: 'AUTO',
  }
}
