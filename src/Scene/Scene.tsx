import { useRef, useEffect } from 'react'
import { MathUtils } from 'three'
import { useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { Saturn } from './Saturn.tsx'
import { Atmosphere } from './Atmosphere.tsx'
import { Rings } from './Rings.tsx'
import { Stars } from './Stars.tsx'
import { Lighting } from './Lighting.tsx'
import {
  SATURN_AXIAL_TILT_DEG,
  CAMERA_MIN_DISTANCE_KM,
  CAMERA_MAX_DISTANCE_KM,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_RADIUS,
  DEFAULT_EXPOSURE,
} from '../lib/constants.ts'
import { kmToUnits } from '../lib/units.ts'

// --- PostProcessing (Three.js WebGPU node-based pipeline) ----------------
// Dynamic imports isolate WebGPU postprocessing so the rest of the app
// still renders if the API surface changes between Three.js versions.

type Pipeline = { outputNode: unknown; renderAsync: () => Promise<void> }

function Effects() {
  const { gl, scene, camera } = useThree()
  const pipelineRef = useRef<Pipeline | null>(null)

  const { bloomThreshold, bloomStrength, bloomRadius } = useControls('Bloom', {
    bloomThreshold: { value: DEFAULT_BLOOM_THRESHOLD, min: 0, max: 2, step: 0.01, label: 'Threshold' },
    bloomStrength: { value: DEFAULT_BLOOM_STRENGTH, min: 0, max: 3, step: 0.01, label: 'Strength' },
    bloomRadius: { value: DEFAULT_BLOOM_RADIUS, min: 0, max: 1, step: 0.01, label: 'Radius' },
  })

  const { exposure } = useControls('Tonemap', {
    exposure: { value: DEFAULT_EXPOSURE, min: 0.1, max: 5, step: 0.05, label: 'Exposure' },
  })

  // Rebuild the node graph when bloom params change.
  // This only triggers on Leva slider interaction, not every frame.
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const [{ RenderPipeline }, { pass }, { bloom }] = await Promise.all([
          import('three/webgpu'),
          import('three/tsl'),
          import('three/addons/tsl/display/BloomNode.js'),
        ] as const)

        if (cancelled) return

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pipeline = new (RenderPipeline as any)(gl) as Pipeline
        const scenePass = pass(scene, camera)
        const tex = scenePass.getTextureNode()
        const bloomPass = bloom(tex, bloomStrength, bloomRadius, bloomThreshold)
        pipeline.outputNode = tex.add(bloomPass)
        pipelineRef.current = pipeline
      } catch (err) {
        console.warn('WebGPU postprocessing unavailable, falling back to direct render:', err)
      }
    }

    init()
    return () => {
      cancelled = true
      pipelineRef.current = null
    }
  }, [gl, scene, camera, bloomStrength, bloomRadius, bloomThreshold])

  // Priority 1 → R3F skips its default gl.render(scene, camera) call.
  // Mutating gl.toneMappingExposure is the standard Three.js API for
  // controlling exposure — the renderer is an external system, not React state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    ;(gl as unknown as { toneMappingExposure: number }).toneMappingExposure = exposure
  }, [gl, exposure])

  useFrame(() => {
    if (pipelineRef.current) {
      pipelineRef.current.renderAsync()
    } else {
      gl.render(scene, camera)
    }
  }, 1)

  return null
}

// --- Smooth zoom ---------------------------------------------------------
// OrbitControls applies damping to rotation but not to scroll zoom — each
// wheel tick jumps the distance instantly.  SmoothZoom disables the built-in
// zoom, intercepts wheel events to update a target distance, and lerps the
// camera toward it each frame.

const MIN_DIST = kmToUnits(CAMERA_MIN_DISTANCE_KM)
const MAX_DIST = kmToUnits(CAMERA_MAX_DISTANCE_KM)
const ZOOM_DAMPING = 0.1

function SmoothZoom() {
  const { camera, gl } = useThree()
  const targetRef = useRef(camera.position.length())

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // pow gives smooth scaling for both trackpad (small deltaY) and
      // mouse wheel (deltaY ±100)
      const scale = Math.pow(0.95, e.deltaY * 0.01)
      targetRef.current = MathUtils.clamp(targetRef.current * scale, MIN_DIST, MAX_DIST)
    }
    gl.domElement.addEventListener('wheel', onWheel, { passive: false })
    return () => gl.domElement.removeEventListener('wheel', onWheel)
  }, [gl, camera])

  useFrame(() => {
    const current = camera.position.length()
    if (Math.abs(current - targetRef.current) > 0.001) {
      camera.position.setLength(MathUtils.lerp(current, targetRef.current, ZOOM_DAMPING))
    }
  })

  return null
}

// --- Scene root ----------------------------------------------------------

const AXIAL_TILT_RAD = (SATURN_AXIAL_TILT_DEG * Math.PI) / 180

export function Scene() {

  return (
    <>
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        enableZoom={false}
        minDistance={MIN_DIST}
        maxDistance={MAX_DIST}
      />
      <SmoothZoom />

      <group rotation={[0, 0, AXIAL_TILT_RAD]}>
        <Saturn />
        <Atmosphere />
        <Rings />
      </group>

      <Stars />
      <Lighting />
      <Effects />
    </>
  )
}
