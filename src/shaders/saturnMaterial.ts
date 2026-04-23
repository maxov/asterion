import { ShaderMaterial, type Texture, Vector3 } from "three";
import {
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
} from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";

const EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS);
const POLAR_SCALE = SATURN_POLAR_RADIUS / SATURN_EQUATORIAL_RADIUS;
const POLAR = EQUATORIAL * POLAR_SCALE;
const RING_INNER = kmToUnits(RING_INNER_RADIUS);
const RING_OUTER = kmToUnits(RING_OUTER_RADIUS);
const PROFILE_TEXEL_SIZE = 1 / 13177;

export type SaturnMaterialBundle = {
  dispose: () => void;
  material: ShaderMaterial;
  setRingShadowStrength: (ringShadowStrength: number) => void;
  setScatteringTexture: (scatteringTexture: Texture) => void;
  setSunDirections: (localSunDirection: Vector3, worldSunDirection: Vector3) => void;
};

export function createSaturnMaterial(
  albedoTexture: Texture,
  scatteringTexture: Texture,
): SaturnMaterialBundle {
  const localSunDirectionUniform = { value: new Vector3(1, 0, 0) };
  const ringShadowStrengthUniform = { value: 0.78 };
  const worldSunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
      albedoTexture: { value: albedoTexture },
      localSunDirection: localSunDirectionUniform,
      ringShadowStrength: ringShadowStrengthUniform,
      scatteringTexture: { value: scatteringTexture },
      sunDirection: worldSunDirectionUniform,
    },
    vertexShader: /* glsl */ `
      varying vec3 vPlanetPosition;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      const float POLAR_SCALE = ${POLAR_SCALE.toFixed(8)};

      void main() {
        vUv = uv;
        vPlanetPosition = vec3(position.x, position.y * POLAR_SCALE, position.z);

        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);

        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D albedoTexture;
      uniform vec3 localSunDirection;
      uniform float ringShadowStrength;
      uniform sampler2D scatteringTexture;
      uniform vec3 sunDirection;

      varying vec3 vPlanetPosition;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      const float EQUATORIAL = ${EQUATORIAL.toFixed(6)};
      const float POLAR = ${POLAR.toFixed(6)};
      const float RING_INNER = ${RING_INNER.toFixed(6)};
      const float RING_OUTER = ${RING_OUTER.toFixed(6)};
      const float RING_EDGE_SOFTNESS = ${(EQUATORIAL * 0.0025).toFixed(6)};
      const float SHADOW_FADE_START = 0.03;
      const float SHADOW_FADE_END = 0.12;
      const float PROJECTED_OPACITY_MIN_COSINE = 0.06;
      const float PROFILE_TEXEL_SIZE = ${PROFILE_TEXEL_SIZE.toFixed(8)};

      #include <dithering_pars_fragment>

      vec3 safeNormalize(vec3 value, vec3 fallbackValue) {
        float valueLength = length(value);
        if (valueLength <= 1.0e-6) return fallbackValue;
        return value / valueLength;
      }

      float saturnLuma(vec3 colorValue) {
        return dot(colorValue, vec3(0.2126, 0.7152, 0.0722));
      }

      float safeOpticalDepth(float opacityValue) {
        float transmittance = clamp(1.0 - opacityValue, 1.0e-4, 1.0);
        return -log(transmittance);
      }

      float projectedOpacity(float opacityValue, float cosineValue) {
        float opticalDepth = safeOpticalDepth(opacityValue);
        return 1.0 - exp(-opticalDepth / max(abs(cosineValue), PROJECTED_OPACITY_MIN_COSINE));
      }

      float sampleFilteredOpacity(float u) {
        float center = clamp(u, 0.0, 1.0);
        float offset = PROFILE_TEXEL_SIZE * 2.0;
        float opacityCenter = 1.0 - texture2D(scatteringTexture, vec2(center, 0.5)).a;
        float opacityLeft = 1.0 - texture2D(
          scatteringTexture,
          vec2(clamp(center - offset, 0.0, 1.0), 0.5)
        ).a;
        float opacityRight = 1.0 - texture2D(
          scatteringTexture,
          vec2(clamp(center + offset, 0.0, 1.0), 0.5)
        ).a;

        return opacityCenter * 0.5 + (opacityLeft + opacityRight) * 0.25;
      }

      float computeRingShadow(vec3 positionValue, vec3 localSunDir) {
        float sunElevation = abs(localSunDir.y);
        float elevationFade = smoothstep(
          SHADOW_FADE_START,
          SHADOW_FADE_END,
          sunElevation
        );

        if (
          ringShadowStrength <= 0.0 ||
          sunElevation <= 1.0e-5 ||
          elevationFade <= 0.0
        ) {
          return 0.0;
        }

        float rayDistance = -positionValue.y / localSunDir.y;
        if (rayDistance <= 0.0) return 0.0;

        vec3 ringHit = positionValue + localSunDir * rayDistance;
        float radial = length(ringHit.xz);
        float ringMask =
          smoothstep(
            RING_INNER - RING_EDGE_SOFTNESS,
            RING_INNER + RING_EDGE_SOFTNESS,
            radial
          ) *
          (1.0 - smoothstep(
            RING_OUTER - RING_EDGE_SOFTNESS,
            RING_OUTER + RING_EDGE_SOFTNESS,
            radial
          ));

        if (ringMask <= 0.0) return 0.0;

        float radialMix = clamp(
          (radial - RING_INNER) / (RING_OUTER - RING_INNER),
          0.0,
          1.0
        );
        float baseOpacity = sampleFilteredOpacity(radialMix);
        if (baseOpacity <= 5.0e-4) return 0.0;

        float projectedRingOpacity = projectedOpacity(baseOpacity, localSunDir.y);
        return clamp(
          projectedRingOpacity *
            ringShadowStrength *
            elevationFade *
            ringMask,
          0.0,
          1.0
        );
      }

      void main() {
        vec3 albedo = sRGBTransferEOTF(texture2D(albedoTexture, vUv)).rgb;
        vec3 localSunDir = safeNormalize(localSunDirection, vec3(1.0, 0.0, 0.0));
        vec3 normal = safeNormalize(vWorldNormal, vec3(0.0, 1.0, 0.0));
        vec3 sunDir = safeNormalize(sunDirection, vec3(1.0, 0.0, 0.0));
        vec3 viewDir = safeNormalize(cameraPosition - vWorldPosition, normal);

        float ringShadow = computeRingShadow(vPlanetPosition, localSunDir);
        float sunTransmission = 1.0 - ringShadow;

        float sunAlignment = dot(normal, sunDir);
        float viewDot = max(dot(normal, viewDir), 0.0);
        float horizon = pow(1.0 - viewDot, 1.75);
        float daylight = smoothstep(-0.24, 0.14, sunAlignment);
        float twilight = max(
          smoothstep(-0.3, 0.02, sunAlignment) -
            smoothstep(0.02, 0.18, sunAlignment),
          0.0
        );
        float nightMask = smoothstep(0.08, 0.56, -sunAlignment);
        float wrapDiffuse = clamp((sunAlignment + 0.24) / 1.24, 0.0, 1.0);
        float hazeAmount = horizon * smoothstep(-0.2, 0.52, sunAlignment);
        float twilightHaze = twilight * (0.22 + horizon * 0.78);

        vec3 neutralAlbedo = vec3(saturnLuma(albedo));
        vec3 litAlbedo =
          mix(neutralAlbedo, albedo, 0.82) *
          vec3(1.02, 1.008, 0.972);
        vec3 nightAlbedo = mix(neutralAlbedo, albedo, 0.42);
        vec3 nightColor = nightAlbedo * vec3(0.0228, 0.0234, 0.0243);
        vec3 litColor =
          litAlbedo * 0.084 +
          litAlbedo * (wrapDiffuse * 0.91 * sunTransmission);
        vec3 duskColor = vec3(0.285, 0.225, 0.145);
        vec3 hazeColor = mix(
          vec3(0.062, 0.060, 0.057),
          vec3(0.245, 0.215, 0.17),
          daylight
        );
        float hazeTransmission = mix(1.0, 0.78, ringShadow);

        vec3 color = mix(nightColor, litColor, daylight);
        color += duskColor * twilightHaze * 0.21 * hazeTransmission;
        color += hazeColor * hazeAmount * 0.16 * hazeTransmission;

        float duskLift = horizon * (0.06 + twilight * 0.22 + daylight * 0.08);
        color = mix(
          color,
          color * vec3(1.028, 1.018, 0.994) + vec3(0.014, 0.011, 0.008),
          duskLift * 0.13
        );

        color += nightAlbedo * nightMask * 0.0108;

        gl_FragColor = vec4(color, 1.0);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <dithering_fragment>
      }
    `,
  });
  material.toneMapped = true;

  return {
    dispose: () => {
      material.dispose();
    },
    material,
    setRingShadowStrength: (ringShadowStrength) => {
      ringShadowStrengthUniform.value = ringShadowStrength;
    },
    setScatteringTexture: (scatteringTextureValue) => {
      material.uniforms.scatteringTexture.value = scatteringTextureValue;
    },
    setSunDirections: (localSunDirection, worldSunDirection) => {
      if (localSunDirection.lengthSq() <= 1.0e-8) {
        localSunDirectionUniform.value.set(1, 0, 0);
      } else {
        localSunDirectionUniform.value.copy(localSunDirection).normalize();
      }

      if (worldSunDirection.lengthSq() <= 1.0e-8) {
        worldSunDirectionUniform.value.set(1, 0, 0);
      } else {
        worldSunDirectionUniform.value.copy(worldSunDirection).normalize();
      }
    },
  };
}
