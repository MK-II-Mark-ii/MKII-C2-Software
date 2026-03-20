import { TELEMETRY_PARAMS, TELEMETRY_PARAM_MAP } from '../types/telemetry'
import type { TelemetryParamDef } from '../types/telemetry'

// Per-param jitter frequencies (unique to avoid coherent oscillation)
const JITTER_FREQS: Record<string, number> = {}
let seed = 0.317
for (const p of TELEMETRY_PARAMS) {
  seed = (seed * 7.31 + 0.53) % 1
  JITTER_FREQS[p.id] = 0.05 + seed * 0.4 // 0.05–0.45 Hz
}

// Slow drift frequencies (very low freq wandering)
const DRIFT_FREQS: Record<string, number> = {}
seed = 0.821
for (const p of TELEMETRY_PARAMS) {
  seed = (seed * 3.17 + 0.71) % 1
  DRIFT_FREQS[p.id] = 0.003 + seed * 0.015 // 0.003–0.018 Hz
}

/**
 * Generate realistic telemetry values for a given simulation time.
 * Combines nominal cruise values with:
 * - Sinusoidal micro-jitter (sensor noise)
 * - Slow drift (environmental/thermal drift)
 * - Special behaviors for specific params (fuel depletion, heading changes, etc.)
 */
export function generateTelemetryFrame(
  simTime: number,
  prevValues: Record<string, number> | null,
  dt: number,
): Record<string, number> {
  const values: Record<string, number> = {}

  for (const param of TELEMETRY_PARAMS) {
    values[param.id] = generateParamValue(param, simTime, prevValues, dt)
  }

  // --- Mission route: Jaisalmer AF Station → Muridke, Pakistan ---
  const TGT_LAT = 24.8359
  const TGT_LON = 66.9832
  const curLat = prevValues?.lat ?? param('lat').nominalCruise
  const curLon = prevValues?.lon ?? param('lon').nominalCruise

  // Great-circle bearing to target
  const dLon = (TGT_LON - curLon) * Math.PI / 180
  const lat1 = curLat * Math.PI / 180
  const lat2 = TGT_LAT * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const bearing = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360

  // Set heading to steer toward target (with slight noise)
  values.psi = (bearing + jitter(simTime, 0.05, 1.5) + 360) % 360

  // Cross-coupled parameters
  values.tas = values.ias * (1 + values.alt_msl * 0.000035)
  values.mach = values.tas * 0.514444 / 340.3
  values.alt_gps = values.alt_msl + jitter(simTime, 0.23, 3)
  values.palt = values.alt_msl + jitter(simTime, 0.19, 8)
  values.p_static = 1013.25 * Math.pow(1 - values.alt_msl * 0.0000226, 5.257)
  values.dalt = values.alt_msl + (values.oat - 15 + values.alt_msl * 0.0065) * 36
  values.gs = values.tas + values.wind_spd * Math.cos((values.wind_dir - values.psi) * Math.PI / 180)
  values.trk = (values.psi + jitter(simTime, 0.03, 2) + 360) % 360
  values.hdg_mag = (values.psi - 1.5 + 360) % 360

  // Fuel depletes over time (roughly 3.2 kg/hr = 0.000889 kg/s)
  if (prevValues) {
    values.fuel_rem = Math.max(0, (prevValues.fuel_rem ?? param('fuel_rem').nominalCruise) - dt * 0.000889)
  }
  values.fuel_pct = (values.fuel_rem / 18) * 100

  // Energy accumulates
  if (prevValues) {
    values.energy = (prevValues.energy ?? 0) + dt * values.vbus * values.ibus / 3600
  }

  // Battery SOC slowly decreases
  if (prevValues) {
    values.bat_soc = Math.max(0, (prevValues.bat_soc ?? 92) - dt * 0.0008)
  }

  // TTW computed after wpt_dist is set from haversine below
  // (old linear decrement removed — haversine is source of truth)

  // Loiter time remaining decreases
  if (prevValues) {
    values.loit_trem = Math.max(0, (prevValues.loit_trem ?? param('loit_trem').nominalCruise) - dt)
  }

  // TTT decreases
  if (prevValues) {
    values.ttt = Math.max(0, (prevValues.ttt ?? param('ttt').nominalCruise) - dt)
  }

  // Lat/lon update — fly toward Muridke target
  if (prevValues) {
    const gsMs = values.gs * 0.514444
    const trkRad = values.trk * Math.PI / 180
    values.lat = (prevValues.lat ?? param('lat').nominalCruise) + (gsMs * Math.cos(trkRad) * dt) / 111320
    values.lon = (prevValues.lon ?? param('lon').nominalCruise) + (gsMs * Math.sin(trkRad) * dt) / (111320 * Math.cos(values.lat * Math.PI / 180))
  }

  // Target coordinates
  values.tgt_lat = TGT_LAT
  values.tgt_lon = TGT_LON
  values.wpt_brg = bearing

  // --- Mission phase from distance-to-target ---
  // Distance to target in km (approx haversine)
  const dLatR = (TGT_LAT - values.lat) * Math.PI / 180
  const dLonR = (TGT_LON - values.lon) * Math.PI / 180
  const a = Math.sin(dLatR / 2) ** 2 + Math.cos(values.lat * Math.PI / 180) * Math.cos(TGT_LAT * Math.PI / 180) * Math.sin(dLonR / 2) ** 2
  const distToTarget = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) // km

  // Phase logic: PRE_LCH(0) LAUNCH(1) CLIMB(2) CRUISE(3) LOITER(4) INGRESS(5) TERMINAL(6) POST_MSN(7)
  if (simTime < 5) {
    values.flt_phase = 0 // PRE_LCH
  } else if (simTime < 15) {
    values.flt_phase = 1 // LAUNCH
  } else if (simTime < 40) {
    values.flt_phase = 2 // CLIMB
  } else if (distToTarget > 50) {
    values.flt_phase = 3 // CRUISE
  } else if (distToTarget > 20) {
    values.flt_phase = 5 // INGRESS
  } else if (distToTarget > 2) {
    values.flt_phase = 6 // TERMINAL
  } else {
    values.flt_phase = 7 // POST_MSN
  }

  // Update waypoint distance and time-to-waypoint
  values.wpt_dist = distToTarget * 1000 // meters
  values.ttw = values.wpt_dist / (values.gs * 0.514444 + 0.01)

  // --- Phase-dependent pitch, VS, and altitude behavior ---
  const phase = values.flt_phase
  if (phase <= 1) {
    // PRE_LCH / LAUNCH: steep climb, nose up 25-35°
    values.theta = 30 + jitter(simTime, 0.1, 3)
    values.vs = 15 + jitter(simTime, 0.15, 2)
    // Altitude ramps up from ground
    if (prevValues) {
      values.alt_msl = Math.min(2000, (prevValues.alt_msl ?? 0) + dt * values.vs)
      values.alt_agl = values.alt_msl - 200 // terrain offset
    } else {
      values.alt_msl = 50
      values.alt_agl = 50
    }
  } else if (phase === 2) {
    // CLIMB: moderate climb, nose up 12-18°
    values.theta = 15 + jitter(simTime, 0.12, 2)
    values.vs = 8 + jitter(simTime, 0.1, 1.5)
    if (prevValues) {
      values.alt_msl = Math.min(2000, (prevValues.alt_msl ?? 500) + dt * values.vs)
      values.alt_agl = values.alt_msl - 200
    }
  } else if (phase === 3 || phase === 4) {
    // CRUISE / LOITER: level flight, slight nose down -2°
    values.theta = -2 + jitter(simTime, 0.08, 0.8)
    values.vs = jitter(simTime, 0.05, 0.5)
    // Hold cruise altitude
    if (prevValues) {
      values.alt_msl = 2000 + jitter(simTime, 0.02, 15)
      values.alt_agl = values.alt_msl - 200
    }
  } else if (phase === 5) {
    // INGRESS: slight descent, nose down -8°
    values.theta = -8 + jitter(simTime, 0.1, 1.5)
    values.vs = -4 + jitter(simTime, 0.1, 1)
    if (prevValues) {
      values.alt_msl = Math.max(300, (prevValues.alt_msl ?? 2000) + dt * values.vs)
      values.alt_agl = values.alt_msl - 200
    }
  } else if (phase === 6) {
    // TERMINAL: steep dive, nose down -35 to -50°
    values.theta = -40 + jitter(simTime, 0.15, 5)
    values.vs = -20 + jitter(simTime, 0.2, 3)
    if (prevValues) {
      values.alt_msl = Math.max(0, (prevValues.alt_msl ?? 300) + dt * values.vs)
      values.alt_agl = Math.max(0, values.alt_msl - 200)
    }
  } else {
    // POST_MSN: impact
    values.theta = -60
    values.vs = -30
    values.alt_msl = 0
    values.alt_agl = 0
  }

  // Clamp all values to valid ranges
  for (const p of TELEMETRY_PARAMS) {
    if (p.format === 'int' || p.format === 'enum' || p.format === 'bool') {
      values[p.id] = Math.round(clamp(values[p.id], p.min, p.max))
    } else {
      values[p.id] = clamp(values[p.id], p.min, p.max)
    }
  }

  return values
}

function generateParamValue(
  p: TelemetryParamDef,
  t: number,
  _prev: Record<string, number> | null,
  _dt: number,
): number {
  const freq = JITTER_FREQS[p.id] ?? 0.2
  const driftFreq = DRIFT_FREQS[p.id] ?? 0.01

  // Enum/bool params don't jitter
  if (p.format === 'enum' || p.format === 'bool' || p.format === 'hex') {
    return p.nominalCruise
  }

  const range = p.max - p.min
  const jitterAmp = range * 0.005 // 0.5% of range
  const driftAmp = range * 0.015  // 1.5% of range

  const base = p.nominalCruise
  const j = Math.sin(t * freq * Math.PI * 2) * jitterAmp
  const d = Math.sin(t * driftFreq * Math.PI * 2) * driftAmp

  // Some params have second-order harmonics for more natural noise
  const h2 = Math.sin(t * freq * 1.73 * Math.PI * 2) * jitterAmp * 0.3

  return base + j + d + h2
}

function jitter(t: number, freq: number, amp: number): number {
  return Math.sin(t * freq * Math.PI * 2) * amp
}

function param(id: string): TelemetryParamDef {
  return TELEMETRY_PARAM_MAP[id]
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
