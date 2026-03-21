// ── Loitering Munition Telemetry Data Types ──

export type TelemetryCategory =
  | 'FLIGHT'
  | 'PROPULSION'
  | 'NAVIGATION'
  | 'GUIDANCE'
  | 'DATALINK'
  | 'PAYLOAD'
  | 'POWER'
  | 'ENVIRONMENT'
  | 'STRUCTURAL'
  | 'WARHEAD'

export interface TelemetryParamDef {
  id: string
  label: string
  shortLabel: string
  unit: string
  min: number
  max: number
  nominalCruise: number
  category: TelemetryCategory
  format?: 'int' | 'float1' | 'float2' | 'float4' | 'enum' | 'bool' | 'hex'
  enumLabels?: string[]
  warningLow?: number
  warningHigh?: number
  criticalLow?: number
  criticalHigh?: number
}

export interface TelemetrySnapshot {
  timestamp: number // simulation seconds
  values: Record<string, number>
}

export const TELEMETRY_CATEGORIES: { id: TelemetryCategory; label: string; color: string }[] = [
  { id: 'FLIGHT', label: 'Flight Dynamics', color: '#00E5FF' },
  { id: 'PROPULSION', label: 'Propulsion', color: '#FF6B35' },
  { id: 'NAVIGATION', label: 'Navigation', color: '#378ADD' },
  { id: 'GUIDANCE', label: 'Guidance', color: '#00FF88' },
  { id: 'DATALINK', label: 'Datalink', color: '#5B9BD5' },
  { id: 'PAYLOAD', label: 'EO/IR Payload', color: '#D4B86A' },
  { id: 'POWER', label: 'Power Systems', color: '#FFB800' },
  { id: 'ENVIRONMENT', label: 'Environment', color: '#80F0FF' },
  { id: 'STRUCTURAL', label: 'Structural', color: '#8899AA' },
  { id: 'WARHEAD', label: 'Warhead / Fuzing', color: '#E24B4A' },
]

// ── 90 Parameter Definitions ──

export const TELEMETRY_PARAMS: TelemetryParamDef[] = [
  // ── FLIGHT DYNAMICS (12) ──
  { id: 'ias', label: 'Indicated Airspeed', shortLabel: 'IAS', unit: 'kt', min: 0, max: 250, nominalCruise: 95, category: 'FLIGHT', format: 'int', warningLow: 60, criticalLow: 45, warningHigh: 200, criticalHigh: 230 },
  { id: 'tas', label: 'True Airspeed', shortLabel: 'TAS', unit: 'kt', min: 0, max: 280, nominalCruise: 102, category: 'FLIGHT', format: 'int' },
  { id: 'mach', label: 'Mach Number', shortLabel: 'MACH', unit: '', min: 0, max: 0.55, nominalCruise: 0.15, category: 'FLIGHT', format: 'float2' },
  { id: 'alt_msl', label: 'Altitude MSL', shortLabel: 'MSL', unit: 'm', min: 0, max: 5000, nominalCruise: 2000, category: 'FLIGHT', format: 'int', warningLow: 200, criticalLow: 50 },
  { id: 'alt_agl', label: 'Altitude AGL', shortLabel: 'AGL', unit: 'm', min: 0, max: 5000, nominalCruise: 1500, category: 'FLIGHT', format: 'int', warningLow: 100, criticalLow: 30 },
  { id: 'vs', label: 'Vertical Speed', shortLabel: 'VS', unit: 'm/s', min: -80, max: 30, nominalCruise: 0, category: 'FLIGHT', format: 'float1' },
  { id: 'phi', label: 'Roll Angle', shortLabel: 'ROLL', unit: 'deg', min: -60, max: 60, nominalCruise: 0, category: 'FLIGHT', format: 'float1', warningHigh: 45, criticalHigh: 55 },
  { id: 'theta', label: 'Pitch Angle', shortLabel: 'PITCH', unit: 'deg', min: -90, max: 45, nominalCruise: -2, category: 'FLIGHT', format: 'float1' },
  { id: 'psi', label: 'Heading', shortLabel: 'HDG', unit: 'deg', min: 0, max: 360, nominalCruise: 220, category: 'FLIGHT', format: 'int' },
  { id: 'roll_rate', label: 'Roll Rate', shortLabel: 'P', unit: 'deg/s', min: -120, max: 120, nominalCruise: 0, category: 'FLIGHT', format: 'float1' },
  { id: 'pitch_rate', label: 'Pitch Rate', shortLabel: 'Q', unit: 'deg/s', min: -60, max: 60, nominalCruise: 0, category: 'FLIGHT', format: 'float1' },
  { id: 'g_load', label: 'Normal G-Load', shortLabel: 'Nz', unit: 'g', min: -1, max: 4, nominalCruise: 1.0, category: 'FLIGHT', format: 'float2', warningHigh: 3.0, criticalHigh: 3.5 },

  // ── PROPULSION (10) ──
  { id: 'eng_rpm', label: 'Engine RPM', shortLabel: 'RPM', unit: 'RPM', min: 0, max: 8500, nominalCruise: 6200, category: 'PROPULSION', format: 'int', warningHigh: 7800, criticalHigh: 8200, warningLow: 3000 },
  { id: 'eng_trq', label: 'Engine Torque', shortLabel: 'TRQ', unit: 'Nm', min: 0, max: 40, nominalCruise: 22, category: 'PROPULSION', format: 'float1' },
  { id: 'egt', label: 'Exhaust Gas Temp', shortLabel: 'EGT', unit: '\u00B0C', min: 0, max: 750, nominalCruise: 580, category: 'PROPULSION', format: 'int', warningHigh: 680, criticalHigh: 720 },
  { id: 'fuel_flow', label: 'Fuel Flow Rate', shortLabel: 'FF', unit: 'kg/hr', min: 0, max: 8, nominalCruise: 3.2, category: 'PROPULSION', format: 'float1' },
  { id: 'fuel_rem', label: 'Fuel Remaining', shortLabel: 'FUEL', unit: 'kg', min: 0, max: 18, nominalCruise: 14, category: 'PROPULSION', format: 'float1', warningLow: 4, criticalLow: 2 },
  { id: 'fuel_pct', label: 'Fuel Remaining %', shortLabel: 'FUEL%', unit: '%', min: 0, max: 100, nominalCruise: 78, category: 'PROPULSION', format: 'int', warningLow: 25, criticalLow: 12 },
  { id: 'oil_p', label: 'Oil Pressure', shortLabel: 'OILP', unit: 'kPa', min: 0, max: 600, nominalCruise: 380, category: 'PROPULSION', format: 'int', warningLow: 200, criticalLow: 100 },
  { id: 'oil_t', label: 'Oil Temperature', shortLabel: 'OILT', unit: '\u00B0C', min: -20, max: 150, nominalCruise: 85, category: 'PROPULSION', format: 'int', warningHigh: 120, criticalHigh: 140 },
  { id: 'thr_pos', label: 'Throttle Position', shortLabel: 'THR', unit: '%', min: 0, max: 100, nominalCruise: 55, category: 'PROPULSION', format: 'int' },
  { id: 'prop_pitch', label: 'Prop Pitch (Fixed)', shortLabel: 'PPCH', unit: 'deg', min: 28, max: 28, nominalCruise: 28, category: 'PROPULSION', format: 'int' },

  // ── NAVIGATION (12) ──
  { id: 'lat', label: 'Latitude', shortLabel: 'LAT', unit: 'deg', min: -90, max: 90, nominalCruise: 26.9167, category: 'NAVIGATION', format: 'float4' },
  { id: 'lon', label: 'Longitude', shortLabel: 'LON', unit: 'deg', min: -180, max: 180, nominalCruise: 70.9000, category: 'NAVIGATION', format: 'float4' },
  { id: 'alt_gps', label: 'GPS Altitude', shortLabel: 'GALT', unit: 'm', min: 0, max: 5000, nominalCruise: 2000, category: 'NAVIGATION', format: 'int' },
  { id: 'gs', label: 'Ground Speed', shortLabel: 'GS', unit: 'kt', min: 0, max: 220, nominalCruise: 98, category: 'NAVIGATION', format: 'int' },
  { id: 'trk', label: 'Ground Track', shortLabel: 'TRK', unit: 'deg', min: 0, max: 360, nominalCruise: 220, category: 'NAVIGATION', format: 'int' },
  { id: 'hdg_mag', label: 'Magnetic Heading', shortLabel: 'MHDG', unit: 'deg', min: 0, max: 360, nominalCruise: 271, category: 'NAVIGATION', format: 'int' },
  { id: 'wind_spd', label: 'Wind Speed', shortLabel: 'WIND', unit: 'kt', min: 0, max: 60, nominalCruise: 12, category: 'NAVIGATION', format: 'int' },
  { id: 'wind_dir', label: 'Wind Direction', shortLabel: 'WDIR', unit: 'deg', min: 0, max: 360, nominalCruise: 315, category: 'NAVIGATION', format: 'int' },
  { id: 'gps_fix', label: 'GPS Fix Quality', shortLabel: 'FIX', unit: '', min: 0, max: 5, nominalCruise: 4, category: 'NAVIGATION', format: 'enum', enumLabels: ['NONE', 'SPS', 'DGPS', 'PPS', 'RTK_FIX', 'RTK_FLT'] },
  { id: 'gps_nsat', label: 'GPS Satellites', shortLabel: 'NSAT', unit: '', min: 0, max: 24, nominalCruise: 12, category: 'NAVIGATION', format: 'int', warningLow: 6, criticalLow: 4 },
  { id: 'hdop', label: 'HDOP', shortLabel: 'HDOP', unit: '', min: 0.5, max: 25, nominalCruise: 1.2, category: 'NAVIGATION', format: 'float1', warningHigh: 4, criticalHigh: 8 },
  { id: 'nav_mode', label: 'Navigation Mode', shortLabel: 'NMOD', unit: '', min: 0, max: 4, nominalCruise: 3, category: 'NAVIGATION', format: 'enum', enumLabels: ['DEAD_RECK', 'GPS_ONLY', 'INS_ONLY', 'INS+GPS', 'VIS_NAV'] },

  // ── GUIDANCE (10) ──
  { id: 'wpt_idx', label: 'Active Waypoint', shortLabel: 'WPT', unit: '', min: 0, max: 99, nominalCruise: 3, category: 'GUIDANCE', format: 'int' },
  { id: 'wpt_dist', label: 'Dist to Waypoint', shortLabel: 'WDST', unit: 'm', min: 0, max: 600000, nominalCruise: 500000, category: 'GUIDANCE', format: 'int' },
  { id: 'wpt_brg', label: 'Bearing to Waypoint', shortLabel: 'WBRG', unit: 'deg', min: 0, max: 360, nominalCruise: 220, category: 'GUIDANCE', format: 'int' },
  { id: 'xte', label: 'Cross-Track Error', shortLabel: 'XTE', unit: 'm', min: -500, max: 500, nominalCruise: 0, category: 'GUIDANCE', format: 'float1', warningHigh: 200, warningLow: -200 },
  { id: 'ttw', label: 'Time to Waypoint', shortLabel: 'TTW', unit: 's', min: 0, max: 36000, nominalCruise: 300, category: 'GUIDANCE', format: 'int' },
  { id: 'ttt', label: 'Time to Target', shortLabel: 'TTT', unit: 's', min: 0, max: 36000, nominalCruise: 5400, category: 'GUIDANCE', format: 'int' },
  { id: 'loit_r', label: 'Loiter Radius', shortLabel: 'LRAD', unit: 'm', min: 200, max: 5000, nominalCruise: 1500, category: 'GUIDANCE', format: 'int' },
  { id: 'loit_trem', label: 'Loiter Time Remaining', shortLabel: 'LTREM', unit: 's', min: 0, max: 21600, nominalCruise: 10800, category: 'GUIDANCE', format: 'int' },
  { id: 'gdn_mode', label: 'Guidance Mode', shortLabel: 'GMOD', unit: '', min: 0, max: 5, nominalCruise: 1, category: 'GUIDANCE', format: 'enum', enumLabels: ['MANUAL', 'WAYPOINT', 'LOITER', 'INGRESS', 'TERMINAL', 'ABORT'] },
  { id: 'flt_phase', label: 'Flight Phase', shortLabel: 'PHASE', unit: '', min: 0, max: 7, nominalCruise: 3, category: 'GUIDANCE', format: 'enum', enumLabels: ['PRE_LCH', 'LAUNCH', 'CLIMB', 'CRUISE', 'LOITER', 'INGRESS', 'TERMINAL', 'POST_MSN'] },

  // ── DATALINK (8) ──
  { id: 'ul_rssi', label: 'Uplink RSSI', shortLabel: 'ULRS', unit: 'dBm', min: -110, max: -20, nominalCruise: -65, category: 'DATALINK', format: 'int', warningLow: -90, criticalLow: -100 },
  { id: 'dl_rssi', label: 'Downlink RSSI', shortLabel: 'DLRS', unit: 'dBm', min: -110, max: -20, nominalCruise: -60, category: 'DATALINK', format: 'int', warningLow: -85, criticalLow: -95 },
  { id: 'link_qual', label: 'Link Quality', shortLabel: 'LQAL', unit: '%', min: 0, max: 100, nominalCruise: 92, category: 'DATALINK', format: 'int', warningLow: 60, criticalLow: 30 },
  { id: 'rtt', label: 'Round-Trip Latency', shortLabel: 'RTT', unit: 'ms', min: 20, max: 2000, nominalCruise: 85, category: 'DATALINK', format: 'int', warningHigh: 500, criticalHigh: 1000 },
  { id: 'dl_rate', label: 'Downlink Rate', shortLabel: 'DLRT', unit: 'kbps', min: 0, max: 4000, nominalCruise: 2400, category: 'DATALINK', format: 'int' },
  { id: 'ul_rate', label: 'Uplink Rate', shortLabel: 'ULRT', unit: 'kbps', min: 0, max: 256, nominalCruise: 64, category: 'DATALINK', format: 'int' },
  { id: 'dl_range', label: 'Datalink Range', shortLabel: 'DLRG', unit: 'km', min: 0, max: 200, nominalCruise: 45, category: 'DATALINK', format: 'int' },
  { id: 'link_status', label: 'Link Status', shortLabel: 'LSTS', unit: '', min: 0, max: 3, nominalCruise: 2, category: 'DATALINK', format: 'enum', enumLabels: ['LOST', 'DEGRADED', 'NOMINAL', 'EXCELLENT'] },

  // ── EO/IR PAYLOAD (10) ──
  { id: 'gmb_az', label: 'Gimbal Azimuth', shortLabel: 'GAZ', unit: 'deg', min: -180, max: 180, nominalCruise: 0, category: 'PAYLOAD', format: 'float1' },
  { id: 'gmb_el', label: 'Gimbal Elevation', shortLabel: 'GEL', unit: 'deg', min: -90, max: 15, nominalCruise: -45, category: 'PAYLOAD', format: 'float1' },
  { id: 'sens_mode', label: 'Sensor Mode', shortLabel: 'SMOD', unit: '', min: 0, max: 3, nominalCruise: 1, category: 'PAYLOAD', format: 'enum', enumLabels: ['OFF', 'EO_DAY', 'IR_WFOV', 'IR_NFOV'] },
  { id: 'zoom', label: 'Zoom Level', shortLabel: 'ZOOM', unit: 'x', min: 1, max: 30, nominalCruise: 4, category: 'PAYLOAD', format: 'float1' },
  { id: 'trk_status', label: 'Tracker Status', shortLabel: 'TSTS', unit: '', min: 0, max: 4, nominalCruise: 0, category: 'PAYLOAD', format: 'enum', enumLabels: ['IDLE', 'ACQUIRING', 'TRACKING', 'COAST', 'LOST'] },
  { id: 'trk_conf', label: 'Tracker Confidence', shortLabel: 'TCNF', unit: '%', min: 0, max: 100, nominalCruise: 0, category: 'PAYLOAD', format: 'int' },
  { id: 'lrf_range', label: 'Laser Range', shortLabel: 'LRF', unit: 'm', min: 0, max: 10000, nominalCruise: 0, category: 'PAYLOAD', format: 'int' },
  { id: 'tgt_lat', label: 'Target Latitude', shortLabel: 'TLAT', unit: 'deg', min: -90, max: 90, nominalCruise: 24.8359, category: 'PAYLOAD', format: 'float4' },
  { id: 'tgt_lon', label: 'Target Longitude', shortLabel: 'TLON', unit: 'deg', min: -180, max: 180, nominalCruise: 66.9832, category: 'PAYLOAD', format: 'float4' },
  { id: 'tgt_elev', label: 'Target Elevation', shortLabel: 'TELV', unit: 'm', min: -100, max: 5000, nominalCruise: 0, category: 'PAYLOAD', format: 'int' },

  // ── POWER SYSTEMS (8) ──
  { id: 'vbus', label: 'Main Bus Voltage', shortLabel: 'VBUS', unit: 'V', min: 18, max: 29.4, nominalCruise: 25.2, category: 'POWER', format: 'float1', warningLow: 21, criticalLow: 19 },
  { id: 'ibus', label: 'Main Bus Current', shortLabel: 'IBUS', unit: 'A', min: 0, max: 80, nominalCruise: 12, category: 'POWER', format: 'float1', warningHigh: 60, criticalHigh: 72 },
  { id: 'bat_soc', label: 'Battery SOC', shortLabel: 'SOC', unit: '%', min: 0, max: 100, nominalCruise: 92, category: 'POWER', format: 'int', warningLow: 25, criticalLow: 10 },
  { id: 'bat_temp', label: 'Battery Temperature', shortLabel: 'BTMP', unit: '\u00B0C', min: -20, max: 60, nominalCruise: 32, category: 'POWER', format: 'int', warningHigh: 50, criticalHigh: 55 },
  { id: 'vservo', label: 'Servo Bus Voltage', shortLabel: 'VSRV', unit: 'V', min: 4.5, max: 6.5, nominalCruise: 5.8, category: 'POWER', format: 'float1', warningLow: 5.0, criticalLow: 4.7 },
  { id: 'v_avion', label: 'Avionics Voltage', shortLabel: 'VAVX', unit: 'V', min: 3.0, max: 3.6, nominalCruise: 3.3, category: 'POWER', format: 'float2' },
  { id: 'energy', label: 'Energy Consumed', shortLabel: 'ENGY', unit: 'Wh', min: 0, max: 500, nominalCruise: 45, category: 'POWER', format: 'int' },
  { id: 'gen_v', label: 'Generator Output', shortLabel: 'GENV', unit: 'V', min: 0, max: 30, nominalCruise: 26.5, category: 'POWER', format: 'float1' },

  // ── ENVIRONMENT (6) ──
  { id: 'oat', label: 'Outside Air Temp', shortLabel: 'OAT', unit: '\u00B0C', min: -40, max: 55, nominalCruise: 5, category: 'ENVIRONMENT', format: 'int' },
  { id: 'palt', label: 'Pressure Altitude', shortLabel: 'PALT', unit: 'm', min: 0, max: 5000, nominalCruise: 2000, category: 'ENVIRONMENT', format: 'int' },
  { id: 'p_static', label: 'Static Pressure', shortLabel: 'PSTA', unit: 'hPa', min: 500, max: 1050, nominalCruise: 795, category: 'ENVIRONMENT', format: 'int' },
  { id: 'dalt', label: 'Density Altitude', shortLabel: 'DALT', unit: 'm', min: 0, max: 6000, nominalCruise: 2200, category: 'ENVIRONMENT', format: 'int' },
  { id: 'rh', label: 'Relative Humidity', shortLabel: 'RH', unit: '%', min: 0, max: 100, nominalCruise: 45, category: 'ENVIRONMENT', format: 'int' },
  { id: 'turb', label: 'Turbulence Index', shortLabel: 'TURB', unit: '', min: 0, max: 4, nominalCruise: 1, category: 'ENVIRONMENT', format: 'enum', enumLabels: ['NONE', 'LIGHT', 'MODERATE', 'SEVERE', 'EXTREME'] },

  // ── STRUCTURAL (8) ──
  { id: 'vib_x', label: 'Vibration X', shortLabel: 'VIBX', unit: 'm/s\u00B2', min: 0, max: 30, nominalCruise: 2.5, category: 'STRUCTURAL', format: 'float1', warningHigh: 15, criticalHigh: 25 },
  { id: 'vib_y', label: 'Vibration Y', shortLabel: 'VIBY', unit: 'm/s\u00B2', min: 0, max: 30, nominalCruise: 2.0, category: 'STRUCTURAL', format: 'float1', warningHigh: 15, criticalHigh: 25 },
  { id: 'vib_z', label: 'Vibration Z', shortLabel: 'VIBZ', unit: 'm/s\u00B2', min: 0, max: 40, nominalCruise: 3.5, category: 'STRUCTURAL', format: 'float1', warningHigh: 20, criticalHigh: 30 },
  { id: 'elev_pos', label: 'Elevator Position', shortLabel: 'ELEV', unit: 'deg', min: -25, max: 25, nominalCruise: -3, category: 'STRUCTURAL', format: 'float1' },
  { id: 'rud_pos', label: 'Rudder Position', shortLabel: 'RUD', unit: 'deg', min: -30, max: 30, nominalCruise: 0, category: 'STRUCTURAL', format: 'float1' },
  { id: 'ail_l_pos', label: 'Aileron L Position', shortLabel: 'AILL', unit: 'deg', min: -25, max: 25, nominalCruise: 0, category: 'STRUCTURAL', format: 'float1' },
  { id: 'ail_r_pos', label: 'Aileron R Position', shortLabel: 'AILR', unit: 'deg', min: -25, max: 25, nominalCruise: 0, category: 'STRUCTURAL', format: 'float1' },
  { id: 'servo_ipeak', label: 'Servo Peak Current', shortLabel: 'SIPK', unit: 'A', min: 0, max: 5, nominalCruise: 0.8, category: 'STRUCTURAL', format: 'float1', warningHigh: 3.5, criticalHigh: 4.5 },

  // ── WARHEAD / FUZING (6) ──
  { id: 'arm_status', label: 'Arm Status', shortLabel: 'ARM', unit: '', min: 0, max: 3, nominalCruise: 0, category: 'WARHEAD', format: 'enum', enumLabels: ['SAFE', 'ARM_CMD', 'ARMED', 'FUZE_EN'] },
  { id: 'fuze_mode', label: 'Fuze Mode', shortLabel: 'FUZE', unit: '', min: 0, max: 3, nominalCruise: 0, category: 'WARHEAD', format: 'enum', enumLabels: ['SAFE', 'CONTACT', 'PROXIMITY', 'DELAY'] },
  { id: 'imp_angle', label: 'Impact Angle', shortLabel: 'IMPA', unit: 'deg', min: 0, max: 90, nominalCruise: 0, category: 'WARHEAD', format: 'int' },
  { id: 'term_vel', label: 'Terminal Velocity', shortLabel: 'TVEL', unit: 'm/s', min: 0, max: 200, nominalCruise: 0, category: 'WARHEAD', format: 'int' },
  { id: 'whd_cont', label: 'Warhead Continuity', shortLabel: 'WCNT', unit: '', min: 0, max: 1, nominalCruise: 1, category: 'WARHEAD', format: 'bool' },
  { id: 'safety_il', label: 'Safety Interlocks', shortLabel: 'SAFE', unit: '', min: 0, max: 255, nominalCruise: 255, category: 'WARHEAD', format: 'hex' },
]

// Quick lookup
export const TELEMETRY_PARAM_MAP: Record<string, TelemetryParamDef> = Object.fromEntries(
  TELEMETRY_PARAMS.map((p) => [p.id, p]),
)
