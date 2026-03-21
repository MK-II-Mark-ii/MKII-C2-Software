import type { EnvironmentState, MissionState, MissionPhase, DataLinkStatus } from '../types/navigation'
import type { FaultState } from './faultInjectionEngine'
import { exponentialApproach } from './faultInjectionEngine'

// ── Environment targets under fault conditions ──

interface EnvTargets {
  gnss_cn0_dbhz: number
  gnss_satellite_count: number
  rf_noise_floor_dbm: number
  ew_threat_detected: boolean
}

const NOMINAL_ENV: EnvTargets = {
  gnss_cn0_dbhz: 42,
  gnss_satellite_count: 12,
  rf_noise_floor_dbm: -110,
  ew_threat_detected: false,
}

function getEnvTargets(faults: FaultState): EnvTargets {
  if (faults.jamming && faults.spoofing) {
    return {
      gnss_cn0_dbhz: 8,
      gnss_satellite_count: 0,
      rf_noise_floor_dbm: -65,
      ew_threat_detected: true,
    }
  }
  if (faults.jamming) {
    return {
      gnss_cn0_dbhz: 8,
      gnss_satellite_count: 0,
      rf_noise_floor_dbm: -65,
      ew_threat_detected: true,
    }
  }
  if (faults.spoofing) {
    return {
      gnss_cn0_dbhz: 22,
      gnss_satellite_count: 12,
      rf_noise_floor_dbm: -95,
      ew_threat_detected: true,
    }
  }
  return NOMINAL_ENV
}

const TAU_ENV_ONSET = 2.0
const TAU_ENV_RECOVERY = 4.0

/**
 * Derive environment state from fault conditions + live telemetry.
 */
export function deriveEnvironmentUpdates(
  currentEnv: EnvironmentState,
  faults: FaultState,
  dt: number,
  telemetry?: Record<string, number> | null,
): Partial<EnvironmentState> {
  const targets = getEnvTargets(faults)

  const tauCn0 = targets.gnss_cn0_dbhz < currentEnv.gnss_cn0_dbhz ? TAU_ENV_ONSET : TAU_ENV_RECOVERY
  const tauNoise = targets.rf_noise_floor_dbm > currentEnv.rf_noise_floor_dbm ? TAU_ENV_ONSET : TAU_ENV_RECOVERY
  const tauSat = targets.gnss_satellite_count < currentEnv.gnss_satellite_count ? TAU_ENV_ONSET : TAU_ENV_RECOVERY

  // Pull live values from telemetry when available
  const altAgl = telemetry?.alt_agl ?? 1500
  const altMsl = telemetry?.alt_msl ?? 2000

  // Dynamic environment based on altitude and conditions
  // Cloud cover increases slightly at higher altitudes
  const cloudCover = Math.min(0.8, 0.05 + altMsl * 0.00005 + Math.sin(dt * 0.001) * 0.02)
  // Visibility decreases with cloud cover, improves at altitude
  const visibility = Math.max(5, 18 - cloudCover * 10 + (altMsl > 1500 ? 2 : 0))
  // Thermal contrast decreases with cloud cover
  const thermalContrast = Math.max(0.2, 0.75 - cloudCover * 0.3)
  // EO quality degrades with clouds and improves at lower altitude
  const eoQuality = Math.max(0.3, 0.9 - cloudCover * 0.25 - (altMsl > 3000 ? 0.1 : 0))
  // Terrain coverage varies with region (higher coverage over mapped areas)
  const terrainCoverage = altAgl < 500 ? 0.95 : altAgl < 2000 ? 0.88 : 0.75
  // Magnetic field quality varies slightly
  const magQuality = 0.72 + Math.sin(currentEnv.gnss_cn0_dbhz * 0.05) * 0.05

  return {
    gnss_cn0_dbhz: exponentialApproach(currentEnv.gnss_cn0_dbhz, targets.gnss_cn0_dbhz, dt, tauCn0),
    gnss_satellite_count: Math.round(
      exponentialApproach(currentEnv.gnss_satellite_count, targets.gnss_satellite_count, dt, tauSat),
    ),
    rf_noise_floor_dbm: exponentialApproach(currentEnv.rf_noise_floor_dbm, targets.rf_noise_floor_dbm, dt, tauNoise),
    ew_threat_detected: targets.ew_threat_detected,
    cloud_cover: Math.round(cloudCover * 100) / 100,
    visibility_km: Math.round(visibility * 10) / 10,
    thermal_contrast: Math.round(thermalContrast * 100) / 100,
    terrain_roughness: 0.55 + Math.sin(altAgl * 0.001) * 0.1,
    terrain_map_coverage: Math.round(terrainCoverage * 100) / 100,
    magnetic_field_quality: Math.round(magQuality * 100) / 100,
    magnetic_map_loaded: true,
    eo_image_quality: Math.round(eoQuality * 100) / 100,
    altitude_agl_m: Math.round(altAgl),
  }
}

// ── Mission phase mapping from telemetry flt_phase ──
const PHASE_MAP: Record<number, MissionPhase> = {
  0: 'INIT',      // PRE_LCH
  1: 'INIT',      // LAUNCH
  2: 'CLIMB',     // CLIMB
  3: 'CRUISE',   // CRUISE
  4: 'LOITER',    // LOITER
  5: 'TERMINAL',  // INGRESS
  6: 'TERMINAL',  // TERMINAL
  7: 'BDA',       // POST_MSN
}

/**
 * Derive mission state from faults, confidence, and live telemetry.
 */
export function deriveMissionUpdates(
  currentMission: MissionState,
  faults: FaultState,
  dt: number,
  gnssConfidence: number,
  compositeConfidence: number,
  activeCount: number,
  simTime?: number,
  telemetry?: Record<string, number> | null,
): Partial<MissionState> {
  // Accumulate GNSS denial time
  const timeInDenial = gnssConfidence < 0.35
    ? currentMission.time_in_denial_s + dt
    : Math.max(0, currentMission.time_in_denial_s - dt * 0.5)

  // Datalink status
  let datalinkStatus: DataLinkStatus = 'UP'
  if (faults.jamming) datalinkStatus = 'DEGRADED'
  if (faults.jamming && faults.spoofing) datalinkStatus = 'DENIED'

  // Abort condition
  const abortCondition = compositeConfidence < currentMission.mission_floor_confidence && activeCount <= 1

  // Live mission phase from telemetry flt_phase
  const fltPhase = Math.round(telemetry?.flt_phase ?? 3)
  const missionPhase: MissionPhase = PHASE_MAP[fltPhase] ?? 'CRUISE'

  // Distance to target from telemetry (wpt_dist is in meters)
  const distKm = (telemetry?.wpt_dist ?? 250000) / 1000

  // CEP threshold varies by phase
  let cep = 200
  if (missionPhase === 'TERMINAL') cep = 15
  else if (missionPhase === 'LOITER') cep = 50

  // MITL auth: auto-authorize after climb phase
  const time = simTime ?? 0
  const mitlAuth = time > 40 ? 'AUTHORIZED' as const : 'PENDING' as const

  // Waypoint index: rough progress indicator
  const wptIndex = fltPhase <= 2 ? 0 : fltPhase <= 3 ? 1 : fltPhase <= 5 ? 2 : 3

  // BDA sensor activates in terminal phase
  const bdaSensor = fltPhase >= 6

  return {
    mission_phase: missionPhase,
    distance_to_target_km: Math.round(distKm * 10) / 10,
    cep_threshold_m: cep,
    time_in_denial_s: timeInDenial,
    mitl_auth_status: abortCondition ? 'ABORTED' : mitlAuth,
    datalink_status: datalinkStatus,
    operator_override_active: false,
    abort_condition: abortCondition,
    mission_floor_confidence: 0.40,
    waypoint_index: wptIndex,
    bda_sensor_active: bdaSensor,
  }
}
