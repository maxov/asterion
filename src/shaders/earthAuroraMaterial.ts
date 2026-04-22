import { AdditiveBlending, FrontSide, ShaderMaterial, Vector3 } from "three";

export const EARTH_AURORA_DEBUG_VIEW_IDS = {
  beauty: 0,
  polarMask: 1,
  ribbonMask: 2,
  illuminationMask: 3,
  viewMask: 4,
  auroraMask: 5,
} as const;

export type EarthAuroraDebugView = keyof typeof EARTH_AURORA_DEBUG_VIEW_IDS;

export type EarthAuroraMaterialBundle = {
  material: ShaderMaterial;
  visibilityUniform: { value: number };
  debugViewUniform: { value: number };
  intensityUniform: { value: number };
  phaseUniform: { value: number };
  sunDirectionUniform: { value: Vector3 };
};

export function createEarthAuroraMaterial(
  initialIntensity = 1.1,
  initialPhase = 0,
): EarthAuroraMaterialBundle {
  const visibilityUniform = { value: 1 };
  const debugViewUniform = { value: EARTH_AURORA_DEBUG_VIEW_IDS.beauty };
  const intensityUniform = { value: initialIntensity };
  const phaseUniform = { value: initialPhase };
  const sunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
      debugView: debugViewUniform,
      intensity: intensityUniform,
      phase: phaseUniform,
      sunDirection: sunDirectionUniform,
      visibility: visibilityUniform,
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;

      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = mvPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform int debugView;
      uniform float intensity;
      uniform float phase;
      uniform vec3 sunDirection;
      uniform float visibility;

      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormalView);
        vec3 viewDir = normalize(-vViewPosition);
        vec3 sunDir = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);

        float longitude = vUv.x * 6.28318530718;
        float latitudeAbs = abs(vUv.y * 2.0 - 1.0);
        float phaseAngle = phase * 6.28318530718;
        float phaseSin = sin(phaseAngle);
        float phaseCos = cos(phaseAngle);
        float phaseSin2 = sin(phaseAngle * 2.0);
        float phaseCos2 = cos(phaseAngle * 2.0);
        float phaseSin3 = sin(phaseAngle * 3.0);

        // Build the animation from closed phase loops so phase=0 and phase=1 match.
        float ovalCenter = 0.72 + phaseSin * 0.018 + phaseCos2 * 0.008;
        float ovalDistance = abs(latitudeAbs - ovalCenter);
        float polarMask =
          (1.0 - smoothstep(0.04, 0.12, ovalDistance)) *
          smoothstep(0.58, 0.72, latitudeAbs);

        float ribbonField =
          sin(longitude * 10.0 + vUv.y * 11.0 - phaseSin * 0.9 - phaseCos2 * 0.4) *
            0.48 +
          sin(longitude * 19.0 - vUv.y * 13.0 + phaseSin2 * 1.1 + phaseCos * 0.55) *
            0.36 +
          sin(longitude * 4.0 + phaseSin3 * 0.6) * 0.16;
        float ribbonMask = smoothstep(0.68, 0.9, ribbonField * 0.5 + 0.5);

        float curtainBreakup = sin(
          vUv.y * 28.0 + longitude * 2.8 + phaseSin3 * 0.9 + phaseCos * 0.5
        ) * 0.5 + 0.5;
        float curtainMask = mix(0.74, 1.0, smoothstep(0.42, 0.92, curtainBreakup));

        float sunAlignment = dot(normal, sunDir);
        float nightMask = 1.0 - smoothstep(-0.04, 0.28, sunAlignment);
        float twilightBoost = (
          smoothstep(-0.32, 0.06, sunAlignment) -
          smoothstep(0.06, 0.34, sunAlignment)
        ) * 0.3;
        float illuminationMask = clamp(nightMask + twilightBoost, 0.0, 1.0);

        float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.4);
        float viewMask = mix(0.55, 1.0, fresnel);
        float pulseMask = mix(
          0.88,
          1.0,
          sin(longitude * 3.0 + phaseAngle * 4.0) * 0.5 + 0.5
        );

        float auroraMask = clamp(
          polarMask * ribbonMask * curtainMask * illuminationMask * viewMask * pulseMask,
          0.0,
          1.0
        );

        float cyanMix = sin(
          longitude * 6.0 + vUv.y * 14.0 - phaseSin2 * 0.8 - phaseCos * 0.15
        ) * 0.5 + 0.5;
        vec3 baseColor = mix(
          vec3(0.1, 0.9, 0.45),
          vec3(0.14, 0.68, 0.95),
          cyanMix * 0.4
        );
        float violetAccent = smoothstep(0.86, 0.98, ribbonMask * pulseMask) * 0.1;
        vec3 auroraColor = mix(baseColor, vec3(0.78, 0.34, 0.86), violetAccent);
        vec3 debugColor = auroraColor * auroraMask * intensity * visibility * 1.25;
        float debugOpacity = auroraMask * intensity * visibility * 0.72;

        if (debugView == 1) {
          debugColor = vec3(polarMask);
          debugOpacity = 1.0;
        } else if (debugView == 2) {
          debugColor = vec3(ribbonMask);
          debugOpacity = 1.0;
        } else if (debugView == 3) {
          debugColor = vec3(illuminationMask);
          debugOpacity = 1.0;
        } else if (debugView == 4) {
          debugColor = vec3(viewMask);
          debugOpacity = 1.0;
        } else if (debugView == 5) {
          debugColor = vec3(auroraMask);
          debugOpacity = 1.0;
        }

        gl_FragColor = vec4(debugColor, debugOpacity);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    side: FrontSide,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.toneMapped = true;

  return {
    material,
    visibilityUniform,
    debugViewUniform,
    intensityUniform,
    phaseUniform,
    sunDirectionUniform,
  };
}
