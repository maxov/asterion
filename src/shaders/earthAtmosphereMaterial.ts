import { AdditiveBlending, BackSide, ShaderMaterial, Vector3 } from "three";

export type EarthAtmosphereMaterialBundle = {
  material: ShaderMaterial;
  intensityUniform: { value: number };
  powerUniform: { value: number };
  sunDirectionUniform: { value: Vector3 };
};

export function createEarthAtmosphereMaterial(
  initialIntensity = 0.72,
  initialPower = 5.4,
): EarthAtmosphereMaterialBundle {
  const intensityUniform = { value: initialIntensity };
  const powerUniform = { value: initialPower };
  const sunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
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
      uniform float intensity;
      uniform float power;
      uniform vec3 sunDirection;

      varying vec3 vNormalView;
      varying vec3 vViewPosition;

      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>

      void main() {
        vec3 normal = normalize(vNormalView);
        vec3 viewDir = normalize(-vViewPosition);
        vec3 sunDir = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);

        float fresnel = pow(1.0 - abs(dot(normal, viewDir)), power);
        float sunAlignment = dot(normal, sunDir);
        float daylight = smoothstep(-0.22, 0.45, sunAlignment);
        float twilight = smoothstep(-0.32, 0.08, sunAlignment)
          - smoothstep(0.08, 0.42, sunAlignment);
        float nightRim = (1.0 - smoothstep(-0.82, -0.18, sunAlignment)) * 0.14;

        vec3 baseColor = mix(
          vec3(0.05, 0.1, 0.2),
          vec3(0.42, 0.74, 1.0),
          daylight
        );
        vec3 atmosphereColor = baseColor + vec3(0.16, 0.28, 0.72) * (twilight * 0.32);
        float opacity = fresnel
          * (mix(0.08, 0.72, daylight) + twilight * 0.22 + nightRim)
          * intensity;

        gl_FragColor = vec4(atmosphereColor * fresnel * intensity, opacity);

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
    intensityUniform,
    powerUniform,
    sunDirectionUniform,
  };
}
