import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  LinearFilter,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Side,
  type Texture,
} from 'three'
import {
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
} from '../lib/constants.ts'
import { kmToUnits } from '../lib/units.ts'
import { usePreparedSharedTexture } from '../lib/useSharedTexture.ts'

const INNER = kmToUnits(RING_INNER_RADIUS)
const OUTER = kmToUnits(RING_OUTER_RADIUS)
const SATURN_EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS)
const SATURN_POLAR = kmToUnits(SATURN_POLAR_RADIUS)
const SEGMENTS = 512
const COLOR_TEXTURE_PATH = '/textures/saturn_rings_color.png'
const SCATTERING_TEXTURE_PATH = '/textures/saturn_rings_scattering.png'
const MAX_TEXTURE_WIDTH = 4096
const EXPANDED_TEXTURE_HEIGHT = 16
const RING_SHADOW_TEXTURE_WIDTH = 4096
const RING_SHADOW_TEXTURE_HEIGHT = 2048
const RING_SHADOW_UMBRA_SOFTNESS = SATURN_EQUATORIAL * 0.012
const RING_SHADOW_PENUMBRA_SOFTNESS = SATURN_EQUATORIAL * 0.055
const RING_SHADOW_PENUMBRA_OPACITY = 0.58
const RING_SHADOW_DENSITY_BOOST = 2.35
const SATURNSHINE_COLOR = new Color(1.0, 0.91, 0.76)
const SATURNSHINE_BOND_ALBEDO = 0.34
const SATURNSHINE_EQUIVALENT_RADIUS = Math.sqrt(
  SATURN_EQUATORIAL * SATURN_POLAR,
)
const SATURNSHINE_CALIBRATION = 1.7
const SATURNSHINE_LIMB_HAZE_SCALE = 0.28
const SATURNSHINE_RINGSHINE_FLOOR = 0.0035
const SATURNSHINE_MAX_FILL = 0.085
const RING_SHADOW_SUN_PROJECTION_EPSILON = 1e-4
const FALLBACK_COLOR = new Color(0.83, 0.77, 0.63)
const PHASE_EPSILON = 0.002
const UNLIT_BLEND_EPSILON = 0.01

type RingTextureBundle = {
  alpha: Float32Array
  backscatter: Float32Array
  context: CanvasRenderingContext2D
  forwardscatter: Float32Array
  imageData: ImageData
  texture: CanvasTexture
  tintBlue: Float32Array
  tintGreen: Float32Array
  tintRed: Float32Array
  unlit: Float32Array
  width: number
}

type RingShadowTextureBundle = {
  angleCos: Float32Array
  angleSin: Float32Array
  context: CanvasRenderingContext2D
  height: number
  imageData: ImageData
  radii: Float32Array
  texture: CanvasTexture
  width: number
}

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
    uvs[innerIndex * 2 + 1] = i / segments
    uvs[outerIndex * 2] = 1
    uvs[outerIndex * 2 + 1] = i / segments
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

function srgbEncode(linear: number) {
  const value = Math.min(Math.max(linear, 0), 1)
  if (value <= 0.0031308) return value * 12.92
  return 1.055 * Math.pow(value, 1 / 2.4) - 0.055
}

function extractTint(red: number, green: number, blue: number, chromaGain: number) {
  const luma = Math.max(red * 0.2126 + green * 0.7152 + blue * 0.0722, 0.05)
  return [
    Math.min(Math.max(1 + (red / luma - 1) * chromaGain, 0), 1.4),
    Math.min(Math.max(1 + (green / luma - 1) * chromaGain, 0), 1.4),
    Math.min(Math.max(1 + (blue / luma - 1) * chromaGain, 0), 1.4),
  ] as const
}

function applyWarmTint(red: number, green: number, blue: number, warmth: number) {
  return [
    red * (1 + 0.08 * warmth),
    green * (1 + 0.02 * warmth),
    blue * (1 - 0.08 * warmth),
  ] as const
}

function createRingTextureBundle(
  colorTexture: Texture,
  scatteringTexture: Texture,
  chromaGain: number,
  warmth: number,
): RingTextureBundle | null {
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

  const tintRed = new Float32Array(width)
  const tintGreen = new Float32Array(width)
  const tintBlue = new Float32Array(width)
  const backscatter = new Float32Array(width)
  const forwardscatter = new Float32Array(width)
  const unlit = new Float32Array(width)
  const alpha = new Float32Array(width)

  for (let x = 0; x < width; x += 1) {
    const src = x * 4
    backscatter[x] = scatteringRow.data[src] / 255
    forwardscatter[x] = scatteringRow.data[src + 1] / 255
    unlit[x] = scatteringRow.data[src + 2] / 255
    alpha[x] = 1 - scatteringRow.data[src + 3] / 255
    const [tintSampleRed, tintSampleGreen, tintSampleBlue] = extractTint(
      colorRow.data[src] / 255,
      colorRow.data[src + 1] / 255,
      colorRow.data[src + 2] / 255,
      chromaGain,
    )
    const [baseRed, baseGreen, baseBlue] = applyWarmTint(
      tintSampleRed,
      tintSampleGreen,
      tintSampleBlue,
      warmth,
    )
    tintRed[x] = baseRed
    tintGreen[x] = baseGreen
    tintBlue[x] = baseBlue
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = EXPANDED_TEXTURE_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) return null

  const expanded = new CanvasTexture(canvas)
  configureRingTexture(expanded)
  const bundle = {
    alpha,
    backscatter,
    context,
    forwardscatter,
    imageData: context.createImageData(width, EXPANDED_TEXTURE_HEIGHT),
    texture: expanded,
    tintBlue,
    tintGreen,
    tintRed,
    unlit,
    width,
  }

  renderRingTexture(bundle, 0, 0)
  return bundle
}

function createRingShadowOpacityProfile(
  scatteringTexture: Texture,
  width: number,
): Float32Array | null {
  const image = scatteringTexture.image as CanvasImageSource & {
    width?: number
    height?: number
  } | undefined

  const sourceWidth = image?.width ?? 0
  const sourceHeight = image?.height ?? 0

  if (!image || !sourceWidth || !sourceHeight) return null

  const row = drawScaledRow(image, sourceWidth, sourceHeight, width)
  if (!row) return null

  const opacity = new Float32Array(width)
  for (let x = 0; x < width; x += 1) {
    opacity[x] = 1 - row.data[x * 4 + 3] / 255
  }

  return opacity
}

function createRingShadowTextureBundle(
  width: number,
  height: number,
): RingShadowTextureBundle | null {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return null

  const texture = new CanvasTexture(canvas)
  configureRingTexture(texture)

  const radii = new Float32Array(width)
  for (let x = 0; x < width; x += 1) {
    radii[x] = MathUtils.lerp(INNER, OUTER, (x + 0.5) / width)
  }

  const angleCos = new Float32Array(height)
  const angleSin = new Float32Array(height)
  for (let y = 0; y < height; y += 1) {
    const angle = (1 - (y + 0.5) / height) * Math.PI * 2
    angleCos[y] = Math.cos(angle)
    angleSin[y] = Math.sin(angle)
  }

  return {
    angleCos,
    angleSin,
    context,
    height,
    imageData: context.createImageData(width, height),
    radii,
    texture,
    width,
  }
}

function renderRingTexture(
  bundle: RingTextureBundle,
  phaseMix: number,
  unlitMix: number,
) {
  const clampedPhase = MathUtils.smootherstep(
    MathUtils.clamp(phaseMix, 0, 1),
    0,
    1,
  )
  const clampedUnlitMix = MathUtils.smootherstep(
    MathUtils.clamp(unlitMix, 0, 1),
    0,
    1,
  )
  const { data } = bundle.imageData

  for (let x = 0; x < bundle.width; x += 1) {
    const litBrightness = MathUtils.lerp(
      bundle.backscatter[x],
      bundle.forwardscatter[x],
      clampedPhase,
    )
    const brightness = MathUtils.lerp(litBrightness, bundle.unlit[x], clampedUnlitMix)
    const alpha = bundle.alpha[x]
    const red = Math.round(srgbEncode(bundle.tintRed[x] * brightness * alpha) * 255)
    const green = Math.round(srgbEncode(bundle.tintGreen[x] * brightness * alpha) * 255)
    const blue = Math.round(srgbEncode(bundle.tintBlue[x] * brightness * alpha) * 255)
    const encodedAlpha = Math.round(alpha * 255)

    for (let y = 0; y < EXPANDED_TEXTURE_HEIGHT; y += 1) {
      const dst = (y * bundle.width + x) * 4
      data[dst] = red
      data[dst + 1] = green
      data[dst + 2] = blue
      data[dst + 3] = encodedAlpha
    }
  }

  bundle.context.putImageData(bundle.imageData, 0, 0)
  bundle.texture.needsUpdate = true
}

function shadowCoverageFromInsideDistance(
  insideDistance: number,
  umbraSoftness: number,
  penumbraSoftness: number,
) {
  if (insideDistance <= -penumbraSoftness) return 0

  const outerCoverage = MathUtils.smoothstep(
    insideDistance,
    -penumbraSoftness,
    0,
  )
  const umbraCoverage = MathUtils.smoothstep(
    insideDistance,
    0,
    umbraSoftness,
  )

  return outerCoverage * MathUtils.lerp(
    RING_SHADOW_PENUMBRA_OPACITY,
    1,
    umbraCoverage,
  )
}

function computeSaturnSolidAngleFraction(radius: number) {
  const clampedRatio = MathUtils.clamp(
    SATURNSHINE_EQUIVALENT_RADIUS / radius,
    0,
    0.999999,
  )
  return 1 - Math.sqrt(1 - clampedRatio * clampedRatio)
}

function computeSaturnshineFillStrength(
  radius: number,
  px: number,
  py: number,
  localSunDirection: Vector3,
  boostedRingOpacity: number,
) {
  const saturnToSampleX = px / radius
  const saturnToSampleY = py / radius
  const cosPhase = MathUtils.clamp(
    saturnToSampleX * localSunDirection.x +
      saturnToSampleY * localSunDirection.y,
    -1,
    1,
  )
  const visibleLitHemisphere = 0.5 * (1 + cosPhase)
  const sunElevation = Math.abs(localSunDirection.z)
  const limbHaze =
    Math.sqrt(Math.max(1 - cosPhase * cosPhase, 0)) * sunElevation
  const solidAngleFraction = computeSaturnSolidAngleFraction(radius)
  const saturnshine =
    SATURNSHINE_BOND_ALBEDO *
    solidAngleFraction *
    (visibleLitHemisphere + SATURNSHINE_LIMB_HAZE_SCALE * limbHaze) *
    SATURNSHINE_CALIBRATION *
    MathUtils.lerp(0.78, 1.08, boostedRingOpacity)
  const ringshine =
    solidAngleFraction *
    SATURNSHINE_RINGSHINE_FLOOR *
    MathUtils.lerp(0.35, 1, boostedRingOpacity)

  return MathUtils.clamp(
    saturnshine + ringshine,
    0,
    SATURNSHINE_MAX_FILL,
  )
}

function renderPlanetShadowTexture(
  bundle: RingShadowTextureBundle,
  fillBundle: RingShadowTextureBundle | null,
  ringOpacityProfile: Float32Array | null,
  localSunDirection: Vector3,
  strength: number,
) {
  const { data } = bundle.imageData
  data.fill(0)
  const fillData = fillBundle?.imageData.data
  if (fillData) fillData.fill(0)

  if (!ringOpacityProfile || strength <= 0) {
    bundle.context.putImageData(bundle.imageData, 0, 0)
    bundle.texture.needsUpdate = true
    if (fillBundle && fillData) {
      fillBundle.context.putImageData(fillBundle.imageData, 0, 0)
      fillBundle.texture.needsUpdate = true
    }
    return
  }

  const projectionLength = Math.hypot(localSunDirection.x, localSunDirection.y)
  if (projectionLength <= RING_SHADOW_SUN_PROJECTION_EPSILON) {
    bundle.context.putImageData(bundle.imageData, 0, 0)
    bundle.texture.needsUpdate = true
    if (fillBundle && fillData) {
      fillBundle.context.putImageData(fillBundle.imageData, 0, 0)
      fillBundle.texture.needsUpdate = true
    }
    return
  }

  const shadowAxisX = -localSunDirection.x / projectionLength
  const shadowAxisY = -localSunDirection.y / projectionLength
  const lateralAxisX = -shadowAxisY
  const lateralAxisY = shadowAxisX
  const semiMinor = SATURN_EQUATORIAL
  const semiMinorSquared = semiMinor * semiMinor
  const umbraSoftness = Math.min(RING_SHADOW_UMBRA_SOFTNESS, semiMinor * 0.25)
  const penumbraSoftness = Math.min(
    RING_SHADOW_PENUMBRA_SOFTNESS,
    semiMinor * 0.5,
  )
  const normalComponent = Math.abs(localSunDirection.z)
  const usesInfiniteStrip =
    normalComponent <= RING_SHADOW_SUN_PROJECTION_EPSILON
  const semiMajor = usesInfiniteStrip
    ? Number.POSITIVE_INFINITY
    : Math.sqrt(
        semiMinorSquared +
          (SATURN_POLAR * SATURN_POLAR * projectionLength * projectionLength) /
          (normalComponent * normalComponent),
      )
  const fillStrength = Math.min(strength, 1)

  for (let y = 0; y < bundle.height; y += 1) {
    const cosAngle = bundle.angleCos[y]
    const sinAngle = bundle.angleSin[y]

    for (let x = 0; x < bundle.width; x += 1) {
      const ringOpacity = ringOpacityProfile[x]
      if (ringOpacity <= 0.001) continue
      const boostedRingOpacity =
        1 - Math.pow(1 - ringOpacity, RING_SHADOW_DENSITY_BOOST)

      const radius = bundle.radii[x]
      const px = cosAngle * radius
      const py = sinAngle * radius
      const u = px * shadowAxisX + py * shadowAxisY
      const frontDistance = u
      if (frontDistance <= -penumbraSoftness) continue

      const v = px * lateralAxisX + py * lateralAxisY
      const lateralInsideDistance = semiMinor - Math.abs(v)
      if (lateralInsideDistance <= -penumbraSoftness) continue

      const frontCoverage = shadowCoverageFromInsideDistance(
        frontDistance,
        umbraSoftness,
        penumbraSoftness,
      )
      if (frontCoverage <= 0) continue

      const lateralCoverage = shadowCoverageFromInsideDistance(
        lateralInsideDistance,
        umbraSoftness,
        penumbraSoftness,
      )
      if (lateralCoverage <= 0) continue

      let axialCoverage = 1
      if (!usesInfiniteStrip) {
        const axialLimit =
          semiMajor *
          Math.sqrt(
            Math.max(
              1 - (v * v) / semiMinorSquared,
              0,
            ),
          )
        const axialInsideDistance = axialLimit - u
        if (axialInsideDistance <= -penumbraSoftness) continue

        axialCoverage = shadowCoverageFromInsideDistance(
          axialInsideDistance,
          umbraSoftness,
          penumbraSoftness,
        )
        if (axialCoverage <= 0) continue
      }

      const shadowCoverage = Math.min(
        frontCoverage,
        lateralCoverage,
        axialCoverage,
      )
      const alpha = Math.min(
        strength * boostedRingOpacity * shadowCoverage,
        1,
      )
      if (alpha <= 0) continue

      const dst = (y * bundle.width + x) * 4
      data[dst + 3] = Math.round(alpha * 255)

      if (fillData && fillBundle) {
        const saturnshineFill = computeSaturnshineFillStrength(
          radius,
          px,
          py,
          localSunDirection,
          boostedRingOpacity,
        )
        const fillAlpha = Math.min(
          fillStrength *
            saturnshineFill *
            boostedRingOpacity *
            shadowCoverage,
          1,
        )
        if (fillAlpha > 0) {
          fillData[dst + 3] = Math.round(fillAlpha * 255)
        }
      }
    }
  }

  bundle.context.putImageData(bundle.imageData, 0, 0)
  bundle.texture.needsUpdate = true
  if (fillBundle && fillData) {
    fillBundle.context.putImageData(fillBundle.imageData, 0, 0)
    fillBundle.texture.needsUpdate = true
  }
}

function computeUnlitMix(viewPlaneDot: number, sunPlaneDot: number) {
  if (viewPlaneDot === 0 || sunPlaneDot === 0) return 0
  return Math.sign(viewPlaneDot) === Math.sign(sunPlaneDot) ? 0 : 1
}

function createTexturedMaterial(
  texture: Texture,
  side: Side,
  opacity: number,
) {
  const material = new MeshBasicMaterial({
    map: texture,
    opacity,
    transparent: true,
    premultipliedAlpha: true,
    side,
    depthWrite: false,
    toneMapped: false,
  })
  return material
}

type RingsProps = {
  sunDirection: Vector3
  textured?: boolean
}

export function Rings({ sunDirection, textured = true }: RingsProps) {
  const { camera } = useThree()
  const ringGroupRef = useRef<Group>(null)
  const ringWorldPositionRef = useRef(new Vector3())
  const normalRef = useRef(new Vector3())
  const quaternionRef = useRef(new Quaternion())
  const shadowQuaternionRef = useRef(new Quaternion())
  const localSunDirectionRef = useRef(new Vector3())
  const lastPlanetShadowSunDirectionRef = useRef(new Vector3())
  const lastPlanetShadowStrengthRef = useRef(Number.NaN)
  const viewDirRef = useRef(new Vector3())
  const lastPhaseRef = useRef(Number.NaN)
  const lastUnlitMixRef = useRef(Number.NaN)
  const { texture: colorTexture, error: colorError } = usePreparedSharedTexture(
    COLOR_TEXTURE_PATH,
    'saturn-rings',
    configureRingTexture,
  )
  const { texture: scatteringTexture, error: scatteringError } = usePreparedSharedTexture(
    SCATTERING_TEXTURE_PATH,
    'saturn-rings-scattering',
    configureRingTexture,
  )

  const { opacity, chromaGain, warmth, planetShadowStrength } = useControls('Rings', {
    opacity: { value: 0.7, min: 0, max: 1, step: 0.01, label: 'Opacity' },
    chromaGain: { value: 3.5, min: 1, max: 6, step: 0.05, label: 'Color Chroma' },
    warmth: { value: 0.4, min: 0, max: 1, step: 0.01, label: 'Warmth' },
    planetShadowStrength: {
      value: 1.15,
      min: 0,
      max: 1.5,
      step: 0.01,
      label: 'Planet Shadow',
    },
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

  const textureBundle = useMemo(() => {
    if (!colorTexture || !scatteringTexture) return null
    return createRingTextureBundle(colorTexture, scatteringTexture, chromaGain, warmth)
  }, [colorTexture, scatteringTexture, chromaGain, warmth])

  const materials = useMemo(() => {
    if (!textured || !textureBundle) return null
    return {
      back: createTexturedMaterial(textureBundle.texture, BackSide, opacity),
      front: createTexturedMaterial(textureBundle.texture, FrontSide, opacity),
    }
  }, [textured, textureBundle, opacity])

  const shadowOpacityProfile = useMemo(
    () =>
      scatteringTexture
        ? createRingShadowOpacityProfile(
            scatteringTexture,
            RING_SHADOW_TEXTURE_WIDTH,
          )
        : null,
    [scatteringTexture],
  )
  const shadowBundle = useMemo(
    () =>
      createRingShadowTextureBundle(
        RING_SHADOW_TEXTURE_WIDTH,
        RING_SHADOW_TEXTURE_HEIGHT,
      ),
    [],
  )
  const shadowFillBundle = useMemo(
    () =>
      createRingShadowTextureBundle(
        RING_SHADOW_TEXTURE_WIDTH,
        RING_SHADOW_TEXTURE_HEIGHT,
      ),
    [],
  )
  const shadowMaterial = useMemo(() => {
    if (!shadowBundle) return null

    return new MeshBasicMaterial({
      map: shadowBundle.texture,
      transparent: true,
      premultipliedAlpha: true,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    })
  }, [shadowBundle])
  const shadowFillMaterial = useMemo(() => {
    if (!shadowFillBundle) return null

    return new MeshBasicMaterial({
      color: SATURNSHINE_COLOR,
      map: shadowFillBundle.texture,
      transparent: true,
      premultipliedAlpha: true,
      side: DoubleSide,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    })
  }, [shadowFillBundle])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => fallback.dispose(), [fallback])
  useEffect(() => () => textureBundle?.texture.dispose(), [textureBundle])
  useEffect(() => () => shadowBundle?.texture.dispose(), [shadowBundle])
  useEffect(() => () => shadowFillBundle?.texture.dispose(), [shadowFillBundle])
  useEffect(
    () => () => {
      materials?.back.dispose()
      materials?.front.dispose()
    },
    [materials],
  )
  useEffect(() => () => shadowMaterial?.dispose(), [shadowMaterial])
  useEffect(() => () => shadowFillMaterial?.dispose(), [shadowFillMaterial])
  useEffect(() => {
    if (colorError) console.warn(`Rings: failed to load ${COLOR_TEXTURE_PATH}`, colorError)
    if (scatteringError) console.warn(`Rings: failed to load ${SCATTERING_TEXTURE_PATH}`, scatteringError)
  }, [colorError, scatteringError])
  useEffect(() => {
    lastPhaseRef.current = Number.NaN
    lastUnlitMixRef.current = Number.NaN
  }, [textureBundle])

  useFrame(() => {
    if (!ringGroupRef.current) return

    if (shadowBundle) {
      ringGroupRef.current.getWorldQuaternion(shadowQuaternionRef.current)
      shadowQuaternionRef.current.invert()
      localSunDirectionRef.current
        .copy(sunDirection)
        .applyQuaternion(shadowQuaternionRef.current)
        .normalize()

      const shadowChanged =
        lastPlanetShadowSunDirectionRef.current.distanceToSquared(localSunDirectionRef.current) > 1e-6
        || Math.abs(planetShadowStrength - lastPlanetShadowStrengthRef.current) > 1e-3

      if (shadowChanged) {
        renderPlanetShadowTexture(
          shadowBundle,
          shadowFillBundle,
          shadowOpacityProfile,
          localSunDirectionRef.current,
          planetShadowStrength,
        )
        lastPlanetShadowSunDirectionRef.current.copy(localSunDirectionRef.current)
        lastPlanetShadowStrengthRef.current = planetShadowStrength
      }
    }

    if (!textured || !textureBundle) return

    ringGroupRef.current.getWorldQuaternion(quaternionRef.current)
    ringGroupRef.current.getWorldPosition(ringWorldPositionRef.current)
    normalRef.current.set(0, 0, 1).applyQuaternion(quaternionRef.current).normalize()
    viewDirRef.current.copy(camera.position).sub(ringWorldPositionRef.current).normalize()

    const phase = (1 - MathUtils.clamp(viewDirRef.current.dot(sunDirection), -1, 1)) / 2
    const viewPlaneDot = viewDirRef.current.dot(normalRef.current)
    const sunPlaneDot = sunDirection.dot(normalRef.current)
    const unlitMix = computeUnlitMix(viewPlaneDot, sunPlaneDot)

    if (
      Math.abs(phase - lastPhaseRef.current) < PHASE_EPSILON
      && Math.abs(unlitMix - lastUnlitMixRef.current) < UNLIT_BLEND_EPSILON
    ) {
      return
    }

    renderRingTexture(textureBundle, phase, unlitMix)
    lastPhaseRef.current = phase
    lastUnlitMixRef.current = unlitMix
  })

  return (
    <group
      ref={ringGroupRef}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      {materials ? (
        <>
          <mesh
            renderOrder={1}
            geometry={geometry}
            material={materials.back}
          />
          <mesh
            renderOrder={2}
            geometry={geometry}
            material={materials.front}
          />
        </>
      ) : (
        <mesh
          renderOrder={1}
          geometry={geometry}
          material={fallback}
        />
      )}
      {shadowMaterial ? (
        <mesh
          renderOrder={3}
          geometry={geometry}
          material={shadowMaterial}
        />
      ) : null}
      {shadowFillMaterial ? (
        <mesh
          renderOrder={4}
          geometry={geometry}
          material={shadowFillMaterial}
        />
      ) : null}
    </group>
  )
}
