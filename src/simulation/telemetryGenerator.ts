import { TELEMETRY_PARAMS, TELEMETRY_PARAM_MAP } from '../types/telemetry'
import type { TelemetryParamDef } from '../types/telemetry'
import type { FaultState } from './faultInjectionEngine'
import type { TechniqueId, TechniqueState, FusionState } from '../types/navigation'

// Per-param jitter frequencies
const JITTER_FREQS: Record<string, number> = {}
let seed = 0.317
for (const p of TELEMETRY_PARAMS) {
  seed = (seed * 7.31 + 0.53) % 1
  JITTER_FREQS[p.id] = 0.05 + seed * 0.4
}

const DRIFT_FREQS: Record<string, number> = {}
seed = 0.821
for (const p of TELEMETRY_PARAMS) {
  seed = (seed * 3.17 + 0.71) % 1
  DRIFT_FREQS[p.id] = 0.003 + seed * 0.015
}

import type { MissionFlowState } from '../stores/uiStore'

// ── Constants ──
const ORIGIN_LAT = 26.9167
const ORIGIN_LON = 70.9000
const KT_TO_MS = 0.514444
const G = 9.81

/**
 * Generate physically-coupled telemetry with fault awareness.
 * Jamming and spoofing produce distinctly different signatures.
 */
export function generateTelemetryFrame(
  simTime: number,
  prevValues: Record<string, number> | null,
  dt: number,
  faults?: FaultState,
  techniques?: Record<TechniqueId, TechniqueState>,
  fusion?: FusionState,
  missionFlow?: MissionFlowState,
  targetLat?: number,
  targetLon?: number,
): Record<string, number> {
  const TGT_LAT = targetLat ?? 24.8359
  const TGT_LON = targetLon ?? 66.9832
  const flow = missionFlow ?? 'LAUNCHED'

  // IDLE: return static pre-launch telemetry
  if (flow === 'IDLE') {
    return generateIdleTelemetry(simTime)
  }

  // LANDED: freeze at landed state
  if (flow === 'LANDED' || (prevValues && Math.round(prevValues._landed ?? 0) === 1)) {
    return generateLandedTelemetry(prevValues)
  }

  // If mission already completed (POST_MSN), freeze all telemetry at impact state
  if (prevValues && Math.round(prevValues.flt_phase ?? 0) === 7 && flow === 'LAUNCHED') {
    const frozen = { ...prevValues }
    frozen.flt_phase = 7
    frozen.alt_msl = 0
    frozen.alt_agl = 0
    frozen.alt_gps = 0
    frozen.ias = 0
    frozen.tas = 0
    frozen.gs = 0
    frozen.vs = 0
    frozen.mach = 0
    frozen.eng_rpm = 0
    frozen.egt = 0
    frozen.thr_pos = 0
    frozen.fuel_flow = 0
    frozen.arm_status = 3 // FUZE_EN
    frozen.fuze_mode = 1  // CONTACT
    frozen.theta = -70
    frozen.phi = 0
    frozen.roll_rate = 0
    frozen.pitch_rate = 0
    frozen.g_load = 0
    frozen.vib_x = 0
    frozen.vib_y = 0
    frozen.vib_z = 0
    frozen.gen_v = 0
    frozen.wpt_dist = 0
    frozen.term_vel = 180
    frozen.imp_angle = 70
    return frozen
  }

  const values: Record<string, number> = {}
  const isJamming = faults?.jamming ?? false
  const isSpoofing = faults?.spoofing ?? false
  const spoofFlag = techniques?.GNSS?.spoofing_flag ?? false
  const gnssConf = techniques?.GNSS?.confidence_score ?? 1.0
  const compositeConf = fusion?.composite_confidence ?? 0.95

  // Separate denial factors for jamming vs spoofing
  // Jamming: direct signal denial, progressive degradation
  const jamDenial = isJamming ? Math.min(1, 1 - gnssConf) : 0
  // Spoofing: deceptive — GPS looks healthy but position is false
  // spoofFlag indicates the AI has detected the spoof via inertial cross-check
  const spoofActive = isSpoofing ? 1 : 0
  const spoofDetected = spoofFlag ? 1 : 0

  // Seed all params with nominal + sensor noise
  for (const p of TELEMETRY_PARAMS) {
    values[p.id] = generateParamValue(p, simTime)
  }

  // ════════════════════════════════════════════════
  // 1. NAVIGATION — Bearing & position
  // ════════════════════════════════════════════════
  const isRTH = flow === 'RTH'
  // When RTH, navigate toward origin instead of target
  const navLat = isRTH ? ORIGIN_LAT : TGT_LAT
  const navLon = isRTH ? ORIGIN_LON : TGT_LON

  const curLat = prevValues?.lat ?? param('lat').nominalCruise
  const curLon = prevValues?.lon ?? param('lon').nominalCruise

  const dLon = (navLon - curLon) * Math.PI / 180
  const lat1 = curLat * Math.PI / 180
  const lat2 = navLat * Math.PI / 180
  const by = Math.sin(dLon) * Math.cos(lat2)
  const bx = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const bearing = ((Math.atan2(by, bx) * 180 / Math.PI) + 360) % 360

  const dLatR = (navLat - curLat) * Math.PI / 180
  const dLonR = (navLon - curLon) * Math.PI / 180
  const a = Math.sin(dLatR / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLonR / 2) ** 2
  const distToTarget = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  // RTH landing check — within 2km of origin
  if (isRTH && distToTarget < 2) {
    values._landed = 1
    return generateLandedTelemetry(prevValues)
  }

  // ════════════════════════════════════════════════
  // 2. FLIGHT PHASE
  // ════════════════════════════════════════════════
  let phase: number
  if (isRTH) {
    phase = 3 // CRUISE (returning home)
  } else if (simTime < 3) phase = 0
  else if (simTime < 12) phase = 1
  else if (simTime < 45) phase = 2
  else if (distToTarget > 50) phase = 3
  else if (distToTarget > 15) phase = 5
  else if (distToTarget > 1.5) phase = 6
  else phase = 7
  values.flt_phase = phase

  // ════════════════════════════════════════════════
  // 3. PHASE-DEPENDENT FLIGHT DYNAMICS
  // ════════════════════════════════════════════════
  const prevAlt = prevValues?.alt_msl ?? 50
  const prevIas = prevValues?.ias ?? 40

  let targetThrottle: number
  let targetPitch: number
  let targetIas: number

  if (phase <= 1) {
    targetThrottle = 95 + jitter(simTime, 0.1, 3)
    targetPitch = 28 + jitter(simTime, 0.1, 3)
    targetIas = 70 + jitter(simTime, 0.08, 3)
    values.vs = 12 + jitter(simTime, 0.15, 2)
    values.alt_msl = prevValues ? Math.min(2000, prevAlt + dt * values.vs) : 50
    values.alt_agl = Math.max(0, values.alt_msl - 220)
  } else if (phase === 2) {
    targetThrottle = 82 + jitter(simTime, 0.08, 2)
    targetPitch = 12 + jitter(simTime, 0.1, 2)
    targetIas = 85 + jitter(simTime, 0.06, 2)
    values.vs = 6 + jitter(simTime, 0.1, 1.5)
    values.alt_msl = prevValues ? Math.min(2000, prevAlt + dt * values.vs) : 800
    values.alt_agl = Math.max(0, values.alt_msl - 220)
  } else if (phase === 3 || phase === 4) {
    targetThrottle = 55 + jitter(simTime, 0.05, 2)
    targetPitch = -2 + jitter(simTime, 0.08, 0.6)
    targetIas = 95 + jitter(simTime, 0.04, 2)
    values.vs = jitter(simTime, 0.05, 0.4)
    values.alt_msl = 2000 + jitter(simTime, 0.02, 12)
    values.alt_agl = values.alt_msl - 220

    // JAMMING: autopilot hunting from degraded nav
    if (jamDenial > 0.5) {
      values.alt_msl += jitter(simTime, 0.08, 25 * jamDenial)
      values.vs += jitter(simTime, 0.12, 2 * jamDenial)
      targetPitch += jitter(simTime, 0.1, 1.5 * jamDenial)
    }

    // SPOOFING (detected): brief transient as autopilot switches to INS+TERCOM
    if (spoofDetected && prevValues) {
      const timeSinceDetect = simTime - (prevValues._spoofDetectTime ?? simTime)
      if (timeSinceDetect < 5) {
        // Transient: pitch wobble + altitude dip during mode switch
        const transientFade = Math.exp(-timeSinceDetect * 0.5)
        targetPitch += 3 * Math.sin(timeSinceDetect * 2) * transientFade
        values.alt_msl += -15 * transientFade
        values.vs += -2 * transientFade
      }
    }
  } else if (phase === 5) {
    targetThrottle = 70 + jitter(simTime, 0.08, 2)
    targetPitch = -6 + jitter(simTime, 0.1, 1)
    targetIas = 110 + jitter(simTime, 0.06, 3)
    values.vs = -5 + jitter(simTime, 0.1, 1)
    values.alt_msl = prevValues ? Math.max(250, prevAlt + dt * values.vs) : 1200
    values.alt_agl = Math.max(0, values.alt_msl - 100)
  } else if (phase === 6) {
    const prevTermAlt = prevValues?.alt_msl ?? 250
    const decayRate = 0.25
    const newAlt = prevTermAlt * Math.exp(-decayRate * dt)
    values.alt_msl = Math.max(3, newAlt)
    values.alt_agl = Math.max(0, values.alt_msl - 30)
    values.vs = -(prevTermAlt - values.alt_msl) / (dt || 0.01)
    const altFrac = Math.min(1, Math.max(0, (250 - values.alt_msl) / 250))
    targetThrottle = 100
    targetPitch = -20 - 50 * altFrac + jitter(simTime, 0.15, 2)
    targetIas = 130 + 80 * altFrac + jitter(simTime, 0.1, 3)
  } else {
    targetThrottle = 0
    targetPitch = -70
    targetIas = 0
    values.vs = -50
    values.alt_msl = 0
    values.alt_agl = 0
  }

  values.ias = prevValues ? prevIas + (targetIas - prevIas) * Math.min(1, dt * 0.8) : targetIas
  values.theta = targetPitch
  values.thr_pos = targetThrottle

  // ════════════════════════════════════════════════
  // 4. ENGINE MODEL — fixed-pitch prop
  // ════════════════════════════════════════════════
  const throttle = values.thr_pos / 100
  const iasEffect = (values.ias - 95) * 8
  values.eng_rpm = 2000 + throttle * 5500 + iasEffect + jitter(simTime, 0.2, 60)
  values.egt = 300 + throttle * 380 + jitter(simTime, 0.15, 8)
  values.eng_trq = 5 + throttle * 28 + jitter(simTime, 0.18, 0.8)
  values.fuel_flow = 0.8 + throttle * 5.0 + jitter(simTime, 0.1, 0.15)
  values.prop_pitch = 28

  if (prevValues) {
    values.fuel_rem = Math.max(0, (prevValues.fuel_rem ?? param('fuel_rem').nominalCruise) - dt * values.fuel_flow / 3600)
  }
  values.fuel_pct = (values.fuel_rem / 18) * 100

  // ════════════════════════════════════════════════
  // 5. HEADING — different noise signatures per fault type
  // ════════════════════════════════════════════════
  // Physics-based turn: max turn rate limited by bank angle and airspeed
  // Shahed-136: max bank ~25°, at 95kt → turn rate ~5.4°/s, radius ~520m
  const vMs = values.ias * KT_TO_MS
  const maxBankDeg = 25 // max coordinated bank angle
  const maxBankRad = maxBankDeg * Math.PI / 180
  // Max turn rate = g * tan(bank) / V (rad/s) → convert to deg/s
  const maxTurnRate = vMs > 5 ? (G * Math.tan(maxBankRad) / vMs) * 180 / Math.PI : 3

  // Desired heading = bearing to target (with noise)
  let headingNoise = jitter(simTime, 0.02, 0.3)
  if (jamDenial > 0.5) headingNoise += jitter(simTime, 0.005, 1.5 * jamDenial)
  if (spoofActive && !spoofDetected) headingNoise += jitter(simTime, 0.003, 0.2)
  else if (spoofDetected) headingNoise += jitter(simTime, 0.008, 0.8)

  const desiredHeading = (bearing + headingNoise + 360) % 360

  // Current heading from previous frame
  const prevPsi = prevValues?.psi ?? desiredHeading

  // Compute shortest turn direction
  let headingError = desiredHeading - prevPsi
  if (headingError > 180) headingError -= 360
  if (headingError < -180) headingError += 360

  // Rate-limit the heading change
  const maxChange = maxTurnRate * dt
  let headingChange: number
  if (Math.abs(headingError) <= maxChange) {
    headingChange = headingError // small enough to reach in one step
  } else {
    headingChange = Math.sign(headingError) * maxChange // rate-limited
  }

  values.psi = ((prevPsi + headingChange) % 360 + 360) % 360

  // Actual turn rate for roll computation
  const actualTurnRate = dt > 0 ? headingChange / dt : 0

  // Smooth the turn rate for roll calculation
  const prevHdgRate = prevValues ? ((prevValues._hdgRate as number) ?? 0) : 0
  const smoothHdgRate = prevHdgRate + (actualTurnRate - prevHdgRate) * 0.3
  values._hdgRate = smoothHdgRate

  // Roll from coordinated turn: phi = atan(V * turnRate / g)
  const coordRoll = Math.atan2(vMs * (smoothHdgRate * Math.PI / 180), G) * 180 / Math.PI
  values.phi = clamp(coordRoll + jitter(simTime, 0.04, 0.1), -maxBankDeg - 5, maxBankDeg + 5)

  const prevPhi = prevValues?.phi ?? 0
  values.roll_rate = dt > 0 ? (values.phi - prevPhi) / dt : 0
  const prevTheta = prevValues?.theta ?? -2
  values.pitch_rate = dt > 0 ? (values.theta - prevTheta) / dt : 0

  // ════════════════════════════════════════════════
  // 6. G-LOAD
  // ════════════════════════════════════════════════
  const bankRad = values.phi * Math.PI / 180
  const bankG = 1 / Math.max(0.5, Math.cos(bankRad))
  const pitchG = Math.abs(values.pitch_rate) * 0.02
  values.g_load = bankG + pitchG + jitter(simTime, 0.12, 0.03)

  // ════════════════════════════════════════════════
  // 7. CONTROL SURFACES
  // ════════════════════════════════════════════════
  values.elev_pos = clamp(-values.theta * 0.7 + jitter(simTime, 0.1, 0.3), -25, 25)
  values.rud_pos = clamp(values.phi * 0.15 + jitter(simTime, 0.08, 0.2), -30, 30)
  values.ail_l_pos = clamp(-values.phi * 0.4 + jitter(simTime, 0.09, 0.2), -25, 25)
  values.ail_r_pos = clamp(values.phi * 0.4 + jitter(simTime, 0.09, 0.2), -25, 25)
  values.servo_ipeak = 0.3 + Math.abs(values.elev_pos) * 0.05 + Math.abs(values.ail_l_pos) * 0.04 + jitter(simTime, 0.15, 0.1)

  // ════════════════════════════════════════════════
  // 8. ATMOSPHERE
  // ════════════════════════════════════════════════
  const altM = values.alt_msl
  values.oat = 20 - 0.0065 * altM + jitter(simTime, 0.03, 0.5)
  const rhoRatio = Math.pow(1 - altM * 0.0000226, 4.257)
  values.tas = values.ias / Math.sqrt(Math.max(0.5, rhoRatio))
  const speedOfSound = 340.3 * Math.sqrt((273.15 + values.oat) / 288.15)
  values.mach = (values.tas * KT_TO_MS) / speedOfSound
  values.palt = altM + jitter(simTime, 0.19, 6)
  values.p_static = 1013.25 * Math.pow(1 - altM * 0.0000226, 5.257)
  const isaTemp = 15 - 0.0065 * altM
  values.dalt = altM + 120 * (values.oat - isaTemp)

  // ════════════════════════════════════════════════
  // 9. GPS TELEMETRY — DISTINCT signatures for jamming vs spoofing
  // ════════════════════════════════════════════════

  if (isJamming && !isSpoofing) {
    // ── JAMMING: progressive signal loss ──
    if (jamDenial > 0.7) {
      values.gps_nsat = Math.round(Math.max(0, 2 * (1 - jamDenial) + jitter(simTime, 0.3, 0.5)))
      values.gps_fix = 0 // NONE
      values.hdop = clamp(2 + jamDenial * 20 + jitter(simTime, 0.15, 2), 0.5, 25)
      values.nav_mode = 2 // INS_ONLY
      values.alt_gps = prevValues?.alt_gps ?? altM // frozen
    } else if (jamDenial > 0.3) {
      values.gps_nsat = Math.round(Math.max(3, 12 * (1 - jamDenial) + jitter(simTime, 0.2, 1)))
      values.gps_fix = 1 // SPS degraded
      values.hdop = clamp(1.2 + jamDenial * 8 + jitter(simTime, 0.12, 1), 0.5, 25)
      values.nav_mode = 3 // INS+GPS degraded
      values.alt_gps = altM + jamDenial * 30 * jitter(simTime, 0.08, 1)
    } else {
      values.alt_gps = altM + jitter(simTime, 0.23, 3)
    }
  } else if (isSpoofing) {
    // ── SPOOFING: GPS looks deceptively healthy ──
    // Satellites still visible (they're fake but receiver accepts them)
    values.gps_nsat = 12 + Math.round(jitter(simTime, 0.15, 0.5))
    // Fix quality stays high — spoofer provides clean signals
    values.gps_fix = spoofDetected ? 1 : 4 // degrades to SPS only after detection
    // HDOP stays low (spoofer has good geometry)
    values.hdop = spoofDetected
      ? clamp(2 + jitter(simTime, 0.1, 1), 0.5, 25)
      : clamp(0.9 + jitter(simTime, 0.05, 0.2), 0.5, 25)
    // Nav mode: INS+GPS while undetected, switches to INS_ONLY after detection
    values.nav_mode = spoofDetected ? 2 : 3

    // GPS altitude DIVERGES from true altitude — spoofer pushing false altitude
    // Grows over time since spoofing started
    const spoofDuration = simTime - (faults?.spoofingStartedAt ?? simTime)
    const altDivergence = Math.min(200, spoofDuration * 2.5) // grows at 2.5 m/s
    if (spoofDetected) {
      // After detection: GPS altitude frozen at last spoofed value
      values.alt_gps = prevValues?.alt_gps ?? (altM + altDivergence)
    } else {
      // Before detection: GPS altitude slowly diverging (the spoofer's illusion)
      values.alt_gps = altM + altDivergence + jitter(simTime, 0.1, 2)
    }
  } else {
    // Nominal GPS
    values.alt_gps = altM + jitter(simTime, 0.23, 3)
  }

  // ════════════════════════════════════════════════
  // 10. CROSS-TRACK ERROR — different signatures
  // ════════════════════════════════════════════════
  if (jamDenial > 0.5 && prevValues) {
    // JAMMING: random INS drift, TERCOM periodically corrects (sawtooth)
    const prevXte = prevValues.xte ?? 0
    const insDriftRate = jamDenial * 0.5
    const tercomCorrection = Math.sin(simTime * 0.02) > 0.8 ? -prevXte * 0.3 : 0
    values.xte = prevXte + insDriftRate * dt * (Math.sin(simTime * 0.03) > 0 ? 1 : -1) + tercomCorrection
  } else if (spoofActive && !spoofDetected && prevValues) {
    // SPOOFING (undetected): systematic drift in ONE direction (spoofer pulling off-course)
    const prevXte = prevValues.xte ?? 0
    values.xte = prevXte + 0.3 * dt // steady drift — not random like jamming
  } else if (spoofDetected && prevValues) {
    // SPOOFING (detected): XTE stabilizes as INS+TERCOM takes over, slowly corrects
    const prevXte = prevValues.xte ?? 0
    values.xte = prevXte * 0.995 + jitter(simTime, 0.04, 3) // slowly decaying + noise
  } else {
    values.xte = jitter(simTime, 0.06, 8)
  }

  // Track spoof detection time for transient effects
  if (spoofDetected && !(prevValues?._spoofDetectTime)) {
    values._spoofDetectTime = simTime
  } else if (prevValues?._spoofDetectTime) {
    values._spoofDetectTime = prevValues._spoofDetectTime
  }

  // ════════════════════════════════════════════════
  // 11. GROUND SPEED & TRACK
  // ════════════════════════════════════════════════
  values.gs = values.tas + values.wind_spd * Math.cos((values.wind_dir - values.psi) * Math.PI / 180)
  values.trk = (values.psi + jitter(simTime, 0.03, 1.5) + 360) % 360
  values.hdg_mag = (values.psi - 1.5 + 360) % 360

  // ════════════════════════════════════════════════
  // 12. POSITION UPDATE
  // ════════════════════════════════════════════════
  if (prevValues) {
    const gsMs = values.gs * KT_TO_MS
    const trkRad = values.trk * Math.PI / 180
    values.lat = (prevValues.lat ?? param('lat').nominalCruise) + (gsMs * Math.cos(trkRad) * dt) / 111320
    values.lon = (prevValues.lon ?? param('lon').nominalCruise) + (gsMs * Math.sin(trkRad) * dt) / (111320 * Math.cos(values.lat * Math.PI / 180))
  }

  // ════════════════════════════════════════════════
  // 13. GUIDANCE & WAYPOINT
  // ════════════════════════════════════════════════
  values.tgt_lat = TGT_LAT
  values.tgt_lon = TGT_LON
  values.wpt_brg = bearing
  values.wpt_dist = distToTarget * 1000
  values.ttw = values.wpt_dist / (values.gs * KT_TO_MS + 0.01)

  if (phase <= 2) values.gdn_mode = 1
  else if (phase === 3) values.gdn_mode = 1
  else if (phase === 4) values.gdn_mode = 2
  else if (phase === 5) values.gdn_mode = 3
  else if (phase === 6) values.gdn_mode = 4
  else values.gdn_mode = 5

  if (prevValues) {
    values.ttt = Math.max(0, (prevValues.ttt ?? param('ttt').nominalCruise) - dt)
  }

  if (phase === 4 && prevValues) {
    values.loit_trem = Math.max(0, (prevValues.loit_trem ?? param('loit_trem').nominalCruise) - dt)
  } else if (prevValues) {
    values.loit_trem = prevValues.loit_trem ?? param('loit_trem').nominalCruise
  }

  // ════════════════════════════════════════════════
  // 14. WARHEAD / FUZING — gated by nav accuracy AND spoof detection
  // ════════════════════════════════════════════════
  const navAccurate = compositeConf > 0.6
  const spoofSafe = !spoofFlag // warhead blocked while spoofing detected

  if (phase <= 3) {
    values.arm_status = 0
    values.fuze_mode = 0
    values.imp_angle = 0
    values.term_vel = 0
  } else if (phase === 5) {
    values.arm_status = (navAccurate && spoofSafe) ? 1 : 0
    values.fuze_mode = (navAccurate && spoofSafe) ? 1 : 0
    values.imp_angle = 0
    values.term_vel = 0
  } else if (phase === 6) {
    values.arm_status = (navAccurate && spoofSafe) ? 2 : 1
    values.fuze_mode = (navAccurate && spoofSafe) ? 1 : 0
    values.imp_angle = Math.round(Math.abs(values.theta))
    values.term_vel = Math.round(values.ias * KT_TO_MS)
  } else if (phase === 7) {
    values.arm_status = 3
    values.fuze_mode = 1
    values.imp_angle = 70
    values.term_vel = Math.round(180 + jitter(simTime, 0.1, 5))
  }

  // ════════════════════════════════════════════════
  // 15. POWER
  // ════════════════════════════════════════════════
  values.ibus = 8 + throttle * 15 + Math.abs(values.servo_ipeak) * 2 + jitter(simTime, 0.1, 0.5)
  values.gen_v = phase === 0 ? 0 : 26.2 + throttle * 1.5 + jitter(simTime, 0.05, 0.2)
  if (prevValues) {
    const genPower = values.gen_v * values.ibus * 0.3
    const loadPower = values.vbus * values.ibus
    const netCharge = (genPower - loadPower) * 0.0001
    values.bat_soc = clamp((prevValues.bat_soc ?? 92) + netCharge * dt, 0, 100)
  }
  if (prevValues) {
    values.energy = (prevValues.energy ?? 0) + dt * values.vbus * values.ibus / 3600
  }

  // ════════════════════════════════════════════════
  // 16. VIBRATION — only from RPM and JAMMING maneuvers (not spoofing)
  // ════════════════════════════════════════════════
  const rpmFrac = values.eng_rpm / 8000
  // Spoofing doesn't cause autopilot hunting → no extra vibration
  const maneuverVib = jamDenial > 0.5 ? 0.5 * jamDenial : 0
  values.vib_x = 1.0 + rpmFrac * 3 + maneuverVib + jitter(simTime, 0.3, 0.5)
  values.vib_y = 0.8 + rpmFrac * 2.5 + maneuverVib + jitter(simTime, 0.28, 0.4)
  values.vib_z = 1.5 + rpmFrac * 4 + maneuverVib + jitter(simTime, 0.25, 0.6)

  // ════════════════════════════════════════════════
  // 17. DATALINK — degrades with distance + JAMMING only (not spoofing)
  //     Spoofing targets L-band GNSS, not C/S-band datalink
  // ════════════════════════════════════════════════
  const distFromGcs = distToTarget
  const rangeFrac = Math.min(1, distFromGcs / 200)
  const jamDl = isJamming ? 15 : 0
  values.ul_rssi = -55 - rangeFrac * 40 - jamDl + jitter(simTime, 0.12, 2)
  values.dl_rssi = -50 - rangeFrac * 35 - jamDl + jitter(simTime, 0.11, 2)
  values.link_qual = Math.round(95 - rangeFrac * 30 - (isJamming ? 25 : 0) + jitter(simTime, 0.08, 2))
  values.rtt = Math.round(60 + rangeFrac * 200 + (isJamming ? 150 : 0) + jitter(simTime, 0.1, 10))
  values.dl_rate = Math.round(3200 - rangeFrac * 1800 - (isJamming ? 1200 : 0) + jitter(simTime, 0.07, 50))
  values.dl_range = Math.round(distFromGcs)

  if (isJamming && values.link_qual < 40) {
    values.link_status = values.link_qual < 20 ? 0 : 1
  }
  // Spoofing: datalink unaffected (correct — different frequency band)

  // ════════════════════════════════════════════════
  // 18. PAYLOAD
  // ════════════════════════════════════════════════
  if (phase >= 5) {
    values.trk_status = phase === 6 ? 2 : 1
    values.trk_conf = phase === 6 ? Math.round(75 + jitter(simTime, 0.1, 10)) : Math.round(40 + jitter(simTime, 0.08, 8))
    values.gmb_el = phase === 6 ? clamp(-60 - values.theta * 0.3, -90, 15) : -45
    values.zoom = phase === 6 ? 20 + jitter(simTime, 0.05, 2) : 8
    values.sens_mode = 2
  }

  // ════════════════════════════════════════════════
  // FINAL: Clamp all
  // ════════════════════════════════════════════════
  for (const p of TELEMETRY_PARAMS) {
    if (p.format === 'int' || p.format === 'enum' || p.format === 'bool') {
      values[p.id] = Math.round(clamp(values[p.id], p.min, p.max))
    } else {
      values[p.id] = clamp(values[p.id], p.min, p.max)
    }
  }

  return values
}

function generateParamValue(p: TelemetryParamDef, t: number): number {
  const freq = JITTER_FREQS[p.id] ?? 0.2
  const driftFreq = DRIFT_FREQS[p.id] ?? 0.01

  if (p.format === 'enum' || p.format === 'bool' || p.format === 'hex') {
    return p.nominalCruise
  }

  const range = p.max - p.min
  const jitterAmp = range * 0.005
  const driftAmp = range * 0.015

  const base = p.nominalCruise
  const j = Math.sin(t * freq * Math.PI * 2) * jitterAmp
  const d = Math.sin(t * driftFreq * Math.PI * 2) * driftAmp
  const h2 = Math.sin(t * freq * 1.73 * Math.PI * 2) * jitterAmp * 0.3

  return base + j + d + h2
}

function jitter(t: number, freq: number, amp: number): number {
  return Math.sin(t * freq * Math.PI * 2) * amp
}

function param(id: string): TelemetryParamDef {
  return TELEMETRY_PARAM_MAP[id]
}

// Pre-launch idle telemetry — engines off, on rail, GPS acquiring
function generateIdleTelemetry(simTime: number): Record<string, number> {
  const values: Record<string, number> = {}
  for (const p of TELEMETRY_PARAMS) {
    if (p.format === 'enum' || p.format === 'bool' || p.format === 'hex') {
      values[p.id] = p.nominalCruise
    } else {
      values[p.id] = 0
    }
  }
  // Static position at origin
  values.lat = ORIGIN_LAT
  values.lon = ORIGIN_LON
  values.alt_msl = 220 // ground elevation
  values.alt_agl = 0
  values.alt_gps = 220
  values.palt = 220
  values.flt_phase = 0 // PRE_LCH
  values.gdn_mode = 0  // MANUAL
  values.nav_mode = 3   // INS+GPS
  values.gps_nsat = 12
  values.gps_fix = 4
  values.hdop = 1.1
  values.arm_status = 0 // SAFE
  values.fuze_mode = 0  // SAFE
  values.whd_cont = 1
  values.safety_il = 255
  values.link_status = 2 // NOMINAL
  values.link_qual = 98
  values.bat_soc = 100
  values.vbus = 25.4 + jitter(simTime, 0.05, 0.1)
  values.oat = 32
  values.p_static = 1013
  values.fuel_rem = 18
  values.fuel_pct = 100
  return values
}

// Landed/captured telemetry — engines off, on ground at origin
function generateLandedTelemetry(prevValues: Record<string, number> | null): Record<string, number> {
  const values: Record<string, number> = {}
  for (const p of TELEMETRY_PARAMS) {
    if (p.format === 'enum' || p.format === 'bool' || p.format === 'hex') {
      values[p.id] = p.nominalCruise
    } else {
      values[p.id] = 0
    }
  }
  values.lat = prevValues?.lat ?? ORIGIN_LAT
  values.lon = prevValues?.lon ?? ORIGIN_LON
  values.alt_msl = 220
  values.alt_agl = 0
  values.flt_phase = 0
  values.gdn_mode = 0
  values.nav_mode = 3
  values.gps_nsat = 12
  values.gps_fix = 4
  values.hdop = 1.0
  values.arm_status = 0
  values.fuze_mode = 0
  values.whd_cont = 1
  values.safety_il = 255
  values.link_status = 2
  values.link_qual = 98
  values.bat_soc = prevValues?.bat_soc ?? 50
  values.fuel_rem = prevValues?.fuel_rem ?? 5
  values.fuel_pct = (values.fuel_rem / 18) * 100
  values.vbus = 25.2
  values._landed = 1
  return values
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
