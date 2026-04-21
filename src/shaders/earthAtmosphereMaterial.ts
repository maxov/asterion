import { AdditiveBlending, BackSide, Vector3 } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  abs,
  dot,
  float,
  mix,
  normalView,
  normalWorld,
  positionView,
  pow,
  smoothstep,
  uniform,
  vec3,
} from "three/tsl";

export type EarthAtmosphereMaterialBundle = {
  material: InstanceType<typeof MeshBasicNodeMaterial>;
  intensityUniform: { value: number };
  powerUniform: { value: number };
  sunDirectionUniform: { value: Vector3 };
};

export function createEarthAtmosphereMaterial(
  initialIntensity = 0.5,
  initialPower = 6.2,
): EarthAtmosphereMaterialBundle {
  const intensityUniform = uniform(initialIntensity);
  const powerUniform = uniform(initialPower);
  const sunDirectionUniform = uniform(new Vector3(1, 0, 0));

  const viewNormal = normalView;
  const viewDirection = positionView.normalize();
  const fresnel = pow(abs(dot(viewNormal, viewDirection)).oneMinus(), powerUniform);
  const sunAlignment = dot(normalWorld, sunDirectionUniform);
  const daylight = smoothstep(-0.22, 0.45, sunAlignment);
  const twilight = smoothstep(-0.32, 0.08, sunAlignment)
    .sub(smoothstep(0.08, 0.42, sunAlignment));
  const nightRim = smoothstep(-0.82, -0.18, sunAlignment).oneMinus().mul(0.08);

  const baseColor = mix(
    vec3(0.05, 0.1, 0.2),
    vec3(0.42, 0.74, 1.0),
    daylight,
  );
  const atmosphereColor = baseColor.add(vec3(0.16, 0.28, 0.72).mul(twilight.mul(0.32)));
  const opacity = fresnel
    .mul(mix(float(0.04), float(0.62), daylight).add(twilight.mul(0.16)).add(nightRim))
    .mul(intensityUniform);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const material = new (MeshBasicNodeMaterial as any)() as InstanceType<typeof MeshBasicNodeMaterial>;
  material.colorNode = atmosphereColor.mul(fresnel).mul(intensityUniform);
  material.opacityNode = opacity;
  material.transparent = true;
  material.side = BackSide;
  material.depthWrite = false;
  material.blending = AdditiveBlending;

  return {
    material,
    intensityUniform,
    powerUniform,
    sunDirectionUniform,
  };
}
