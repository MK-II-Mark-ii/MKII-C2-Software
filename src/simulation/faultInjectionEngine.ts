import { getNominalTarget } from './nominalBaseline'

// ── Fault sensitivity classification ──

const JAM_AFFECTED = new Set([
  'gnss_l1_snr', 'gnss_l5_snr', 'gnss_navic_l5', 'gnss_navic_s', 'gnss_glonass',
  'gnss_pdop', 'gnss_raim',
  'ew_jam_power', 'ew_rf_scan',
  'rf_homing_snr', 'rf_homing_lock', 'rf_homing_bearing',
  'comms_satcom',
])

const SPOOF_AFFECTED = new Set([
  'gnss_l1_snr', 'gnss_l5_snr', 'gnss_navic_l5', 'gnss_navic_s', 'gnss_glonass',
  'gnss_pdop', 'gnss_raim',
  'gnss_spoof_delta',
  'ew_spoof_conf',
])

// ── Fault target values ──

const JAM_TARGETS: Record<string, number> = {
  gnss_l1_snr: 0.05, gnss_l5_snr: 0.06, gnss_navic_l5: 0.04, gnss_navic_s: 0.03,
  gnss_glonass: 0.08, gnss_pdop: 0.02, gnss_raim: 0.04,
  ew_jam_power: 0.08, ew_rf_scan: 0.12,
  rf_homing_snr: 0.12, rf_homing_lock: 0.10, rf_homing_bearing: 0.15,
  comms_satcom: 0.30,
}

const SPOOF_TARGETS: Record<string, number> = {
  gnss_l1_snr: 0.08, gnss_l5_snr: 0.07, gnss_navic_l5: 0.06, gnss_navic_s: 0.05,
  gnss_glonass: 0.10, gnss_pdop: 0.03, gnss_raim: 0.05,
  gnss_spoof_delta: 1.35,  // exceeds 1.1 threshold → triggers spoof flag
  ew_spoof_conf: 0.05,
}

// ── Time constants (τ in seconds) ──

interface TauConfig {
  onset: number   // fault active → approach target
  recovery: number // fault cleared → approach nominal
}

const TAU_GNSS: TauConfig = { onset: 1.5, recovery: 3.0 }
const TAU_RF: TauConfig = { onset: 2.5, recovery: 4.0 }
const TAU_EW_COMMS: TauConfig = { onset: 3.0, recovery: 5.0 }

function getTau(paramId: string): TauConfig {
  if (paramId.startsWith('gnss_')) return TAU_GNSS
  if (paramId.startsWith('rf_homing_')) return TAU_RF
  return TAU_EW_COMMS
}

// ── Core computation ──

export interface FaultState {
  jamming: boolean
  spoofing: boolean
  jammingStartedAt?: number | null
  spoofingStartedAt?: number | null
}

/**
 * Compute the target confidence for a given parameter under current fault conditions.
 * Non-RF parameters always return their nominal+jitter value regardless of faults.
 */
export function computeTarget(
  paramId: string,
  faults: FaultState,
  simTime: number,
): number {
  const nominal = getNominalTarget(paramId, simTime)

  const isJamAffected = JAM_AFFECTED.has(paramId)
  const isSpoofAffected = SPOOF_AFFECTED.has(paramId)

  if (!isJamAffected && !isSpoofAffected) {
    return nominal // Non-RF params stay nominal
  }

  let target = nominal

  if (faults.jamming && isJamAffected) {
    const jamTarget = JAM_TARGETS[paramId]
    if (jamTarget !== undefined) {
      target = Math.min(target, jamTarget)
    }
  }

  if (faults.spoofing && isSpoofAffected) {
    const spoofTarget = SPOOF_TARGETS[paramId]
    if (spoofTarget !== undefined) {
      // gnss_spoof_delta goes UP (above 1.0), so use max for it
      if (paramId === 'gnss_spoof_delta') {
        target = Math.max(target, spoofTarget)
      } else {
        target = Math.min(target, spoofTarget)
      }
    }
  }

  return target
}

/**
 * Exponential approach: smoothly transitions current value toward target.
 * Returns new value after dt seconds.
 */
export function exponentialApproach(
  current: number,
  target: number,
  dt: number,
  tau: number,
): number {
  if (tau <= 0) return target
  const alpha = 1 - Math.exp(-dt / tau)
  return current + (target - current) * alpha
}

/**
 * Get the appropriate time constant for a parameter given current direction.
 */
export function getParamTau(paramId: string, current: number, target: number): number {
  const tauConfig = getTau(paramId)
  // gnss_spoof_delta rises during spoofing (onset when target > current)
  if (paramId === 'gnss_spoof_delta') {
    return target > current ? tauConfig.onset : tauConfig.recovery
  }
  // Everything else drops during fault onset
  return target < current ? tauConfig.onset : tauConfig.recovery
}

/**
 * Compute all threat parameter targets and apply exponential approach.
 * Returns a map of paramId → new confidence value.
 */
export function computeAllThreatUpdates(
  currentParams: Record<string, { confidence: number }>,
  faults: FaultState,
  simTime: number,
  dt: number,
): Record<string, number> {
  const updates: Record<string, number> = {}

  for (const [paramId, state] of Object.entries(currentParams)) {
    // Skip response params — handled by aiResponseModel
    if (paramId.startsWith('resp_')) continue

    const target = computeTarget(paramId, faults, simTime)
    const tau = getParamTau(paramId, state.confidence, target)
    updates[paramId] = exponentialApproach(state.confidence, target, dt, tau)
  }

  return updates
}
