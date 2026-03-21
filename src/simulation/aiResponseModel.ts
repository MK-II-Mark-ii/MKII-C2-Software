import type { TechniqueId, TechniqueState, FusionState } from '../types/navigation'
import type { FaultState } from './faultInjectionEngine'
import { exponentialApproach } from './faultInjectionEngine'

// Response time constants
const TAU_ACTIVATE = 0.8   // fast AI ramp-up
const TAU_DEACTIVATE = 2.0 // cautious stand-down

/**
 * Derive all 12 AI response parameters from current state.
 * The AI is always-on — it maintains baseline awareness and rapidly compensates.
 */
export function deriveResponseTargets(
  faults: FaultState,
  techniques: Record<TechniqueId, TechniqueState>,
  fusion: FusionState,
): Record<string, number> {
  const anyFault = faults.jamming || faults.spoofing
  const spoofFlag = techniques.GNSS.spoofing_flag
  const composite = fusion.composite_confidence

  return {
    // INS backbone — boosted under spoofing (INS becomes primary cross-check reference)
    resp_inertial_lock: faults.spoofing ? 0.98 : 0.94,

    // GNSS rejection — active when spoofing detected
    resp_gnss_reject: spoofFlag ? 0.95 : faults.spoofing ? 0.80 : 0.10,

    // Anti-jam power — active when jamming
    resp_antijam_power: faults.jamming ? 0.90 : techniques.GNSS.jamming_detected ? 0.60 : 0.10,

    // CRPA null steering — tracks antijam with slight lag (handled by tau)
    resp_crpa_null: faults.jamming ? 0.88 : techniques.GNSS.jamming_detected ? 0.55 : 0.10,

    // Technique activations: boost when GNSS denied (compensating)
    resp_tercom_activate: anyFault
      ? Math.min(0.98, techniques.TERCOM.confidence_score + 0.08)
      : techniques.TERCOM.confidence_score,
    resp_magnav_activate: anyFault
      ? Math.min(0.95, techniques.MAGNAV.confidence_score + 0.12)
      : techniques.MAGNAV.confidence_score,
    resp_scene_activate: anyFault
      ? Math.min(0.96, techniques.SCENE_MATCH.confidence_score + 0.07)
      : techniques.SCENE_MATCH.confidence_score,

    // EKF reweighting when composite degrades
    resp_ekf_reweight: composite < 0.85 ? 0.90 : 0.30,

    // Altitude adjustment under jamming
    resp_alt_adjust: faults.jamming ? 0.70 : 0.15,

    // Route modification under any fault
    resp_route_modify: anyFault ? 0.65 : 0.10,

    // Fusion confidence mirror
    resp_fusion_conf: composite,

    // Operator alert under any fault
    resp_operator_alert: anyFault ? 0.85 : 0.10,
  }
}

/**
 * Apply exponential approach to response parameters.
 * Returns paramId → new confidence map.
 */
export function computeResponseUpdates(
  currentParams: Record<string, { confidence: number }>,
  faults: FaultState,
  techniques: Record<TechniqueId, TechniqueState>,
  fusion: FusionState,
  dt: number,
): Record<string, number> {
  const targets = deriveResponseTargets(faults, techniques, fusion)
  const updates: Record<string, number> = {}

  for (const [paramId, target] of Object.entries(targets)) {
    const current = currentParams[paramId]?.confidence ?? 0.10
    const tau = target > current ? TAU_ACTIVATE : TAU_DEACTIVATE
    updates[paramId] = exponentialApproach(current, target, dt, tau)
  }

  return updates
}
