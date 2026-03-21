import type { TechniqueId, TechniqueState, FusionState } from '../types/navigation'
import type { FaultState } from './faultInjectionEngine'
import { exponentialApproach } from './faultInjectionEngine'

// Response time constants
const TAU_ACTIVATE = 0.8   // fast AI ramp-up
const TAU_DEACTIVATE = 2.0 // cautious stand-down

/**
 * Derive all 12 AI response parameters from current state.
 * Values > 1.0 indicate active AI compensation — triggers outward sphere push
 * and green coloring in the RESPONSE sphere visualization.
 */
export function deriveResponseTargets(
  faults: FaultState,
  techniques: Record<TechniqueId, TechniqueState>,
  fusion: FusionState,
): Record<string, number> {
  const anyFault = faults.jamming || faults.spoofing
  const spoofFlag = techniques.GNSS.spoofing_flag
  const composite = fusion.composite_confidence
  const gnssDenied = techniques.GNSS.health_status === 'DENIED' || techniques.GNSS.health_status === 'SPOOFED'

  return {
    // INS backbone — boosted under spoofing (INS becomes primary cross-check)
    // > 1.0 = actively compensating, visible as outward push on sphere
    resp_inertial_lock: faults.spoofing ? 1.15 : gnssDenied ? 1.08 : 0.94,

    // GNSS rejection — active when spoofing detected
    resp_gnss_reject: spoofFlag ? 1.20 : faults.spoofing ? 0.90 : 0.10,

    // Anti-jam power — active when jamming
    resp_antijam_power: faults.jamming ? 1.15 : techniques.GNSS.jamming_detected ? 0.70 : 0.10,

    // CRPA null steering — tracks antijam
    resp_crpa_null: faults.jamming ? 1.10 : techniques.GNSS.jamming_detected ? 0.60 : 0.10,

    // Technique activations: boost > 1.0 when compensating for GNSS denial
    // These are the key algorithms that fill the navigation gap
    resp_tercom_activate: gnssDenied
      ? Math.min(1.20, techniques.TERCOM.confidence_score + 0.25)
      : anyFault
        ? Math.min(1.05, techniques.TERCOM.confidence_score + 0.10)
        : techniques.TERCOM.confidence_score,

    resp_magnav_activate: gnssDenied
      ? Math.min(1.15, techniques.MAGNAV.confidence_score + 0.30)
      : anyFault
        ? Math.min(1.02, techniques.MAGNAV.confidence_score + 0.15)
        : techniques.MAGNAV.confidence_score,

    resp_scene_activate: gnssDenied
      ? Math.min(1.18, techniques.SCENE_MATCH.confidence_score + 0.22)
      : anyFault
        ? Math.min(1.03, techniques.SCENE_MATCH.confidence_score + 0.10)
        : techniques.SCENE_MATCH.confidence_score,

    // EKF reweighting — aggressive when composite drops
    resp_ekf_reweight: composite < 0.6 ? 1.15 : composite < 0.85 ? 0.95 : 0.30,

    // Altitude adjustment under jamming (terrain-following for TERCOM)
    resp_alt_adjust: faults.jamming ? 0.85 : 0.15,

    // Route modification under any fault
    resp_route_modify: anyFault ? 0.75 : 0.10,

    // Fusion confidence mirror
    resp_fusion_conf: composite,

    // Operator alert under any fault
    resp_operator_alert: anyFault ? 0.90 : 0.10,
  }
}

/**
 * Apply exponential approach to response parameters.
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
