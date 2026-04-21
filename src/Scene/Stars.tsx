import { useState, useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import {
  BufferGeometry,
  Float32BufferAttribute,
  TextureLoader,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  Euler,
} from 'three'
import { STAR_COUNT, STAR_SPHERE_RADIUS_KM } from '../lib/constants.ts'
import { kmToUnits } from '../lib/units.ts'
import { quaternionForFrame } from '../lib/astronomicalFrame.ts'
import { PANORAMAS, DEFAULT_PANORAMA, type PanoramaId } from '../lib/panoramas.ts'

const RADIUS = kmToUnits(STAR_SPHERE_RADIUS_KM)

// Build Leva select options: { label: id }
const PANORAMA_OPTIONS = Object.fromEntries(
  Object.values(PANORAMAS).map((p) => [p.label, p.id]),
)

// Track which files we've already warned about so we log once per file.
const warnedFiles = new Set<string>()

// ---------------------------------------------------------------------------
// Fallback: uniform random point cloud (original implementation)
// ---------------------------------------------------------------------------

function generatePositions(count: number, radius: number): Float32Array {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const idx = i * 3
    positions[idx] = radius * Math.sin(phi) * Math.cos(theta)
    positions[idx + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[idx + 2] = radius * Math.cos(phi)
  }
  return positions
}

function PointCloudFallback() {
  const geometry = useMemo(() => {
    const geo = new BufferGeometry()
    geo.setAttribute(
      'position',
      new Float32BufferAttribute(generatePositions(STAR_COUNT, RADIUS), 3),
    )
    return geo
  }, [])

  return (
    <points geometry={geometry}>
      <pointsMaterial
        size={1.5}
        sizeAttenuation={false}
        color={0xffffff}
        depthWrite={false}
      />
    </points>
  )
}

// ---------------------------------------------------------------------------
// Panorama background — loads selected panorama and applies frame rotation
// ---------------------------------------------------------------------------

function PanoramaBackground({
  panoramaId,
  intensity,
  onLoadFailed,
}: {
  panoramaId: PanoramaId
  intensity: number
  onLoadFailed: () => void
}) {
  const { scene } = useThree()

  useEffect(() => {
    const panorama = PANORAMAS[panoramaId]
    const loader = new TextureLoader()
    let disposed = false

    loader.load(
      panorama.file,
      (texture) => {
        if (disposed) {
          texture.dispose()
          return
        }
        texture.mapping = EquirectangularReflectionMapping
        texture.colorSpace = SRGBColorSpace

        scene.background = texture
        const q = quaternionForFrame(panorama.frame)
        const euler = new Euler().setFromQuaternion(q)
        scene.backgroundRotation.copy(euler)
        scene.environment = null
      },
      undefined,
      () => {
        if (!warnedFiles.has(panorama.file)) {
          console.warn(`Stars: panorama file not found: ${panorama.file}`)
          warnedFiles.add(panorama.file)
        }
        if (!disposed) {
          onLoadFailed()
        }
      },
    )

    return () => {
      disposed = true
      scene.background = null
    }
  }, [scene, panoramaId, onLoadFailed])

  // Update intensity reactively
  useEffect(() => {
    scene.backgroundIntensity = intensity
  }, [scene, intensity])

  return null
}

// ---------------------------------------------------------------------------
// Stars: tries selected panorama, falls back to point cloud
// ---------------------------------------------------------------------------

export function Stars() {
  const [loadFailed, setLoadFailed] = useState(false)
  const onLoadFailed = useRef(() => setLoadFailed(true)).current

  const { panorama: selectedId, intensity } = useControls('Starfield', {
    panorama: {
      value: DEFAULT_PANORAMA,
      options: PANORAMA_OPTIONS,
      label: 'Panorama',
    },
    intensity: { value: 0.2, min: 0, max: 2, step: 0.01, label: 'Intensity' },
  })

  // Reset failure state when the user picks a different panorama
  useEffect(() => {
    setLoadFailed(false)
  }, [selectedId])

  if (loadFailed) {
    return <PointCloudFallback />
  }

  return (
    <PanoramaBackground
      panoramaId={selectedId as PanoramaId}
      intensity={intensity}
      onLoadFailed={onLoadFailed}
    />
  )
}
