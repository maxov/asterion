import {
  BackSide,
  Color,
  FrontSide,
  ShaderMaterial,
  type Side,
  type Texture,
  Vector3,
} from "three";
import {
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
} from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";

const SATURN_EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS);
const SATURN_POLAR = kmToUnits(SATURN_POLAR_RADIUS);
const RING_SHADOW_UMBRA_SOFTNESS = SATURN_EQUATORIAL * 0.012;
const RING_SHADOW_PENUMBRA_SOFTNESS = SATURN_EQUATORIAL * 0.055;
const SATURNSHINE_EQUIVALENT_RADIUS = Math.sqrt(
  SATURN_EQUATORIAL * SATURN_POLAR,
);
const SATURNSHINE_COLOR = new Color(1.0, 0.91, 0.76);
const PROFILE_TEXEL_SIZE = 1 / 13177;

type SharedRingUniforms = {
  chromaGain: { value: number };
  localSunDirection: { value: Vector3 };
  opacity: { value: number };
  planetShadowStrength: { value: number };
  saturnshineColor: { value: Color };
  warmth: { value: number };
  worldSunDirection: { value: Vector3 };
};

export type SaturnRingMaterialBundle = {
  back: ShaderMaterial;
  dispose: () => void;
  front: ShaderMaterial;
  setLook: (
    chromaGain: number,
    opacity: number,
    planetShadowStrength: number,
    warmth: number,
  ) => void;
  setSunDirections: (localSunDirection: Vector3, worldSunDirection: Vector3) => void;
};

function createMaterial(
  colorTexture: Texture,
  scatteringTexture: Texture,
  side: Side,
  uniforms: SharedRingUniforms,
) {
  const material = new ShaderMaterial({
    uniforms: {
      colorTexture: { value: colorTexture },
      scatteringTexture: { value: scatteringTexture },
      chromaGain: uniforms.chromaGain,
      localSunDirection: uniforms.localSunDirection,
      opacity: uniforms.opacity,
      planetShadowStrength: uniforms.planetShadowStrength,
      saturnshineColor: uniforms.saturnshineColor,
      warmth: uniforms.warmth,
      worldSunDirection: uniforms.worldSunDirection,
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalPosition;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vLocalPosition = position;

        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);

        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D colorTexture;
      uniform sampler2D scatteringTexture;
      uniform float chromaGain;
      uniform vec3 localSunDirection;
      uniform float opacity;
      uniform float planetShadowStrength;
      uniform vec3 saturnshineColor;
      uniform float warmth;
      uniform vec3 worldSunDirection;

      varying vec3 vLocalPosition;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      const float SATURN_EQUATORIAL = ${SATURN_EQUATORIAL.toFixed(6)};
      const float SATURN_POLAR = ${SATURN_POLAR.toFixed(6)};
      const float RING_SHADOW_UMBRA_SOFTNESS = ${RING_SHADOW_UMBRA_SOFTNESS.toFixed(6)};
      const float RING_SHADOW_PENUMBRA_SOFTNESS = ${RING_SHADOW_PENUMBRA_SOFTNESS.toFixed(6)};
      const float RING_SHADOW_PENUMBRA_OPACITY = 0.58;
      const float RING_SHADOW_DENSITY_BOOST = 2.35;
      const float SATURNSHINE_BOND_ALBEDO = 0.34;
      const float SATURNSHINE_EQUIVALENT_RADIUS = ${SATURNSHINE_EQUIVALENT_RADIUS.toFixed(6)};
      const float SATURNSHINE_CALIBRATION = 1.7;
      const float SATURNSHINE_LIMB_HAZE_SCALE = 0.28;
      const float SATURNSHINE_RINGSHINE_FLOOR = 0.0035;
      const float SATURNSHINE_MAX_FILL = 0.085;
      const float RING_SHADOW_SUN_PROJECTION_EPSILON = 1.0e-4;
      const float ALPHA_EPSILON = 1.0e-4;
      const float UNLIT_TRANSITION = 0.02;
      const float PROJECTED_OPACITY_MIN_COSINE = 0.08;
      const float PROFILE_TEXEL_SIZE = ${PROFILE_TEXEL_SIZE.toFixed(8)};

      #include <dithering_pars_fragment>

      float safeOpticalDepth(float opacityValue) {
        float transmittance = clamp(1.0 - opacityValue, ALPHA_EPSILON, 1.0);
        return -log(transmittance);
      }

      float projectedOpacity(float opacityValue, float cosineValue) {
        float opticalDepth = safeOpticalDepth(opacityValue);
        return 1.0 - exp(-opticalDepth / max(abs(cosineValue), PROJECTED_OPACITY_MIN_COSINE));
      }

      vec3 extractTint(vec3 colorSample, float gain) {
        float luma = max(dot(colorSample, vec3(0.2126, 0.7152, 0.0722)), 0.05);
        vec3 tinted = vec3(
          1.0 + (colorSample.r / luma - 1.0) * gain,
          1.0 + (colorSample.g / luma - 1.0) * gain,
          1.0 + (colorSample.b / luma - 1.0) * gain
        );
        return clamp(tinted, vec3(0.0), vec3(1.4));
      }

      vec3 applyWarmTint(vec3 colorValue, float warmthValue) {
        return vec3(
          colorValue.r * (1.0 + 0.08 * warmthValue),
          colorValue.g * (1.0 + 0.02 * warmthValue),
          colorValue.b * (1.0 - 0.08 * warmthValue)
        );
      }

      float computeProfileFilterRadius(float viewPlaneDot, float opacityValue) {
        float edgeOn = 1.0 - smoothstep(0.18, 0.82, abs(viewPlaneDot));
        float density = smoothstep(0.04, 0.68, opacityValue);
        float filterTexels = mix(1.25, 28.0, edgeOn * mix(0.5, 1.0, density));
        return PROFILE_TEXEL_SIZE * filterTexels;
      }

      vec4 sampleFilteredScattering(float u, float radius) {
        float center = clamp(u, 0.0, 1.0);
        float offset1 = radius;
        float offset2 = radius * 2.4;

        return
          texture2D(scatteringTexture, vec2(clamp(center - offset2, 0.0, 1.0), 0.5)) * 0.06136 +
          texture2D(scatteringTexture, vec2(clamp(center - offset1, 0.0, 1.0), 0.5)) * 0.24477 +
          texture2D(scatteringTexture, vec2(center, 0.5)) * 0.38774 +
          texture2D(scatteringTexture, vec2(clamp(center + offset1, 0.0, 1.0), 0.5)) * 0.24477 +
          texture2D(scatteringTexture, vec2(clamp(center + offset2, 0.0, 1.0), 0.5)) * 0.06136;
      }

      vec3 sampleFilteredColor(float u, float radius) {
        float center = clamp(u, 0.0, 1.0);
        float offset1 = radius;
        float offset2 = radius * 2.4;

        return
          sRGBTransferEOTF(texture2D(colorTexture, vec2(clamp(center - offset2, 0.0, 1.0), 0.5))).rgb * 0.06136 +
          sRGBTransferEOTF(texture2D(colorTexture, vec2(clamp(center - offset1, 0.0, 1.0), 0.5))).rgb * 0.24477 +
          sRGBTransferEOTF(texture2D(colorTexture, vec2(center, 0.5))).rgb * 0.38774 +
          sRGBTransferEOTF(texture2D(colorTexture, vec2(clamp(center + offset1, 0.0, 1.0), 0.5))).rgb * 0.24477 +
          sRGBTransferEOTF(texture2D(colorTexture, vec2(clamp(center + offset2, 0.0, 1.0), 0.5))).rgb * 0.06136;
      }

      vec3 shapeRingColor(
        vec3 colorSample,
        float gain,
        float warmthValue,
        float phaseMix,
        float unlitMix
      ) {
        float luma = max(dot(colorSample, vec3(0.2126, 0.7152, 0.0722)), 0.05);
        vec3 neutral = vec3(luma);
        float gainMix = clamp((gain - 1.0) / 5.0, 0.0, 1.0);
        float chromaStrength =
          mix(0.18, 0.32, gainMix) *
          mix(1.0, 0.82, phaseMix) *
          mix(1.0, 0.38, unlitMix);
        vec3 softenedChroma = mix(neutral, colorSample, chromaStrength);
        softenedChroma.g = mix(neutral.g, softenedChroma.g, 0.86);
        softenedChroma.b = mix(neutral.b, softenedChroma.b, 0.42);
        vec3 warmNeutral = neutral * vec3(
          mix(1.03, 1.085, warmthValue),
          mix(1.002, 1.018, warmthValue),
          mix(0.99, 0.928, warmthValue)
        );

        return mix(
          warmNeutral,
          applyWarmTint(softenedChroma, warmthValue),
          0.24 + gainMix * 0.12
        );
      }

      float shadowCoverageFromInsideDistance(
        float insideDistance,
        float umbraSoftness,
        float penumbraSoftness
      ) {
        if (insideDistance <= -penumbraSoftness) return 0.0;

        float outerCoverage = smoothstep(-penumbraSoftness, 0.0, insideDistance);
        float umbraCoverage = smoothstep(0.0, umbraSoftness, insideDistance);

        return outerCoverage * mix(
          RING_SHADOW_PENUMBRA_OPACITY,
          1.0,
          umbraCoverage
        );
      }

      float computeSaturnSolidAngleFraction(float radius) {
        float clampedRatio = clamp(
          SATURNSHINE_EQUIVALENT_RADIUS / max(radius, SATURNSHINE_EQUIVALENT_RADIUS + 1.0e-4),
          0.0,
          0.999999
        );
        return 1.0 - sqrt(max(1.0 - clampedRatio * clampedRatio, 0.0));
      }

      float computeSaturnshineFillStrength(
        float radius,
        float px,
        float py,
        vec3 sunDirectionValue,
        float boostedRingOpacity
      ) {
        float saturnToSampleX = px / radius;
        float saturnToSampleY = py / radius;
        float cosPhase = clamp(
          saturnToSampleX * sunDirectionValue.x +
            saturnToSampleY * sunDirectionValue.y,
          -1.0,
          1.0
        );
        float visibleLitHemisphere = 0.5 * (1.0 + cosPhase);
        float sunElevation = abs(sunDirectionValue.z);
        float limbHaze =
          sqrt(max(1.0 - cosPhase * cosPhase, 0.0)) * sunElevation;
        float solidAngleFraction = computeSaturnSolidAngleFraction(radius);
        float saturnshine =
          SATURNSHINE_BOND_ALBEDO *
          solidAngleFraction *
          (visibleLitHemisphere + SATURNSHINE_LIMB_HAZE_SCALE * limbHaze) *
          SATURNSHINE_CALIBRATION *
          mix(0.78, 1.08, boostedRingOpacity);
        float ringshine =
          solidAngleFraction *
          SATURNSHINE_RINGSHINE_FLOOR *
          mix(0.35, 1.0, boostedRingOpacity);

        return clamp(
          saturnshine + ringshine,
          0.0,
          SATURNSHINE_MAX_FILL
        );
      }

      void main() {
        vec3 worldViewDir = normalize(cameraPosition - vWorldPosition);
        vec3 worldNormal = normalize(vWorldNormal);
        vec3 worldSunDir = normalize(worldSunDirection);
        float rawOpacity = 1.0 - texture2D(
          scatteringTexture,
          vec2(clamp(vUv.x, 0.0, 1.0), 0.5)
        ).a;
        float profileFilterRadius = computeProfileFilterRadius(
          dot(worldViewDir, worldNormal),
          rawOpacity
        );
        vec4 scatteringTexel = sampleFilteredScattering(vUv.x, profileFilterRadius);
        vec3 filteredColor = sampleFilteredColor(vUv.x, profileFilterRadius);

        float backscatter = scatteringTexel.r;
        float forwardscatter = scatteringTexel.g;
        float unlit = scatteringTexel.b;
        float baseOpacity = 1.0 - scatteringTexel.a;

        if (baseOpacity <= 5.0e-4 || opacity <= 5.0e-4) discard;

        float phase = 0.5 * (
          1.0 - clamp(dot(worldViewDir, worldSunDir), -1.0, 1.0)
        );
        float phaseMix = smoothstep(0.0, 1.0, phase);
        float viewPlaneDot = dot(worldViewDir, worldNormal);
        float sunPlaneDot = dot(worldSunDir, worldNormal);
        float unlitMix = 1.0 - smoothstep(
          -UNLIT_TRANSITION,
          UNLIT_TRANSITION,
          viewPlaneDot * sunPlaneDot
        );
        vec3 tint = shapeRingColor(
          filteredColor,
          chromaGain,
          warmth,
          phaseMix,
          unlitMix
        );

        float oppositionSurge = pow(max(1.0 - phase, 0.0), 12.0) * 0.12;
        float litBrightness = mix(backscatter, forwardscatter, phaseMix) * (1.0 + oppositionSurge);
        float brightness = mix(litBrightness, unlit, unlitMix);
        float visibleOpacity = projectedOpacity(baseOpacity, viewPlaneDot);
        float finalAlpha = clamp(visibleOpacity * opacity, 0.0, 1.0);

        if (finalAlpha <= 5.0e-4) discard;

        float shadowAlpha = 0.0;
        float fillAlpha = 0.0;
        vec3 ringPosition = vec3(vLocalPosition.xy, 0.0);
        vec3 localSunDir = normalize(localSunDirection);
        float projectionLength = length(localSunDir.xy);

        if (
          planetShadowStrength > 0.0 &&
          projectionLength > RING_SHADOW_SUN_PROJECTION_EPSILON
        ) {
          float boostedRingOpacity =
            1.0 - pow(1.0 - visibleOpacity, RING_SHADOW_DENSITY_BOOST);
          float shadowAxisX = -localSunDir.x / projectionLength;
          float shadowAxisY = -localSunDir.y / projectionLength;
          float lateralAxisX = -shadowAxisY;
          float lateralAxisY = shadowAxisX;
          float semiMinor = SATURN_EQUATORIAL;
          float semiMinorSquared = semiMinor * semiMinor;
          float umbraSoftness = min(
            RING_SHADOW_UMBRA_SOFTNESS,
            semiMinor * 0.25
          );
          float penumbraSoftness = min(
            RING_SHADOW_PENUMBRA_SOFTNESS,
            semiMinor * 0.5
          );
          float normalComponent = abs(localSunDir.z);
          bool usesInfiniteStrip =
            normalComponent <= RING_SHADOW_SUN_PROJECTION_EPSILON;
          float semiMajor = usesInfiniteStrip
            ? 1.0e20
            : sqrt(
                semiMinorSquared +
                  (
                    (SATURN_POLAR * SATURN_POLAR) *
                    projectionLength *
                    projectionLength
                  ) /
                  (normalComponent * normalComponent)
              );

          float px = ringPosition.x;
          float py = ringPosition.y;
          float radius = length(ringPosition.xy);
          float u = px * shadowAxisX + py * shadowAxisY;
          float frontDistance = u;

          if (frontDistance > -penumbraSoftness) {
            float v = px * lateralAxisX + py * lateralAxisY;
            float lateralInsideDistance = semiMinor - abs(v);

            if (lateralInsideDistance > -penumbraSoftness) {
              float frontCoverage = shadowCoverageFromInsideDistance(
                frontDistance,
                umbraSoftness,
                penumbraSoftness
              );
              float lateralCoverage = shadowCoverageFromInsideDistance(
                lateralInsideDistance,
                umbraSoftness,
                penumbraSoftness
              );

              if (frontCoverage > 0.0 && lateralCoverage > 0.0) {
                float axialCoverage = 1.0;

                if (!usesInfiniteStrip) {
                  float axialLimit =
                    semiMajor *
                    sqrt(max(1.0 - (v * v) / semiMinorSquared, 0.0));
                  float axialInsideDistance = axialLimit - u;

                  if (axialInsideDistance <= -penumbraSoftness) {
                    axialCoverage = 0.0;
                  } else {
                    axialCoverage = shadowCoverageFromInsideDistance(
                      axialInsideDistance,
                      umbraSoftness,
                      penumbraSoftness
                    );
                  }
                }

                if (axialCoverage > 0.0) {
                  float shadowCoverage = min(
                    frontCoverage,
                    min(lateralCoverage, axialCoverage)
                  );
                  shadowAlpha = clamp(
                    planetShadowStrength *
                      boostedRingOpacity *
                      shadowCoverage,
                    0.0,
                    1.0
                  );

                  float fillStrength = min(planetShadowStrength, 1.0);
                  fillAlpha = clamp(
                    fillStrength *
                      computeSaturnshineFillStrength(
                        radius,
                        px,
                        py,
                        localSunDir,
                        boostedRingOpacity
                      ) *
                      boostedRingOpacity *
                      shadowCoverage,
                    0.0,
                    1.0
                  );
                }
              }
            }
          }
        }

        float shadowDarkening = mix(1.0, 0.1, pow(shadowAlpha, 0.88));
        vec3 shadowTint = mix(vec3(1.0), vec3(0.9, 0.84, 0.76), shadowAlpha * 0.85);
        vec3 finalColor = tint * brightness * shadowTint * shadowDarkening;
        finalColor += tint * unlit * shadowAlpha * 0.016;
        if (fillAlpha > 0.0) {
          finalColor += saturnshineColor * (fillAlpha / max(finalAlpha, 0.04)) * 0.78;
        }

        gl_FragColor = vec4(finalColor, finalAlpha);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <premultiplied_alpha_fragment>
        #include <dithering_fragment>
      }
    `,
    transparent: true,
    premultipliedAlpha: true,
    side,
    depthWrite: false,
  });
  material.toneMapped = true;
  material.alphaTest = 0.002;
  material.alphaToCoverage = true;

  return material;
}

export function createSaturnRingMaterialBundle(
  colorTexture: Texture,
  scatteringTexture: Texture,
): SaturnRingMaterialBundle {
  const uniforms: SharedRingUniforms = {
    chromaGain: { value: 1.45 },
    localSunDirection: { value: new Vector3(1, 0, 0) },
    opacity: { value: 0.7 },
    planetShadowStrength: { value: 1.36 },
    saturnshineColor: { value: SATURNSHINE_COLOR.clone() },
    warmth: { value: 0.26 },
    worldSunDirection: { value: new Vector3(1, 0, 0) },
  };

  const back = createMaterial(
    colorTexture,
    scatteringTexture,
    BackSide,
    uniforms,
  );
  const front = createMaterial(
    colorTexture,
    scatteringTexture,
    FrontSide,
    uniforms,
  );

  return {
    back,
    dispose: () => {
      back.dispose();
      front.dispose();
    },
    front,
    setLook: (nextChromaGain, nextOpacity, nextPlanetShadowStrength, nextWarmth) => {
      uniforms.chromaGain.value = nextChromaGain;
      uniforms.opacity.value = nextOpacity;
      uniforms.planetShadowStrength.value = nextPlanetShadowStrength;
      uniforms.warmth.value = nextWarmth;
    },
    setSunDirections: (nextLocalSunDirection, nextWorldSunDirection) => {
      if (nextLocalSunDirection.lengthSq() <= 1e-8) {
        uniforms.localSunDirection.value.set(1, 0, 0);
      } else {
        uniforms.localSunDirection.value.copy(nextLocalSunDirection).normalize();
      }

      if (nextWorldSunDirection.lengthSq() <= 1e-8) {
        uniforms.worldSunDirection.value.set(1, 0, 0);
      } else {
        uniforms.worldSunDirection.value.copy(nextWorldSunDirection).normalize();
      }
    },
  };
}
