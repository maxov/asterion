import { ShaderMaterial, type Texture, Vector3 } from "three";
import {
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
} from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";

const EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS);
const POLAR_SCALE = SATURN_POLAR_RADIUS / SATURN_EQUATORIAL_RADIUS;
const POLAR = EQUATORIAL * POLAR_SCALE;
const RING_INNER = kmToUnits(RING_INNER_RADIUS);
const RING_OUTER = kmToUnits(RING_OUTER_RADIUS);
const PROFILE_TEXEL_SIZE = 1 / 13177;

export type SaturnRingShadowMaterialBundle = {
  dispose: () => void;
  material: ShaderMaterial;
  setShadowStrength: (shadowStrength: number) => void;
  setSunDirection: (sunDirection: Vector3) => void;
};

export function createSaturnRingShadowMaterial(
  scatteringTexture: Texture,
): SaturnRingShadowMaterialBundle {
  const shadowStrengthUniform = { value: 0.78 };
  const sunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
      scatteringTexture: { value: scatteringTexture },
      shadowStrength: shadowStrengthUniform,
      sunDirection: sunDirectionUniform,
    },
    vertexShader: /* glsl */ `
      varying vec3 vPlanetPosition;

      const float POLAR_SCALE = ${POLAR_SCALE.toFixed(8)};

      void main() {
        vPlanetPosition = vec3(position.x, position.y * POLAR_SCALE, position.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D scatteringTexture;
      uniform float shadowStrength;
      uniform vec3 sunDirection;

      varying vec3 vPlanetPosition;

      const float EQUATORIAL = ${EQUATORIAL.toFixed(6)};
      const float POLAR = ${POLAR.toFixed(6)};
      const float RING_INNER = ${RING_INNER.toFixed(6)};
      const float RING_OUTER = ${RING_OUTER.toFixed(6)};
      const float RING_EDGE_SOFTNESS = ${(EQUATORIAL * 0.0025).toFixed(6)};
      const float SHADOW_FADE_START = 0.03;
      const float SHADOW_FADE_END = 0.12;
      const float SHADOW_DAYLIGHT_START = -0.24;
      const float SHADOW_DAYLIGHT_END = 0.14;
      const float PROJECTED_OPACITY_MIN_COSINE = 0.06;
      const float PROFILE_TEXEL_SIZE = ${PROFILE_TEXEL_SIZE.toFixed(8)};
      const vec3 SHADOW_COLOR = vec3(0.0, 0.0, 0.0);

      #include <dithering_pars_fragment>

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

      void main() {
        vec3 sun = normalize(sunDirection);
        float sunElevation = abs(sun.y);
        float elevationFade = smoothstep(
          SHADOW_FADE_START,
          SHADOW_FADE_END,
          sunElevation
        );

        if (
          shadowStrength <= 0.0 ||
          sunElevation <= 1.0e-5 ||
          elevationFade <= 0.0
        ) {
          discard;
        }

        vec3 positionValue = vPlanetPosition;
        float inverseEquatorialSquared = 1.0 / (EQUATORIAL * EQUATORIAL);
        float inversePolarSquared = 1.0 / (POLAR * POLAR);
        vec3 normal = normalize(
          vec3(
            positionValue.x * inverseEquatorialSquared,
            positionValue.y * inversePolarSquared,
            positionValue.z * inverseEquatorialSquared
          )
        );
        float lit = dot(normal, sun);

        float rayDistance = -positionValue.y / sun.y;
        if (rayDistance <= 0.0) discard;

        vec3 ringHit = positionValue + sun * rayDistance;
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

        if (ringMask <= 0.0) discard;

        float radialMix = clamp(
          (radial - RING_INNER) / (RING_OUTER - RING_INNER),
          0.0,
          1.0
        );
        float baseOpacity = sampleFilteredOpacity(radialMix);

        if (baseOpacity <= 5.0e-4) discard;

        float projectedRingOpacity = projectedOpacity(baseOpacity, sun.y);
        float dayFade = smoothstep(
          SHADOW_DAYLIGHT_START,
          SHADOW_DAYLIGHT_END,
          lit
        );
        float alpha = clamp(
          projectedRingOpacity *
            shadowStrength *
            elevationFade *
            dayFade *
            ringMask,
          0.0,
          1.0
        );

        if (alpha <= 5.0e-4) discard;

        gl_FragColor = vec4(SHADOW_COLOR, alpha);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <premultiplied_alpha_fragment>
        #include <dithering_fragment>
      }
    `,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  });
  material.toneMapped = true;

  return {
    dispose: () => {
      material.dispose();
    },
    material,
    setShadowStrength: (shadowStrength) => {
      shadowStrengthUniform.value = shadowStrength;
    },
    setSunDirection: (sunDirection) => {
      if (sunDirection.lengthSq() <= 1e-8) {
        sunDirectionUniform.value.set(1, 0, 0);
      } else {
        sunDirectionUniform.value.copy(sunDirection).normalize();
      }
    },
  };
}
