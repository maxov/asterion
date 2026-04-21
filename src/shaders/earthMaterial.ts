import { type Texture, Vector3 } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  dot,
  mix,
  normalWorld,
  smoothstep,
  texture,
  uniform,
  uv,
} from "three/tsl";

export type EarthMaterialBundle = {
  material: InstanceType<typeof MeshStandardNodeMaterial>;
  monthBlendUniform: { value: number };
  nightLightsUniform: { value: number };
  sunDirectionUniform: { value: Vector3 };
};

export function createEarthMaterial(
  dayTexture: Texture,
  nightTexture: Texture,
  nextDayTexture: Texture | null,
  initialMonthBlend: number,
  initialNightLights: number,
): EarthMaterialBundle {
  const monthBlendUniform = uniform(initialMonthBlend);
  const nightLightsUniform = uniform(initialNightLights);
  const sunDirectionUniform = uniform(new Vector3(1, 0, 0));

  const daySample = texture(dayTexture, uv()).rgb;
  const nextDaySample = nextDayTexture ? texture(nextDayTexture, uv()).rgb : null;
  const nightSample = texture(nightTexture, uv()).rgb;

  const dayColor = nextDaySample
    ? mix(daySample, nextDaySample, monthBlendUniform)
    : daySample;

  // Fade city lights across the terminator so they stay on the night side.
  const nightMask = smoothstep(-0.14, 0.04, dot(normalWorld, sunDirectionUniform))
    .oneMinus();

  const material = new MeshStandardNodeMaterial();
  material.colorNode = dayColor;
  material.emissiveNode = nightSample.mul(nightMask).mul(nightLightsUniform);
  material.roughness = 0.92;
  material.metalness = 0;

  return {
    material,
    monthBlendUniform,
    nightLightsUniform,
    sunDirectionUniform,
  };
}
