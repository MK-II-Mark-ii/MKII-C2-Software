// ── Technique identifiers (the 6 nav techniques from the fusion spec) ──

export type TechniqueId = 'INS' | 'GNSS' | 'TERCOM' | 'MAGNAV' | 'SCENE_MATCH' | 'RF_HOMING'

export const TECHNIQUE_IDS: TechniqueId[] = [
  'INS', 'GNSS', 'TERCOM', 'MAGNAV', 'SCENE_MATCH', 'RF_HOMING',
]

export const TECHNIQUE_LABELS: Record<TechniqueId, string> = {
  INS: 'INS/IMU',
  GNSS: 'GNSS',
  TERCOM: 'TERCOM',
  MAGNAV: 'MagNav',
  SCENE_MATCH: 'Scene Match',
  RF_HOMING: 'RF Homing',
}

export const TECHNIQUE_COLORS: Record<TechniqueId, string> = {
  INS: '#00BCD4',
  GNSS: '#378ADD',
  TERCOM: '#1D9E75',
  MAGNAV: '#534AB7',
  SCENE_MATCH: '#EF9F27',
  RF_HOMING: '#D4537E',
}

// ── Health & phase enums ──

export type HealthStatus = 'NOMINAL' | 'DEGRADED' | 'DENIED' | 'SPOOFED'

export type MissionPhase = 'INIT' | 'CLIMB' | 'CRUISE' | 'LOITER' | 'TERMINAL' | 'BDA'

export type DataLinkStatus = 'UP' | 'DEGRADED' | 'DENIED'

// ── Per-technique state (13 vars from spec) ──

export interface TechniqueState {
  confidence_score: number           // [0–1] composite confidence
  health_status: HealthStatus
  is_active: boolean                 // above threshold and fusing into EKF
  last_fix_age_s: number             // seconds since last valid fix
  fix_rate_hz: number
  current_cep_estimate_m: number
  innovation_residual_m: number      // EKF innovation magnitude
  innovation_gate_pass: boolean
  spoofing_flag: boolean
  jamming_detected: boolean
  measurement_noise_scale: number    // R matrix scale factor (1.0 = nominal)
  denial_duration_s: number          // continuous seconds denied
  confidence_decay_rate: number      // per-second decay constant
}

// ── EKF / fusion core state (12 vars from spec) ──

export interface FusionState {
  composite_confidence: number       // [0–1] fusion-level confidence
  primary_technique: TechniqueId
  active_technique_count: number     // 1–6
  fallback_queue: TechniqueId[]      // priority-sorted
  covariance_trace: number           // P matrix trace — uncertainty proxy
  inertial_accumulated_error_m: number
  last_absolute_fix_age_s: number
  ekf_predict_rate_hz: number
  ekf_update_rate_hz: number
  innovation_anomaly_flag: boolean   // CUSUM drift detected
}

// ── Mission phase & authorization (11 vars from spec) ──

export interface MissionState {
  mission_phase: MissionPhase
  distance_to_target_km: number
  cep_threshold_m: number            // phase-dependent max acceptable CEP
  time_in_denial_s: number           // cumulative GNSS denial
  mitl_auth_status: 'PENDING' | 'AUTHORIZED' | 'ABORTED'
  datalink_status: DataLinkStatus
  operator_override_active: boolean
  abort_condition: boolean
  mission_floor_confidence: number   // minimum acceptable composite confidence
  waypoint_index: number
  bda_sensor_active: boolean
}

// ── Environmental observability (13 vars from spec) ──

export interface EnvironmentState {
  cloud_cover: number                // [0–1]
  visibility_km: number
  thermal_contrast: number           // [0–1]
  terrain_roughness: number          // [0–1]
  terrain_map_coverage: number       // [0–1]
  magnetic_field_quality: number     // [0–1]
  magnetic_map_loaded: boolean
  gnss_cn0_dbhz: number
  gnss_satellite_count: number
  rf_noise_floor_dbm: number
  ew_threat_detected: boolean
  eo_image_quality: number           // [0–1]
  altitude_agl_m: number
}

// ── State registry variable definition (for telemetry UI) ──

export type StateCategory =
  | 'TECHNIQUE'
  | 'FUSION'
  | 'MISSION'
  | 'ENVIRONMENT'

export interface StateVariableDefinition {
  id: string
  label: string
  type: string                       // display type hint
  category: StateCategory
  technique?: TechniqueId            // set for per-technique variables
  description: string
}

// ── Defaults ──

export function defaultTechniqueState(): TechniqueState {
  return {
    confidence_score: 0.95,
    health_status: 'NOMINAL',
    is_active: true,
    last_fix_age_s: 0,
    fix_rate_hz: 10,
    current_cep_estimate_m: 15,
    innovation_residual_m: 0.5,
    innovation_gate_pass: true,
    spoofing_flag: false,
    jamming_detected: false,
    measurement_noise_scale: 1.0,
    denial_duration_s: 0,
    confidence_decay_rate: 0.01,
  }
}

export function defaultFusionState(): FusionState {
  return {
    composite_confidence: 0.95,
    primary_technique: 'GNSS',
    active_technique_count: 6,
    fallback_queue: ['TERCOM', 'MAGNAV', 'SCENE_MATCH', 'INS', 'RF_HOMING'],
    covariance_trace: 10,
    inertial_accumulated_error_m: 0,
    last_absolute_fix_age_s: 0,
    ekf_predict_rate_hz: 200,
    ekf_update_rate_hz: 10,
    innovation_anomaly_flag: false,
  }
}

export function defaultMissionState(): MissionState {
  return {
    mission_phase: 'CRUISE',
    distance_to_target_km: 500,
    cep_threshold_m: 200,
    time_in_denial_s: 0,
    mitl_auth_status: 'PENDING',
    datalink_status: 'UP',
    operator_override_active: false,
    abort_condition: false,
    mission_floor_confidence: 0.40,
    waypoint_index: 0,
    bda_sensor_active: false,
  }
}

export function defaultEnvironmentState(): EnvironmentState {
  return {
    cloud_cover: 0.1,
    visibility_km: 15,
    thermal_contrast: 0.7,
    terrain_roughness: 0.6,
    terrain_map_coverage: 0.9,
    magnetic_field_quality: 0.75,
    magnetic_map_loaded: true,
    gnss_cn0_dbhz: 42,
    gnss_satellite_count: 12,
    rf_noise_floor_dbm: -110,
    ew_threat_detected: false,
    eo_image_quality: 0.85,
    altitude_agl_m: 3000,
  }
}
