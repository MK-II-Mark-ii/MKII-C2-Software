import { useEffect, useRef } from 'react'
import { useNavigationStore } from '../stores/navigationStore'
import { useFaultStore } from '../stores/faultStore'
import { useUIStore } from '../stores/uiStore'
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
        const telemetryValues = generateTelemetryFrame(simTime, prevTelemetryValues.current, dt)
        prevTelemetryValues.current = telemetryValues
        useTelemetryStore.getState().updateValues(telemetryValues)
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
