import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { useRef, Suspense, useMemo, useState, useEffect, Component, type ReactNode, type ErrorInfo } from 'react'
import { OrbitControls, Text, Line } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { useTelemetryStore } from '../../stores/telemetryStore'

const MODEL_PATH = `${import.meta.env.BASE_URL}models/shahed136.glb`
const COMPASS_RADIUS = 1.6
const CYAN = '#00E5FF'

// --- 3D Compass Ring (rendered in scene beneath aircraft) ---
function CompassRing3D() {
  const groupRef = useRef<THREE.Group>(null)
  const targetYaw = useRef(0)

  useFrame(() => {
    if (!groupRef.current) return
    const values = useTelemetryStore.getState().values
    const yaw = (values.psi ?? 0) * Math.PI / 180

    let diff = yaw - targetYaw.current
    if (diff > Math.PI) diff -= 2 * Math.PI
    if (diff < -Math.PI) diff += 2 * Math.PI
    targetYaw.current += diff * 0.08

    groupRef.current.rotation.y = -targetYaw.current
  })

  // Ring circle points
  const ringPoints = useMemo(() => {
    const pts: [number, number, number][] = []
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2
      pts.push([Math.sin(a) * COMPASS_RADIUS, 0, Math.cos(a) * COMPASS_RADIUS])
    }
    return pts
  }, [])

  // Tick line segments
  const tickLines = useMemo(() => {
    const segments: { points: [number, number, number][]; major: boolean }[] = []
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = deg * Math.PI / 180
      const isMajor = deg % 30 === 0
      const inner = COMPASS_RADIUS - (isMajor ? 0.12 : 0.06)
      segments.push({
        points: [
          [Math.sin(rad) * inner, 0, Math.cos(rad) * inner],
          [Math.sin(rad) * COMPASS_RADIUS, 0, Math.cos(rad) * COMPASS_RADIUS],
        ],
        major: isMajor,
      })
    }
    return segments
  }, [])

  const cardinals: [number, string][] = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]

  return (
    <group ref={groupRef} position={[0, -0.9, 0]}>
      {/* Main ring */}
      <Line points={ringPoints} color={CYAN} lineWidth={1} transparent opacity={0.4} />

      {/* Tick marks */}
      {tickLines.map((t, i) => (
        <Line
          key={i}
          points={t.points}
          color={CYAN}
          lineWidth={1}
          transparent
          opacity={t.major ? 0.6 : 0.25}
        />
      ))}

      {/* Cardinal labels */}
      {cardinals.map(([deg, label]) => {
        const rad = deg * Math.PI / 180
        const labelR = COMPASS_RADIUS + 0.2
        return (
          <Text
            key={label}
            position={[Math.sin(rad) * labelR, 0.01, Math.cos(rad) * labelR]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.15}
            color={label === 'N' ? CYAN : '#6B7B8D'}
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
        )
      })}

      {/* Heading pointer triangle at north */}
      <mesh position={[0, 0.02, COMPASS_RADIUS - 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.06, 0.12, 3]} />
        <meshBasicMaterial color={CYAN} />
      </mesh>
    </group>
  )
}

// --- Shared attitude animation hook ---
function useAttitudeAnimation(groupRef: React.RefObject<THREE.Group | null>) {
  const targetRef = useRef({ pitch: 0, roll: 0, yaw: 0 })

  useFrame(() => {
    if (!groupRef.current) return
    const values = useTelemetryStore.getState().values
    const pitch = (values.theta ?? 0) * Math.PI / 180
    const roll = (values.phi ?? 0) * Math.PI / 180
    const yaw = (values.psi ?? 0) * Math.PI / 180

    const t = targetRef.current
    t.pitch += (pitch - t.pitch) * 0.08
    t.roll += (roll - t.roll) * 0.08

    let yawDiff = yaw - t.yaw
    if (yawDiff > Math.PI) yawDiff -= 2 * Math.PI
    if (yawDiff < -Math.PI) yawDiff += 2 * Math.PI
    t.yaw += yawDiff * 0.08

    groupRef.current.rotation.set(t.pitch, -t.yaw, -t.roll, 'YXZ')
  })
}

// --- 3D Platform Model (GLB) ---
function PlatformModel() {
  const groupRef = useRef<THREE.Group>(null)
  useAttitudeAnimation(groupRef)

  const gltf = useLoader(GLTFLoader, MODEL_PATH)

  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true)
    const box = new THREE.Box3().setFromObject(clone)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 2.0 / maxDim

    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
    clone.scale.setScalar(scale)

    // Apply material
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.material = new THREE.MeshPhongMaterial({
          color: 0x8899aa,
          specular: 0x44aacc,
          shininess: 60,
          transparent: true,
          opacity: 0.92,
        })
      }
    })

    // Wrap in a pivot to orient nose toward +Z (compass North)
    // GLB has nose pointing toward -Y, top toward +Z
    // Rotate -90° around X to bring nose from -Y to +Z, then 180° around Z for correct top-up
    const pivot = new THREE.Group()
    pivot.add(clone)
    pivot.rotation.set(-Math.PI / 2, 0, Math.PI)

    return pivot
  }, [gltf])

  return (
    <group position={[0, 0.5, 0]}>
      <group ref={groupRef}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

// --- Fallback wireframe ---
function FallbackAircraft() {
  const groupRef = useRef<THREE.Group>(null)
  useAttitudeAnimation(groupRef)

  return (
    <group position={[0, 0.5, 0]}>
    <group ref={groupRef}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 2, 8]} />
        <meshPhongMaterial color={0x8899aa} specular={0x44aacc} shininess={60} />
      </mesh>
      <mesh position={[0, 0, 0.2]}>
        <boxGeometry args={[2.2, 0.03, 0.6]} />
        <meshPhongMaterial color={0x8899aa} specular={0x44aacc} shininess={60} />
      </mesh>
      <mesh position={[0, 0, -0.8]}>
        <boxGeometry args={[0.5, 0.03, 0.2]} />
        <meshPhongMaterial color={0x8899aa} specular={0x44aacc} shininess={60} />
      </mesh>
      <mesh position={[0, 0.15, -0.8]}>
        <boxGeometry args={[0.02, 0.3, 0.2]} />
        <meshPhongMaterial color={0x8899aa} specular={0x44aacc} shininess={60} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.12, 2, 8]} />
        <meshBasicMaterial color={CYAN} wireframe transparent opacity={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.2]}>
        <boxGeometry args={[2.2, 0.03, 0.6]} />
        <meshBasicMaterial color={CYAN} wireframe transparent opacity={0.2} />
      </mesh>
    </group>
    </group>
  )
}

// --- Error boundary ---
class ErrorCatcher extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(_: Error, __: ErrorInfo) { this.props.onError() }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

function ModelWithFallback() {
  const [loadFailed, setLoadFailed] = useState(false)

  if (loadFailed) return <FallbackAircraft />

  return (
    <ErrorCatcher onError={() => setLoadFailed(true)}>
      <Suspense fallback={<FallbackAircraft />}>
        <PlatformModel />
      </Suspense>
    </ErrorCatcher>
  )
}

// --- Adjust camera ---
function CameraSetup() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(3, 0.8, 3)
    camera.lookAt(0, 0.3, 0)
  }, [camera])
  return null
}

// --- Main exported component ---
export default function PlatformAttitudeViewer() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
    }}>
      {/* 3D viewport with integrated compass */}
      <div style={{
        width: '100%',
        height: 200,
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: '#060A12',
      }}>
        <Canvas
          camera={{ position: [3, 0.8, 3], fov: 32, near: 0.1, far: 50 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <CameraSetup />

          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 6, 4]} intensity={1.0} color="#ffffff" />
          <directionalLight position={[-3, 3, -2]} intensity={0.4} color="#88ccff" />
          <directionalLight position={[0, -2, 0]} intensity={0.15} color="#00E5FF" />

          <ModelWithFallback />
          <CompassRing3D />

          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate={false}
            maxPolarAngle={Math.PI / 2.2}
            minPolarAngle={Math.PI / 6}
          />
        </Canvas>
      </div>

    </div>
  )
}
