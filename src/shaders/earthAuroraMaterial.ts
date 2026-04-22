import { AdditiveBlending, FrontSide, ShaderMaterial, Vector3 } from "three";

export type EarthAuroraMaterialBundle = {
  material: ShaderMaterial;
  intensityUniform: { value: number };
  phaseUniform: { value: number };
  sunDirectionUniform: { value: Vector3 };
};

export function createEarthAuroraMaterial(
  initialIntensity = 1.1,
  initialPhase = 0,
): EarthAuroraMaterialBundle {
  const intensityUniform = { value: initialIntensity };
  const phaseUniform = { value: initialPhase };
  const sunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
      intensity: intensityUniform,
      phase: phaseUniform,
      sunDirection: sunDirectionUniform,
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
      uniform float intensity;
      uniform float phase;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;

      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>

      void main() {
        vec3 normal = normalize(vNormalView);
        vec3 viewDir = normalize(-vViewPosition);
        vec3 sunDir = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);

        float longitude = vUv.x * 6.28318530718;
        float latitudeAbs = abs(vUv.y * 2.0 - 1.0);
        float phaseAngle = phase * 6.28318530718;

        float ovalLatitude = latitudeAbs + sin(longitude * 2.0 + phaseAngle * 0.7) * 0.035;
        float lowerOval = smoothstep(0.48, 0.62, ovalLatitude);
        float upperOval = smoothstep(0.86, 0.98, ovalLatitude);
        float polarMask = lowerOval * ((1.0 - upperOval) * 0.72 + 0.28);

        float ribbonField =
          sin(longitude * 18.0 + vUv.y * 16.0 - phaseAngle * 1.7) * 0.48 +
          sin(longitude * 31.0 - vUv.y * 25.0 + phaseAngle * 2.6) * 0.31 +
          sin(longitude * 7.0 + phaseAngle * 0.9) * 0.21;
        float ribbonMask = smoothstep(0.56, 0.84, ribbonField * 0.5 + 0.5);

        float curtainBreakup = sin(vUv.y * 44.0 + longitude * 4.0 + phaseAngle * 3.2) * 0.5 + 0.5;
        float curtainMask = ribbonMask * mix(0.48, 1.0, smoothstep(0.18, 0.92, curtainBreakup));

        float sunAlignment = dot(normal, sunDir);
        float nightMask = 1.0 - smoothstep(-0.04, 0.28, sunAlignment);
        float twilightBoost = (
          smoothstep(-0.32, 0.06, sunAlignment) -
          smoothstep(0.06, 0.34, sunAlignment)
        ) * 0.48;
        float illuminationMask = clamp(nightMask + twilightBoost, 0.0, 1.0);

        float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.0);
        float viewMask = mix(0.4, 1.0, fresnel);
        float pulseMask = mix(
          0.72,
          1.0,
          sin(longitude * 5.0 + phaseAngle * 4.0) * 0.5 + 0.5
        );

        float auroraMask = clamp(
          polarMask * curtainMask * illuminationMask * viewMask * pulseMask,
          0.0,
          1.0
        );

        float cyanMix = sin(longitude * 9.0 - phaseAngle * 1.2 + vUv.y * 20.0) * 0.5 + 0.5;
        vec3 baseColor = mix(
          vec3(0.08, 0.95, 0.42),
          vec3(0.14, 0.72, 1.0),
          cyanMix * 0.55
        );
        float violetAccent = smoothstep(0.7, 0.98, ribbonMask * pulseMask) * 0.22;
        vec3 auroraColor = mix(baseColor, vec3(0.92, 0.26, 0.86), violetAccent);

        gl_FragColor = vec4(auroraColor * auroraMask * intensity * 1.65, auroraMask * intensity * 0.95);

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
    intensityUniform,
    phaseUniform,
    sunDirectionUniform,
  };
}
