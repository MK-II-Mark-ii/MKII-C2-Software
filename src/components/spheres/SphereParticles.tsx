import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  generateIcoSphere,
  ALGORITHM_AXES,
} from '../../three/geometries/IcoSpherePoints'
import { createSphereMaterial } from '../../three/materials/SphereMaterial'
import { useNavigationStore } from '../../stores/navigationStore'
import { getThreatConfidences, getResponseConfidences } from '../../hooks/useSphereConfidences'

// Muted axis colors — not neon
const AXIS_COLORS: [number, number, number][] = [
  [0.2, 0.7, 0.45],    // INS  — muted green
  [0.2, 0.6, 0.75],    // GNSS — muted teal
  [0.75, 0.55, 0.15],  // TER  — muted amber
  [0.6, 0.5, 0.35],    // MAG  — muted gold
  [0.35, 0.6, 0.7],    // SCN  — muted blue
]

interface SphereParticlesProps {
  /** 'threat' reads threat params, 'response' reads response params */
  mode: 'threat' | 'response'
  pointSize?: number
}

export default function SphereParticles({ mode, pointSize = 1.8 }: SphereParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const geometryRef = useRef<THREE.BufferGeometry>(null)

  // Order 3 = 642 points
  const icoSphere = useMemo(() => generateIcoSphere(3), [])
  const pointCount = icoSphere.vertexCount

  // Precompute per-point weights to all 5 axes for smooth spatial blending
  const axisWeights = useMemo(() => {
    const weights = new Float32Array(pointCount * 5)
    const sharpness = 4.0 // controls falloff — higher = tighter craters

    for (let i = 0; i < pointCount; i++) {
      const vx = icoSphere.positions[i * 3]
      const vy = icoSphere.positions[i * 3 + 1]
      const vz = icoSphere.positions[i * 3 + 2]

      let sumW = 0
      for (let a = 0; a < 5; a++) {
        const [ax, ay, az] = ALGORITHM_AXES[a].dir
        const dot = vx * ax + vy * ay + vz * az
        // Softmax-style: exp(sharpness * dot) gives smooth spatial blend
        const w = Math.exp(sharpness * dot)
        weights[i * 5 + a] = w
        sumW += w
      }
      // Normalize
      for (let a = 0; a < 5; a++) {
        weights[i * 5 + a] /= sumW
      }
    }
    return weights
  }, [icoSphere, pointCount])

  const material = useMemo(() => createSphereMaterial(), [])

  const { radiusAttr, confidenceAttr, sizeAttr, colorAttr } = useMemo(() => {
    const radius = new Float32Array(pointCount).fill(1.0)
    const confidence = new Float32Array(pointCount).fill(0.95)
    const size = new Float32Array(pointCount).fill(pointSize)
    const color = new Float32Array(pointCount * 3)

    return {
      radiusAttr: new THREE.BufferAttribute(radius, 1),
      confidenceAttr: new THREE.BufferAttribute(confidence, 1),
      sizeAttr: new THREE.BufferAttribute(size, 1),
      colorAttr: new THREE.BufferAttribute(color, 3),
    }
  }, [pointCount, pointSize])

  // Read store DIRECTLY every frame — no React render cycle dependency
  useFrame(({ clock }) => {
    if (!materialRef.current) return
    materialRef.current.uniforms.uTime.value = clock.getElapsedTime()

    // Read store snapshot directly
    const storeParams = useNavigationStore.getState().parameters
    const confs = mode === 'threat'
      ? getThreatConfidences(storeParams)
      : getResponseConfidences(storeParams)

    const radArr = radiusAttr.array as Float32Array
    const confArr = confidenceAttr.array as Float32Array
    const colArr = colorAttr.array as Float32Array

    for (let i = 0; i < pointCount; i++) {
      // Blend confidence from all 5 axes weighted by spatial proximity
      let blendedConf = 0
      let cr = 0, cg = 0, cb = 0
      for (let a = 0; a < 5; a++) {
        const w = axisWeights[i * 5 + a]
        blendedConf += w * confs[a]
        cr += w * AXIS_COLORS[a][0]
        cg += w * AXIS_COLORS[a][1]
        cb += w * AXIS_COLORS[a][2]
      }

      // Clamp radius:
      //   THREAT sphere: [0.05, 1.0] — craters inward on degradation
      //   RESPONSE sphere: [0.05, 1.3] — pushes outward when AI compensates
      const maxR = mode === 'response' ? 1.3 : 1.0
      const r = Math.max(0.05, Math.min(maxR, blendedConf))
      radArr[i] = r
      confArr[i] = r

      colArr[i * 3] = cr
      colArr[i * 3 + 1] = cg
      colArr[i * 3 + 2] = cb
    }

    radiusAttr.needsUpdate = true
    confidenceAttr.needsUpdate = true
    colorAttr.needsUpdate = true
  })

  // Imperatively attach dynamic attributes so useFrame updates the actual GPU-bound objects
  useEffect(() => {
    if (pointsRef.current) {
      materialRef.current = pointsRef.current.material as THREE.ShaderMaterial
    }
    if (geometryRef.current) {
      geometryRef.current.setAttribute('aRadius', radiusAttr)
      geometryRef.current.setAttribute('aConfidence', confidenceAttr)
      geometryRef.current.setAttribute('aPointSize', sizeAttr)
      geometryRef.current.setAttribute('aGroupColor', colorAttr)
    }
  }, [radiusAttr, confidenceAttr, sizeAttr, colorAttr])

  return (
    <points ref={pointsRef} material={material}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[icoSphere.positions, 3]} />
      </bufferGeometry>
    </points>
  )
}
