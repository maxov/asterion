import { BackSide, AdditiveBlending, Color } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { normalView, positionView, dot, pow, abs, float, vec3, uniform } from 'three/tsl'

/**
 * TSL material for Saturn's atmospheric limb glow.
 *
 * A fresnel effect makes the shell glow at grazing angles, creating a
 * physically-motivated atmosphere ring visible at the planet's limb.
 * Rendered on BackSide so the planet's depth buffer occludes the center,
 * leaving only the rim visible.
 */
export function createAtmosphereMaterial(
  color: Color,
  initialIntensity: number,
  initialPower: number,
): {
  material: InstanceType<typeof MeshBasicNodeMaterial>
  intensityUniform: { value: number }
  powerUniform: { value: number }
} {
  const intensityU = uniform(initialIntensity)
  const powerU = uniform(initialPower)

  // Fresnel: strong at grazing angles (limb), zero when facing camera
  const viewNormal = normalView
  const viewDir = positionView.normalize()
  const fresnel = pow(abs(dot(viewNormal, viewDir)).oneMinus(), powerU)

  const glowColor = vec3(color.r, color.g, color.b)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const material = new (MeshBasicNodeMaterial as any)() as InstanceType<typeof MeshBasicNodeMaterial>
  material.colorNode = glowColor.mul(fresnel).mul(intensityU)
  material.opacityNode = fresnel.mul(intensityU)

  material.transparent = true
  material.side = BackSide
  material.depthWrite = false
  material.blending = AdditiveBlending

  return { material, intensityUniform: intensityU, powerUniform: powerU }
}
