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
  const TGT_LAT = 31.802
  const TGT_LON = 74.255
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

  // Waypoint distance decreases
  if (prevValues) {
    const prevDist = prevValues.wpt_dist ?? param('wpt_dist').nominalCruise
    values.wpt_dist = Math.max(100, prevDist - dt * values.gs * 0.514444)
    values.ttw = values.wpt_dist / (values.gs * 0.514444 + 0.01)
  }

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
