import { AdditiveBlending, FrontSide, Vector3 } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  abs,
  clamp,
  dot,
  float,
  mix,
  normalView,
  normalWorld,
  positionView,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
  vec3,
} from "three/tsl";

export type EarthAuroraMaterialBundle = {
  material: InstanceType<typeof MeshBasicNodeMaterial>;
  intensityUniform: { value: number };
  phaseUniform: { value: number };
  sunDirectionUniform: { value: Vector3 };
};

export function createEarthAuroraMaterial(
  initialIntensity = 0.92,
  initialPhase = 0,
): EarthAuroraMaterialBundle {
  const intensityUniform = uniform(initialIntensity);
  const phaseUniform = uniform(initialPhase);
  const sunDirectionUniform = uniform(new Vector3(1, 0, 0));

  const surfaceUv = uv();
  const longitude = surfaceUv.x.mul(6.28318530718);
  const latitudeAbs = abs(surfaceUv.y.mul(2).sub(1));
  const phase = phaseUniform.mul(6.28318530718);

  const ovalLatitude = latitudeAbs.add(
    sin(longitude.mul(2.0).add(phase.mul(0.7))).mul(0.035),
  );
  const lowerOval = smoothstep(float(0.48), float(0.62), ovalLatitude);
  const upperOval = smoothstep(float(0.86), float(0.98), ovalLatitude);
  const polarMask = lowerOval.mul(upperOval.oneMinus().mul(0.72).add(0.28));

  const ribbonField = sin(
    longitude.mul(18.0).add(surfaceUv.y.mul(16.0)).sub(phase.mul(1.7)),
  )
    .mul(0.48)
    .add(
      sin(longitude.mul(31.0).sub(surfaceUv.y.mul(25.0)).add(phase.mul(2.6))).mul(
        0.31,
      ),
    )
    .add(sin(longitude.mul(7.0).add(phase.mul(0.9))).mul(0.21));
  const ribbonMask = smoothstep(
    float(0.56),
    float(0.84),
    ribbonField.mul(0.5).add(0.5),
  );

  const curtainBreakup = sin(
    surfaceUv.y.mul(44.0).add(longitude.mul(4.0)).add(phase.mul(3.2)),
  )
    .mul(0.5)
    .add(0.5);
  const curtainMask = ribbonMask.mul(
    mix(float(0.48), float(1.0), smoothstep(float(0.18), float(0.92), curtainBreakup)),
  );

  const sunAlignment = dot(normalWorld, sunDirectionUniform);
  const nightMask = smoothstep(float(-0.04), float(0.28), sunAlignment).oneMinus();
  const twilightBoost = smoothstep(float(-0.32), float(0.06), sunAlignment)
    .sub(smoothstep(float(0.06), float(0.34), sunAlignment))
    .mul(0.34);
  const illuminationMask = clamp(nightMask.add(twilightBoost), 0, 1);

  const fresnel = pow(abs(dot(normalView, positionView.normalize())).oneMinus(), 2.0);
  const viewMask = mix(float(0.28), float(1.0), fresnel);
  const pulseMask = mix(
    float(0.72),
    float(1.0),
    sin(longitude.mul(5.0).add(phase.mul(4.0))).mul(0.5).add(0.5),
  );

  const auroraMask = clamp(
    polarMask.mul(curtainMask).mul(illuminationMask).mul(viewMask).mul(pulseMask),
    0,
    1,
  );

  const cyanMix = sin(
    longitude.mul(9.0).sub(phase.mul(1.2)).add(surfaceUv.y.mul(20.0)),
  )
    .mul(0.5)
    .add(0.5);
  const baseColor = mix(
    vec3(0.08, 0.95, 0.42),
    vec3(0.14, 0.72, 1.0),
    cyanMix.mul(0.55),
  );
  const violetAccent = smoothstep(float(0.7), float(0.98), ribbonMask.mul(pulseMask)).mul(
    0.22,
  );
  const auroraColor = mix(baseColor, vec3(0.92, 0.26, 0.86), violetAccent);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const material = new (MeshBasicNodeMaterial as any)() as InstanceType<typeof MeshBasicNodeMaterial>;
  material.colorNode = auroraColor.mul(auroraMask).mul(intensityUniform).mul(1.45);
  material.opacityNode = auroraMask.mul(intensityUniform).mul(0.82);
  material.transparent = true;
  material.side = FrontSide;
  material.depthWrite = false;
  material.blending = AdditiveBlending;

  return {
    material,
    intensityUniform,
    phaseUniform,
    sunDirectionUniform,
  };
}
