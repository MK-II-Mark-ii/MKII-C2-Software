import { THREAT_SPHERE_PARAMETERS, RESPONSE_SPHERE_PARAMETERS } from '../data/navParameters'
import type { ParameterGroup } from '../types/sphere'
import type { ParameterState } from '../stores/navigationStore'

// Map ParameterGroup → axis index (matching ALGORITHM_AXES order)
// Axes: 0=INS, 1=GNSS, 2=TERCOM, 3=MAGNAV, 4=SCENE_MATCH
const GROUP_TO_AXIS: Record<ParameterGroup, number> = {
  INS_IMU: 0,
  GNSS: 1,
  TERCOM: 2,
  MAGNAV: 3,
  SCENE_MATCH: 4,
  EW_DETECT: 1,
  PLATFORM: 0,
  COMMS: 0,
  RF_HOMING: 4,
}

// Params with inverted semantics: high value = BAD (anomaly detectors)
// These must be inverted before averaging with confidence values (high = GOOD)
const INVERTED_PARAMS = new Set(['gnss_spoof_delta'])

// Params that are inherently low in nominal (terminal-phase sensors)
// Excluded from axis averaging to prevent false degradation appearance
const EXCLUDED_FROM_THREAT_AVG = new Set([
  'rf_homing_snr', 'rf_homing_lock', 'rf_homing_bearing',
])

/**
 * THREAT sphere: compute per-axis confidence using mean averaging.
 * Handles inverted params (spoof_delta) and excludes terminal-only params.
 */
export function getThreatConfidences(storeParams: Record<string, ParameterState>): number[] {
  const sums = [0, 0, 0, 0, 0]
  const counts = [0, 0, 0, 0, 0]

  for (const p of THREAT_SPHERE_PARAMETERS) {
    // Skip terminal-phase-only params that would falsely depress axes
    if (EXCLUDED_FROM_THREAT_AVG.has(p.id)) continue

    const axis = GROUP_TO_AXIS[p.group]
    const state = storeParams[p.id]
    if (state) {
      let conf = state.confidence

      // Invert anomaly detectors: gnss_spoof_delta nominal ~0.97, spoofed ~1.35
      // Convert to: nominal ~0.97 (good), spoofed ~0.62 (bad)
      if (INVERTED_PARAMS.has(p.id)) {
        // Map: 0.97 → 0.97 (nominal), 1.35 → 0.62 (spoofed)
        conf = Math.max(0, 2.0 - conf)
      }

      sums[axis] += conf
      counts[axis]++
    }
  }

  return sums.map((sum, i) => counts[i] > 0 ? sum / counts[i] : 0.95)
}

/**
 * RESPONSE sphere: soft activation-weighted averaging.
 *
 * Each param's contribution is weighted by how "active" it is:
 *   weight(c) = c²  — dormant (0.10) contributes 0.01, active (1.0) contributes 1.0
 *
 * The axis value blends toward nominal (0.95) when all params are dormant,
 * and smoothly transitions toward the active param values as they ramp up.
 * No hard thresholds = no discontinuities.
 *
 * Final axis = (Σ w_i * c_i + nominalWeight * 0.95) / (Σ w_i + nominalWeight)
 * where nominalWeight decays as activation increases.
 */
export function getResponseConfidences(storeParams: Record<string, ParameterState>): number[] {
  const NOMINAL_AXIS_VALUE = 0.95

  const weightedSums = [0, 0, 0, 0, 0]
  const totalWeights = [0, 0, 0, 0, 0]
  const maxVals = [0, 0, 0, 0, 0]

  for (const p of RESPONSE_SPHERE_PARAMETERS) {
    const axis = GROUP_TO_AXIS[p.group]
    const state = storeParams[p.id]
    if (!state) continue

    const c = state.confidence
    // Soft activation weight: c² makes dormant (0.10→0.01) nearly invisible
    // while active (0.90→0.81) or pushing (1.15→1.32) fully contributes
    const w = c * c
    weightedSums[axis] += w * c
    totalWeights[axis] += w
    if (c > maxVals[axis]) maxVals[axis] = c
  }

  return weightedSums.map((ws, i) => {
    const tw = totalWeights[i]
    // Nominal bias: strong when all params dormant, fades as activation grows
    // At tw=0.03 (all dormant): nomBias=0.97 → axis ≈ 0.95
    // At tw=1.0 (one active):   nomBias=0.50 → axis blends toward active value
    // At tw=3.0 (all active):   nomBias=0.25 → axis dominated by active values
    const nomBias = 1.0 / (1.0 + tw)
    const activePart = tw > 0.001 ? ws / tw : NOMINAL_AXIS_VALUE
    return nomBias * NOMINAL_AXIS_VALUE + (1 - nomBias) * activePart
  })
}
