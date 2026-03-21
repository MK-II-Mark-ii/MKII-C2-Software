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

import type { MissionFlowState, EngagementConfig } from '../stores/uiStore'

// ── Constants ──
// ── Launch site ──
const ORIGIN_LAT = 26.9167
const ORIGIN_LON = 70.9000

// ── Physical constants ──
const KT_TO_MS = 0.514444          // knots → m/s
const G = 9.81                      // gravitational acceleration m/s²
const DEG_PER_KM = 1 / 111.32      // approx degrees latitude per km

// ── Flight envelope (Shahed-136 class LM) ──
const MAX_BANK_DEG = 20             // max coordinated bank angle
const CRUISE_IAS_KT = 95            // cruise indicated airspeed
const TERRAIN_ELEV_M = 220          // average terrain elevation in AO
// ── Loiter parameters ──
const LOITER_RADIUS_KM = 2.5        // orbit radius around target
const LOITER_LEAD_ANGLE_DEG = 20    // pursuit-point lead angle on orbit
// ── Engagement parameters ──
const ENGAGE_HEADING_TOL_DEG = 10   // heading alignment tolerance for inbound commit
const RTH_LANDING_DIST_KM = 2       // distance from origin to trigger landing
const IMPACT_ALT_M = 5              // altitude threshold for impact detection

// ── Phase timing (sim seconds) ──
const PHASE_PRELAUNCH_END_S = 3
const PHASE_LAUNCH_END_S = 12
const PHASE_CLIMB_END_S = 45

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
  engageCfg?: EngagementConfig,
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
  if (prevValues && Math.round(prevValues.flt_phase ?? 0) === 7 && (flow === 'LAUNCHED' || flow === 'TERMINAL' || flow === 'ENGAGING')) {
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
    frozen.theta = prevValues.theta ?? -(engageCfg?.diveAngle ?? 45)
    frozen.phi = 0
    frozen.roll_rate = 0
    frozen.pitch_rate = 0
    frozen.g_load = 0
    frozen.vib_x = 0
    frozen.vib_y = 0
    frozen.vib_z = 0
    frozen.gen_v = 0
    frozen.wpt_dist = 0
    frozen.term_vel = Math.round((engageCfg?.terminalSpeed ?? 150) * KT_TO_MS)
    frozen.imp_angle = Math.round(Math.abs(prevValues.theta ?? 70))
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
  if (isRTH && distToTarget < RTH_LANDING_DIST_KM) {
    values._landed = 1
    return generateLandedTelemetry(prevValues)
  }

  // ════════════════════════════════════════════════
  // 2. FLIGHT PHASE — driven by missionFlow state machine
  // ════════════════════════════════════════════════
  let phase: number
  if (isRTH) {
    phase = 3 // CRUISE (returning home)
  } else if (flow === 'LOITERING') {
    phase = 4 // LOITER — orbiting target
  } else if (flow === 'ENGAGING') {
    phase = 5 // INGRESS — positioning for attack
  } else if (flow === 'TERMINAL') {
    phase = 6 // TERMINAL — diving
  } else if (simTime < PHASE_PRELAUNCH_END_S) phase = 0
  else if (simTime < PHASE_LAUNCH_END_S) phase = 1
  else if (simTime < PHASE_CLIMB_END_S) phase = 2
  else phase = 3 // CRUISE until loiter is triggered by proximity check in useSimulation
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
    values.alt_agl = Math.max(0, values.alt_msl - TERRAIN_ELEV_M)
  } else if (phase === 2) {
    targetThrottle = 82 + jitter(simTime, 0.08, 2)
    targetPitch = 12 + jitter(simTime, 0.1, 2)
    targetIas = 85 + jitter(simTime, 0.06, 2)
    values.vs = 6 + jitter(simTime, 0.1, 1.5)
    values.alt_msl = prevValues ? Math.min(2000, prevAlt + dt * values.vs) : 800
    values.alt_agl = Math.max(0, values.alt_msl - TERRAIN_ELEV_M)
  } else if (phase === 3) {
    // CRUISE: level flight toward target
    targetThrottle = 55 + jitter(simTime, 0.05, 2)
    targetPitch = -2 + jitter(simTime, 0.08, 0.6)
    targetIas = 95 + jitter(simTime, 0.04, 2)
    values.vs = jitter(simTime, 0.05, 0.4)
    values.alt_msl = 2000 + jitter(simTime, 0.02, 12)
    values.alt_agl = Math.max(0, values.alt_msl - TERRAIN_ELEV_M)

    if (jamDenial > 0.5) {
      values.alt_msl += jitter(simTime, 0.08, 25 * jamDenial)
      values.vs += jitter(simTime, 0.12, 2 * jamDenial)
      targetPitch += jitter(simTime, 0.1, 1.5 * jamDenial)
    }
    if (spoofDetected && prevValues) {
      const timeSinceDetect = simTime - (prevValues._spoofDetectTime ?? simTime)
      if (timeSinceDetect < 5) {
        const transientFade = Math.exp(-timeSinceDetect * 0.5)
        targetPitch += 3 * Math.sin(timeSinceDetect * 2) * transientFade
        values.alt_msl += -15 * transientFade
        values.vs += -2 * transientFade
      }
    }
  } else if (phase === 4) {
    // LOITER: circular orbit around target at 2.5km radius
    // Method: pursuit-point — compute a point on the ideal circle ~20° ahead
    // of the LM's current angular position, then steer toward it
    const LOITER_RADIUS_DEG = LOITER_RADIUS_KM * DEG_PER_KM

    // Angle from target center to current LM position
    const dLatT = curLat - TGT_LAT
    const dLonT = (curLon - TGT_LON) * Math.cos(TGT_LAT * Math.PI / 180)
    const currentAngle = Math.atan2(dLonT, dLatT) // radians from N

    // Pursuit point: 20° ahead on the circle (clockwise = right-hand orbit)
    const leadAngle = currentAngle + (LOITER_LEAD_ANGLE_DEG * Math.PI / 180)
    const pursuitLat = TGT_LAT + LOITER_RADIUS_DEG * Math.cos(leadAngle)
    const pursuitLon = TGT_LON + (LOITER_RADIUS_DEG / Math.cos(TGT_LAT * Math.PI / 180)) * Math.sin(leadAngle)

    // Bearing from current position to pursuit point
    const pDLon = (pursuitLon - curLon) * Math.PI / 180
    const pLat2 = pursuitLat * Math.PI / 180
    const pY = Math.sin(pDLon) * Math.cos(pLat2)
    const pX = Math.cos(lat1) * Math.sin(pLat2) - Math.sin(lat1) * Math.cos(pLat2) * Math.cos(pDLon)
    values._loiterBearing = ((Math.atan2(pY, pX) * 180 / Math.PI) + 360) % 360

    // Maintain orbit altitude at configured engagement altitude
    const engAlt = engageCfg?.engageAltitude ?? 2000
    targetThrottle = 55 + jitter(simTime, 0.05, 2)
    targetPitch = -1 + jitter(simTime, 0.06, 0.4)
    targetIas = 90 + jitter(simTime, 0.04, 2)
    values.vs = jitter(simTime, 0.04, 0.3)
    if (prevValues) {
      const altError = engAlt - prevAlt
      values.alt_msl = prevAlt + clamp(altError * 0.1, -3, 3) * dt + jitter(simTime, 0.02, 5)
    } else {
      values.alt_msl = engAlt
    }
    values.alt_agl = Math.max(0, values.alt_msl - TERRAIN_ELEV_M)
  } else if (phase === 5) {
    // ═══════════════════════════════════════════════════════════
    // ENGAGING — Inbound attack run
    //
    // The LM has already been positioned by the LOITERING phase.
    // When ENGAGE was pressed, useSimulation kept the LM in LOITERING
    // until it reached the correct angular position on the orbit
    // (opposite the attack bearing). Then it transitioned to ENGAGING.
    //
    // At this point the LM just needs to:
    //   1. Fly on the attack bearing toward the target
    //   2. Maintain engagement altitude
    //   3. When at dive start distance → ready for terminal
    // ═══════════════════════════════════════════════════════════
    const engAlt = engageCfg?.engageAltitude ?? 1500
    const attackBrg = engageCfg?.attackBearing ?? 0
    const diveAngle = engageCfg?.diveAngle ?? 45
    const diveAngleRad = diveAngle * Math.PI / 180

    // Geometric dive start distance including VS ramp overshoot
    const diveStartDistM = engAlt / Math.tan(diveAngleRad)
    const termSpeedMs = (engageCfg?.terminalSpeed ?? 150) * KT_TO_MS
    const rampTime = (termSpeedMs * Math.sin(diveAngleRad)) / 8
    const rampOvershootM = termSpeedMs * Math.cos(diveAngleRad) * rampTime * 0.5
    const diveStartDistKm = (diveStartDistM + rampOvershootM) / 1000

    // Inbound heading: attack FROM attackBrg means fly TOWARD target on (attackBrg + 180°)
    // e.g. attack from N (0°) → fly south (180°) toward target
    const inboundHeading = (attackBrg + 180) % 360
    values._engageBearing = inboundHeading

    // Heading alignment check
    const curHeading = prevValues?.psi ?? inboundHeading
    let alignError = inboundHeading - curHeading
    if (alignError > 180) alignError -= 360
    if (alignError < -180) alignError += 360

    // Ready for terminal at geometric dive start point
    if (distToTarget <= diveStartDistKm && Math.abs(alignError) < ENGAGE_HEADING_TOL_DEG) {
      values._readyForTerminal = 1
    }

    // Flight dynamics for inbound run
    targetThrottle = 75 + jitter(simTime, 0.06, 2)
    targetPitch = -2 + jitter(simTime, 0.08, 0.4)
    targetIas = 110 + jitter(simTime, 0.04, 2)

    // Maintain engagement altitude
    if (prevValues) {
      const altErr = engAlt - prevAlt
      values.alt_msl = prevAlt + clamp(altErr * 0.12, -4, 4) * dt
    } else {
      values.alt_msl = engAlt
    }
    values.vs = prevValues ? (values.alt_msl - prevAlt) / (dt || 0.01) : 0
    values.alt_agl = Math.max(0, values.alt_msl - TERRAIN_ELEV_M)
  } else if (phase === 6) {
    // ═══════════════════════════════════════════════════════════
    // TERMINAL DIVE — constant flight-path-angle dive
    //
    // Physics:
    //   Flight path angle: γ (configured diveAngle)
    //   Horizontal speed: V_h = V * cos(γ)
    //   Vertical speed:   V_v = -V * sin(γ)
    //   Pitch angle:      θ = -γ
    //
    //   Time to impact from h₀: t = h₀ / (V * sin(γ))
    //   e.g. γ=45°, h₀=1500m, V=77m/s → t=27.5s
    // ═══════════════════════════════════════════════════════════
    const cfgDiveAngle = engageCfg?.diveAngle ?? 45
    const cfgTermSpeedKt = engageCfg?.terminalSpeed ?? 150
    const cfgTermSpeedMs = cfgTermSpeedKt * KT_TO_MS
    const startAlt = engageCfg?.engageAltitude ?? 1500
    const prevTermAlt = prevValues?.alt_msl ?? startAlt
    const diveRad = cfgDiveAngle * Math.PI / 180

    // Target vertical speed from geometry
    const targetVs = -cfgTermSpeedMs * Math.sin(diveRad)

    // Smooth VS ramp — limit acceleration to 8 m/s² for realistic pushover
    const prevVs = prevValues?.vs ?? 0
    const maxVsAccel = 8 // m/s² — realistic for a pushover maneuver
    const vsError = targetVs - prevVs
    values.vs = prevVs + clamp(vsError, -maxVsAccel * dt, maxVsAccel * dt)

    // Altitude from integrated VS
    values.alt_msl = Math.max(0, prevTermAlt + values.vs * dt)
    values.alt_agl = Math.max(0, values.alt_msl - TERRAIN_ELEV_M)

    // Pitch = dive angle (constant during dive)
    targetPitch = -cfgDiveAngle + jitter(simTime, 0.1, 1)
    // Throttle: high to maintain terminal speed
    targetThrottle = 90 + jitter(simTime, 0.05, 2)
    // IAS ramps toward terminal speed
    const prevIasLocal = prevValues?.ias ?? CRUISE_IAS_KT
    targetIas = prevIasLocal + (cfgTermSpeedKt - prevIasLocal) * Math.min(1, dt * 0.5)

    // Impact detection
    if (values.alt_msl <= IMPACT_ALT_M) {
      values.flt_phase = 7
    }
  } else {
    // POST_MSN: impact
    targetThrottle = 0
    targetPitch = -(engageCfg?.diveAngle ?? 70)
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
  const maxBankDeg = MAX_BANK_DEG
  const maxBankRad = maxBankDeg * Math.PI / 180
  // Max turn rate = g * tan(bank) / V (rad/s) → convert to deg/s
  const maxTurnRate = vMs > 5 ? (G * Math.tan(maxBankRad) / vMs) * 180 / Math.PI : 3

  // Desired heading = bearing to target (with noise)
  let headingNoise = jitter(simTime, 0.02, 0.3)
  if (jamDenial > 0.5) headingNoise += jitter(simTime, 0.005, 1.5 * jamDenial)
  if (spoofActive && !spoofDetected) headingNoise += jitter(simTime, 0.003, 0.2)
  else if (spoofDetected) headingNoise += jitter(simTime, 0.008, 0.8)

  // In loiter, fly tangent to orbit circle; in engaging, approach from attack bearing
  let targetBearing = bearing // default: fly toward target/home
  if (phase === 4 && values._loiterBearing !== undefined) {
    // LOITER: fly tangent to orbit with radius correction
    targetBearing = values._loiterBearing
  } else if (flow === 'ENGAGING' && values._engageBearing !== undefined) {
    // ENGAGING: fly to IP then inbound on attack bearing
    targetBearing = values._engageBearing
  } else if (flow === 'TERMINAL') {
    // TERMINAL: proportional navigation — steer toward actual target position
    // The attack bearing established the approach direction, but during dive
    // the guidance must correct for any lateral offset to hit the target precisely
    targetBearing = bearing // great-circle bearing to target = guaranteed impact
  }
  const desiredHeading = (targetBearing + headingNoise + 360) % 360

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
    const altDivergence = Math.min(500, spoofDuration * 2.5) // grows at 2.5 m/s, caps at 500m
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
    values.imp_angle = engageCfg?.diveAngle ?? 45
    values.term_vel = Math.round((engageCfg?.terminalSpeed ?? 150) * KT_TO_MS)
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
  // 18. PAYLOAD — EO/IR sensors activate for:
  //   a) Terminal engagement (phase >= 5) — target acquisition
  //   b) Scene Matching navigation (during GPS denial) — terrain/feature matching
  //   c) TERCOM correlation (during GPS denial) — terrain profile scanning
  // ════════════════════════════════════════════════
  // GPS denial detected from both fault state AND technique health (belt and suspenders)
  const gnssHealth = techniques?.GNSS?.health_status
  const gpsDenied = isJamming || isSpoofing ||
    gnssHealth === 'DENIED' || gnssHealth === 'SPOOFED' || gnssHealth === 'DEGRADED'

  if (phase >= 5) {
    // Terminal engagement — full sensor activation for target tracking
    values.sens_mode = phase === 6 ? 3 : 2   // IR_NFOV in terminal, IR_WFOV in ingress
    values.trk_status = phase === 6 ? 2 : 1  // TRACKING / ACQUIRING
    values.trk_conf = phase === 6
      ? Math.round(75 + jitter(simTime, 0.1, 10))
      : Math.round(40 + jitter(simTime, 0.08, 8))
    values.gmb_el = phase === 6 ? clamp(-60 - values.theta * 0.3, -90, 15) : -45
    values.zoom = phase === 6 ? 20 + jitter(simTime, 0.05, 2) : 8
    values.lrf_range = Math.round(values.alt_agl + jitter(simTime, 0.1, 10))
  } else if (gpsDenied && phase >= 2) {
    // ── GPS DENIED during cruise/loiter ──
    // Scene Matching (DSMAC) activates: EO/IR scans terrain features for visual navigation
    // TERCOM activates: radar altimeter profiles terrain against stored DEM
    values.sens_mode = 2                     // IR_WFOV — wide field for terrain feature scanning
    values.gmb_el = -80 + jitter(simTime, 0.04, 4) // near-nadir for terrain correlation
    values.zoom = 8 + jitter(simTime, 0.03, 1)     // wider zoom for scene matching FOV
    values.trk_status = 1                    // ACQUIRING — actively scanning terrain features
    values.trk_conf = Math.round(60 + jitter(simTime, 0.07, 15)) // terrain-dependent confidence
    values.lrf_range = Math.round(values.alt_agl + jitter(simTime, 0.15, 25)) // laser rangefinder for TERCOM
    // Gimbal azimuth sweeps to scan terrain features
    values.gmb_az = jitter(simTime, 0.08, 15) // slow sweep ±15°
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
