import {
  DoubleSide,
  NormalBlending,
  LinearFilter,
  LinearSRGBColorSpace,
  SRGBColorSpace,
  ClampToEdgeWrapping,
  type Texture,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { texture, uv, vec2, float, uniform } from 'three/tsl'

function configureTexture(tex: Texture, colorSpace: string, maxAnisotropy: number) {
  tex.colorSpace = colorSpace
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = false
  tex.wrapS = ClampToEdgeWrapping
  tex.wrapT = ClampToEdgeWrapping
  tex.anisotropy = maxAnisotropy
  tex.needsUpdate = true
}

/**
 * TSL material for Saturn's ring system.
 *
 * Samples scattering + color textures radially (uv.y = inner→outer).
 * Unlit: ring particles scatter light, they don't shade like a PBR surface.
 *
 * Returns the material and a handle to update the opacity uniform.
 */
export function createRingMaterial(
  scatteringTex: Texture,
  colorTex: Texture,
  initialOpacity: number,
  maxAnisotropy: number,
): { material: InstanceType<typeof MeshBasicNodeMaterial>; opacityUniform: { value: number } } {
  configureTexture(scatteringTex, LinearSRGBColorSpace, maxAnisotropy)
  configureTexture(colorTex, SRGBColorSpace, maxAnisotropy)

  // Radial UV: sample textures along uv.y (0 = inner edge, 1 = outer edge)
  const ringUV = vec2(uv().y, float(0.5))

  const scattering = texture(scatteringTex, ringUV) // RGBA
  const colorSample = texture(colorTex, ringUV)     // RGB

  const intensity = scattering.r // backscatter channel only for v0
  const texOpacity = scattering.a.oneMinus() // invert BJJ's alpha convention

  const opacityU = uniform(initialOpacity)
  // Placeholder — wired in for future phase-angle blending
  // @ts-expect-error reserved uniform, not yet wired into the node graph
  const _backscatterOnly = uniform(1.0) // eslint-disable-line @typescript-eslint/no-unused-vars

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const material = new (MeshBasicNodeMaterial as any)() as InstanceType<typeof MeshBasicNodeMaterial>
  material.colorNode = colorSample.rgb.mul(intensity)
  material.opacityNode = texOpacity.mul(opacityU)

  material.transparent = true
  material.side = DoubleSide
  material.depthWrite = false
  material.blending = NormalBlending

  return { material, opacityUniform: opacityU }
}
