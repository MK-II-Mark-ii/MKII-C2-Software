import icomesh from 'icomesh'

export interface IcoSphereResult {
  /** Flat Float32Array of [x,y,z,...] positions on unit sphere */
  positions: Float32Array
  /** Triangle indices */
  triangles: Uint32Array
  /** Number of unique vertices */
  vertexCount: number
}

/**
 * Generate uniformly distributed points on a unit sphere using icosphere subdivision.
 * order 2 → 162, order 3 → 642, order 4 → 2562, order 5 → 10242
 */
export function generateIcoSphere(order: number): IcoSphereResult {
  const { vertices, triangles } = icomesh(order)
  return {
    positions: vertices,
    triangles: new Uint32Array(triangles),
    vertexCount: vertices.length / 3,
  }
}

/**
 * Extract wireframe edges from triangle indices (deduplicated).
 */
export function extractWireframeEdges(triangles: Uint32Array): Uint32Array {
  const edgeSet = new Set<string>()
  const edges: number[] = []

  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i]
    const b = triangles[i + 1]
    const c = triangles[i + 2]

    for (const [v0, v1] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const key = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push(v0, v1)
      }
    }
  }

  return new Uint32Array(edges)
}

/**
 * 5 algorithm axes: 1 top pole + 4 equally spaced at 90° azimuthal intervals.
 * Bottom 4 sit at polar angle ~109.47° from top (tetrahedral angle, y = -1/3).
 * All directions are unit vectors on the sphere.
 */
const R = 0.9428 // sin(arccos(-1/3)) = 2√2/3, radius in xz-plane at y = -1/3
export const ALGORITHM_AXES: { name: string; dir: [number, number, number] }[] = [
  { name: 'INS',  dir: [0, 1, 0] },               // top pole
  { name: 'GNSS', dir: [R, -0.3333, 0] },          // +X  (0°)
  { name: 'TER',  dir: [0, -0.3333, R] },           // +Z  (90°)
  { name: 'MAG',  dir: [-R, -0.3333, 0] },          // -X  (180°)
  { name: 'SCN',  dir: [0, -0.3333, -R] },          // -Z  (270°)
]

/**
 * For each vertex on the icosphere, find which algorithm axis it's closest to.
 * Returns an array of axis indices (0-4), one per vertex.
 */
export function assignVerticesToAxes(positions: Float32Array, vertexCount: number): Uint8Array {
  const assignments = new Uint8Array(vertexCount)

  for (let i = 0; i < vertexCount; i++) {
    const vx = positions[i * 3]
    const vy = positions[i * 3 + 1]
    const vz = positions[i * 3 + 2]

    let bestDot = -Infinity
    let bestAxis = 0

    for (let a = 0; a < ALGORITHM_AXES.length; a++) {
      const [ax, ay, az] = ALGORITHM_AXES[a].dir
      const dot = vx * ax + vy * ay + vz * az
      if (dot > bestDot) {
        bestDot = dot
        bestAxis = a
      }
    }

    assignments[i] = bestAxis
  }

  return assignments
}

/**
 * Compute how close each vertex is to its assigned axis (0-1).
 * 1 = exactly on axis, 0 = at the boundary between regions.
 * Used for smooth interpolation of confidence values.
 */
export function computeAxisProximity(
  positions: Float32Array,
  assignments: Uint8Array,
  vertexCount: number,
): Float32Array {
  const proximity = new Float32Array(vertexCount)

  for (let i = 0; i < vertexCount; i++) {
    const vx = positions[i * 3]
    const vy = positions[i * 3 + 1]
    const vz = positions[i * 3 + 2]
    const axis = ALGORITHM_AXES[assignments[i]].dir

    // dot product with unit vectors = cosine of angle
    const dot = vx * axis[0] + vy * axis[1] + vz * axis[2]
    // Remap: dot ranges ~0.3 (boundary) to 1.0 (on axis) → 0..1
    proximity[i] = Math.max(0, Math.min(1, (dot - 0.2) / 0.8))
  }

  return proximity
}
