import { useEffect, useMemo } from 'react'
import { useControls } from 'leva'
import {
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { RING_INNER_RADIUS, RING_OUTER_RADIUS } from '../lib/constants.ts'
import { kmToUnits } from '../lib/units.ts'
import { usePreparedSharedTexture, useSharedTexture } from '../lib/useSharedTexture.ts'

const INNER = kmToUnits(RING_INNER_RADIUS)
const OUTER = kmToUnits(RING_OUTER_RADIUS)
const SEGMENTS = 512
const COLOR_TEXTURE_PATH = '/textures/saturn_rings_color.png'
const SCATTERING_TEXTURE_PATH = '/textures/saturn_rings_scattering.png'
const MAX_TEXTURE_WIDTH = 4096
const EXPANDED_TEXTURE_HEIGHT = 16
const TEXTURE_V = 0.5
const FALLBACK_COLOR = new Color(0.83, 0.77, 0.63)

function createRingGeometry(inner: number, outer: number, segments: number) {
  const geometry = new BufferGeometry()
  const vertexCount = (segments + 1) * 2
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const indices = new Uint32Array(segments * 6)

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const innerIndex = i * 2
    const outerIndex = innerIndex + 1

    positions[innerIndex * 3] = cos * inner
    positions[innerIndex * 3 + 1] = sin * inner
    positions[outerIndex * 3] = cos * outer
    positions[outerIndex * 3 + 1] = sin * outer

    normals[innerIndex * 3 + 2] = 1
    normals[outerIndex * 3 + 2] = 1

    uvs[innerIndex * 2] = 0
    uvs[innerIndex * 2 + 1] = TEXTURE_V
    uvs[outerIndex * 2] = 1
    uvs[outerIndex * 2 + 1] = TEXTURE_V
  }

  for (let i = 0; i < segments; i += 1) {
    const innerA = i * 2
    const outerA = innerA + 1
    const innerB = innerA + 2
    const outerB = innerA + 3
    const base = i * 6

    indices[base] = innerA
    indices[base + 1] = outerA
    indices[base + 2] = outerB
    indices[base + 3] = innerA
    indices[base + 4] = outerB
    indices[base + 5] = innerB
  }

  geometry.setIndex(Array.from(indices))
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.computeBoundingSphere()

  return geometry
}

function configureRingTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.anisotropy = 1
  texture.needsUpdate = true
}

function drawScaledRow(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = 1

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, 1)
  return context.getImageData(0, 0, width, 1)
}

function createExpandedRingTexture(colorTexture: Texture, scatteringTexture: Texture) {
  const colorImage = colorTexture.image as CanvasImageSource & { width?: number; height?: number } | undefined
  const scatteringImage = scatteringTexture.image as CanvasImageSource & { width?: number; height?: number } | undefined

  const colorWidth = colorImage?.width ?? 0
  const colorHeight = colorImage?.height ?? 0
  const scatteringWidth = scatteringImage?.width ?? 0
  const scatteringHeight = scatteringImage?.height ?? 0

  if (!colorImage || !scatteringImage || !colorWidth || !colorHeight || !scatteringWidth || !scatteringHeight) {
    return null
  }

  const width = Math.min(colorWidth, scatteringWidth, MAX_TEXTURE_WIDTH)
  const colorRow = drawScaledRow(colorImage, colorWidth, colorHeight, width)
  const scatteringRow = drawScaledRow(scatteringImage, scatteringWidth, scatteringHeight, width)
  if (!colorRow || !scatteringRow) return null

  const outputData = new Uint8ClampedArray(width * EXPANDED_TEXTURE_HEIGHT * 4)

  for (let x = 0; x < width; x += 1) {
    const src = x * 4
    const brightness = scatteringRow.data[src] / 255
    const red = Math.round(colorRow.data[src] * brightness)
    const green = Math.round(colorRow.data[src + 1] * brightness)
    const blue = Math.round(colorRow.data[src + 2] * brightness)

    for (let y = 0; y < EXPANDED_TEXTURE_HEIGHT; y += 1) {
      const dst = (y * width + x) * 4
      outputData[dst] = red
      outputData[dst + 1] = green
      outputData[dst + 2] = blue
      outputData[dst + 3] = 255
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = EXPANDED_TEXTURE_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) return null

  const imageData = new ImageData(outputData, width, EXPANDED_TEXTURE_HEIGHT)
  context.putImageData(imageData, 0, 0)

  const expanded = new CanvasTexture(canvas)
  configureRingTexture(expanded)
  return expanded
}

function createTexturedMaterial(
  texture: Texture,
) {
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: false,
    side: DoubleSide,
    depthWrite: true,
    toneMapped: false,
  })
  return material
}

export function Rings({ textured = true }: { textured?: boolean }) {
  const { texture: colorTexture, error: colorError } = usePreparedSharedTexture(
    COLOR_TEXTURE_PATH,
    'saturn-rings',
    configureRingTexture,
  )
  const { texture: scatteringTexture, error: scatteringError } = useSharedTexture(
    SCATTERING_TEXTURE_PATH,
  )

  const { opacity } = useControls('Rings', {
    opacity: { value: 0.7, min: 0, max: 1, step: 0.01, label: 'Opacity' },
  })

  const geometry = useMemo(() => createRingGeometry(INNER, OUTER, SEGMENTS), [])

  const fallback = useMemo(
    () =>
      new MeshStandardMaterial({
        color: FALLBACK_COLOR,
        opacity,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        roughness: 0.9,
        metalness: 0,
      }),
    [opacity],
  )

  const expandedTexture = useMemo(() => {
    if (!colorTexture || !scatteringTexture) return null
    return createExpandedRingTexture(colorTexture, scatteringTexture)
  }, [colorTexture, scatteringTexture])

  const material = useMemo(() => {
    if (!textured || !expandedTexture) return null
    return createTexturedMaterial(expandedTexture)
  }, [textured, expandedTexture])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => fallback.dispose(), [fallback])
  useEffect(() => () => expandedTexture?.dispose(), [expandedTexture])
  useEffect(() => () => material?.dispose(), [material])
  useEffect(() => {
    if (colorError) console.warn(`Rings: failed to load ${COLOR_TEXTURE_PATH}`, colorError)
    if (scatteringError) console.warn(`Rings: failed to load ${SCATTERING_TEXTURE_PATH}`, scatteringError)
  }, [colorError, scatteringError])

  if (!material) {
    return (
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
        geometry={geometry}
        material={fallback}
      />
    )
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={1}
      geometry={geometry}
      material={material}
    />
  )
}
