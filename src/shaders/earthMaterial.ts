import { type Texture, Vector3 } from "three";
import { MeshPhysicalNodeMaterial } from "three/webgpu";
import {
  abs,
  clamp,
  dot,
  float,
  max,
  mix,
  normalView,
  normalWorld,
  positionView,
  pow,
  smoothstep,
  texture,
  uniform,
  uv,
  vec3,
} from "three/tsl";

export type EarthMaterialBundle = {
  material: InstanceType<typeof MeshPhysicalNodeMaterial>;
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
  const sunAlignment = dot(normalWorld, sunDirectionUniform);

  // Fade city lights across the terminator so they stay on the night side.
  const nightMask = smoothstep(-0.08, 0.02, sunAlignment).oneMinus();

  // Estimate water coverage from the day texture so oceans can keep a tight
  // sun glint while land stays broad and matte.
  const brightestChannel = max(dayColor.r, max(dayColor.g, dayColor.b));
  const blueDominance = smoothstep(
    float(0.015),
    float(0.24),
    dayColor.b.sub(max(dayColor.r, dayColor.g).mul(0.82)),
  );
  const aquaBias = smoothstep(float(0.04), float(0.32), dayColor.b.sub(dayColor.r))
    .mul(smoothstep(float(-0.02), float(0.16), dayColor.g.sub(dayColor.r)));
  const brightnessPenalty = smoothstep(
    float(0.42),
    float(0.86),
    brightestChannel,
  ).oneMinus();
  const waterMask = clamp(
    max(blueDominance, aquaBias).mul(brightnessPenalty).mul(1.1),
    0,
    1,
  );

  const viewFresnel = pow(abs(dot(normalView, positionView.normalize())).oneMinus(), 4);
  const dayHaze = viewFresnel.mul(smoothstep(-0.16, 0.5, sunAlignment)).mul(0.22);
  const surfaceColor = mix(
    dayColor,
    dayColor.mul(vec3(0.84, 0.9, 1.05)).add(vec3(0.015, 0.03, 0.06)),
    dayHaze,
  );

  const material = new MeshPhysicalNodeMaterial();
  material.colorNode = surfaceColor;
  material.emissiveNode = nightSample.mul(nightMask).mul(nightLightsUniform);
  material.roughnessNode = mix(float(0.94), float(0.055), waterMask);
  material.metalnessNode = float(0);
  material.specularIntensityNode = mix(float(0.28), float(1.0), waterMask);
  material.specularColorNode = mix(
    vec3(1.0, 0.985, 0.97),
    vec3(0.88, 0.97, 1.0),
    waterMask,
  );
  material.clearcoatNode = waterMask.mul(0.32);
  material.clearcoatRoughnessNode = mix(float(0.4), float(0.08), waterMask);

  return {
    material,
    monthBlendUniform,
    nightLightsUniform,
    sunDirectionUniform,
  };
}
