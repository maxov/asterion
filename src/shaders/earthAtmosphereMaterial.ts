import { AdditiveBlending, BackSide, ShaderMaterial, Vector3 } from "three";

export const EARTH_ATMOSPHERE_DEBUG_VIEW_IDS = {
  beauty: 0,
  fresnel: 1,
  daylight: 2,
  twilight: 3,
  sunAlignment: 4,
  opacity: 5,
} as const;

export type EarthAtmosphereDebugView =
  keyof typeof EARTH_ATMOSPHERE_DEBUG_VIEW_IDS;

export type EarthAtmosphereMaterialBundle = {
  material: ShaderMaterial;
  debugViewUniform: { value: number };
  intensityUniform: { value: number };
  powerUniform: { value: number };
  sunDirectionUniform: { value: Vector3 };
};

export function createEarthAtmosphereMaterial(
  initialIntensity = 0.72,
  initialPower = 5.4,
): EarthAtmosphereMaterialBundle {
  const debugViewUniform = { value: EARTH_ATMOSPHERE_DEBUG_VIEW_IDS.beauty };
  const intensityUniform = { value: initialIntensity };
  const powerUniform = { value: initialPower };
  const sunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
      debugView: debugViewUniform,
      intensity: intensityUniform,
      power: powerUniform,
      sunDirection: sunDirectionUniform,
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalView;
      varying vec3 vViewPosition;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = mvPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform int debugView;
      uniform float intensity;
      uniform float power;
      uniform vec3 sunDirection;

      varying vec3 vNormalView;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormalView);
        vec3 viewDir = normalize(-vViewPosition);
        vec3 sunDir = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);

        float fresnel = pow(1.0 - abs(dot(normal, viewDir)), power);
        float sunAlignment = dot(normal, sunDir);
        float daylight = smoothstep(-0.26, 0.28, sunAlignment);
        float twilight = max(
          smoothstep(-0.18, 0.02, sunAlignment) -
            smoothstep(0.02, 0.18, sunAlignment),
          0.0
        );
        float nightRim = (1.0 - smoothstep(-0.88, -0.18, sunAlignment)) * 0.05;
        float limbGlow = smoothstep(0.18, 0.92, fresnel);

        vec3 baseColor = mix(
          vec3(0.03, 0.07, 0.18),
          vec3(0.34, 0.64, 1.08),
          daylight
        );
        vec3 twilightColor = vec3(0.96, 0.48, 0.16);
        vec3 atmosphereColor = baseColor;
        atmosphereColor += twilightColor * twilight * limbGlow * 0.42;
        atmosphereColor += vec3(0.12, 0.22, 0.64) * limbGlow * (0.12 + daylight * 0.12);
        float opacity = fresnel
          * (mix(0.02, 0.28, daylight) + twilight * limbGlow * 0.52 + nightRim)
          * intensity;
        vec3 debugColor =
          atmosphereColor * fresnel * intensity * (0.28 + twilight * limbGlow * 0.72 + daylight * 0.16);
        float debugOpacity = opacity;

        if (debugView == 1) {
          debugColor = vec3(fresnel);
          debugOpacity = 1.0;
        } else if (debugView == 2) {
          debugColor = vec3(daylight);
          debugOpacity = 1.0;
        } else if (debugView == 3) {
          debugColor = vec3(max(twilight, 0.0));
          debugOpacity = 1.0;
        } else if (debugView == 4) {
          debugColor = vec3(sunAlignment * 0.5 + 0.5);
          debugOpacity = 1.0;
        } else if (debugView == 5) {
          debugColor = vec3(opacity);
          debugOpacity = 1.0;
        }

        gl_FragColor = vec4(debugColor, debugOpacity);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    side: BackSide,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  material.toneMapped = true;

  return {
    material,
    debugViewUniform,
    intensityUniform,
    powerUniform,
    sunDirectionUniform,
  };
}
