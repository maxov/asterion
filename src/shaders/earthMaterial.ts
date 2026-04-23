import { ShaderMaterial, type Texture, Vector3 } from "three";

export const EARTH_SURFACE_DEBUG_VIEW_IDS = {
  beauty: 0,
  dayTexture: 1,
  nightTexture: 2,
  blendFactor: 3,
  sunAlignment: 4,
  waterMask: 5,
  cityLights: 6,
  specular: 7,
} as const;

export type EarthSurfaceDebugView =
  keyof typeof EARTH_SURFACE_DEBUG_VIEW_IDS;

export type EarthMaterialBundle = {
  atmosphereIntensityUniform: { value: number };
  material: ShaderMaterial;
  cityLightVisibilityUniform: { value: number };
  debugViewUniform: { value: number };
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
  const atmosphereIntensityUniform = { value: 0.8 };
  const cityLightVisibilityUniform = { value: 1 };
  const debugViewUniform = { value: EARTH_SURFACE_DEBUG_VIEW_IDS.beauty };
  const monthBlendUniform = { value: initialMonthBlend };
  const nightLightsUniform = { value: initialNightLights };
  const sunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTexture },
      nextDayTexture: { value: nextDayTexture ?? dayTexture },
      nightTexture: { value: nightTexture },
      atmosphereIntensity: atmosphereIntensityUniform,
      cityLightVisibility: cityLightVisibilityUniform,
      debugView: debugViewUniform,
      monthBlend: monthBlendUniform,
      nightLights: nightLightsUniform,
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
      uniform sampler2D dayTexture;
      uniform sampler2D nextDayTexture;
      uniform sampler2D nightTexture;
      uniform float atmosphereIntensity;
      uniform float cityLightVisibility;
      uniform int debugView;
      uniform float monthBlend;
      uniform float nightLights;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;

      float max3(vec3 value) {
        return max(value.r, max(value.g, value.b));
      }

      void main() {
        vec3 normal = normalize(vNormalView);
        vec3 viewDir = normalize(-vViewPosition);
        vec3 sunDir = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);

        vec3 daySample = texture2D(dayTexture, vUv).rgb;
        vec3 nextDaySample = texture2D(nextDayTexture, vUv).rgb;
        vec3 nightSample = texture2D(nightTexture, vUv).rgb;

        vec3 dayColor = mix(daySample, nextDaySample, monthBlend);
        float sunAlignment = dot(normal, sunDir);
        float daylight = smoothstep(-0.24, 0.14, sunAlignment);
        float twilight = max(
          smoothstep(-0.24, 0.02, sunAlignment) -
            smoothstep(0.02, 0.16, sunAlignment),
          0.0
        );
        float nightMask = smoothstep(0.12, 0.52, -sunAlignment);

        float brightestChannel = max3(dayColor);
        float blueDominance = smoothstep(
          0.015,
          0.24,
          dayColor.b - max(dayColor.r, dayColor.g) * 0.82
        );
        float aquaBias = smoothstep(0.04, 0.32, dayColor.b - dayColor.r)
          * smoothstep(-0.02, 0.16, dayColor.g - dayColor.r);
        float brightnessPenalty = 1.0 - smoothstep(0.42, 0.86, brightestChannel);
        float waterMask = clamp(max(blueDominance, aquaBias) * brightnessPenalty * 1.1, 0.0, 1.0);

        float viewDot = max(dot(normal, viewDir), 0.0);
        float viewFresnel = pow(1.0 - viewDot, 4.0);
        float horizonScatter = pow(1.0 - viewDot, 1.7);
        float atmoStrength = max(atmosphereIntensity, 0.0);
        float dayHaze = horizonScatter
          * smoothstep(-0.22, 0.5, sunAlignment)
          * 0.18
          * atmoStrength;
        float aerialAmount = horizonScatter
          * smoothstep(-0.16, 0.65, sunAlignment)
          * atmoStrength;
        vec3 aerialBlue = mix(
          vec3(0.03, 0.07, 0.16),
          vec3(0.08, 0.16, 0.34),
          waterMask * 0.65 + 0.2
        ) * aerialAmount;
        vec3 surfaceColor = mix(
          dayColor,
          dayColor * vec3(0.82, 0.92, 1.12) + vec3(0.012, 0.028, 0.075),
          dayHaze
        ) + aerialBlue;

        vec3 oceanTint = mix(
          vec3(1.0),
          vec3(0.68, 0.9, 1.24),
          waterMask * (0.34 + horizonScatter * 0.42)
        );
        surfaceColor *= oceanTint;

        float landHaze = aerialAmount * (1.0 - waterMask) * smoothstep(-0.06, 0.55, sunAlignment);
        float landLuma = dot(surfaceColor, vec3(0.2126, 0.7152, 0.0722));
        vec3 coolLand = mix(
          surfaceColor,
          vec3(landLuma) * vec3(0.93, 0.99, 1.06) + vec3(0.006, 0.012, 0.03),
          0.4
        );
        surfaceColor = mix(surfaceColor, coolLand, landHaze * 0.55);

        float dayBlueLift = aerialAmount * (0.12 + waterMask * 0.3);
        surfaceColor = mix(
          surfaceColor,
          surfaceColor * vec3(0.9, 0.97, 1.08) + vec3(0.008, 0.016, 0.04),
          dayBlueLift
        );

        float diffuse = clamp(sunAlignment * 0.58 + 0.42, 0.0, 1.0);
        vec3 diffuseColor = surfaceColor * (0.03 + diffuse * 0.97);
        vec3 litSurface = mix(surfaceColor * 0.018, diffuseColor, daylight);

        vec3 twilightTint = mix(
          vec3(0.03, 0.06, 0.12),
          vec3(0.12, 0.15, 0.2),
          smoothstep(-0.08, 0.12, sunAlignment)
        );
        vec3 twilightGlow = twilightTint
          * twilight
          * (0.03 + viewFresnel * 0.16)
          * atmoStrength;

        vec3 halfVector = normalize(viewDir + sunDir);
        float specularPower = mix(24.0, 180.0, waterMask);
        float specularStrength = mix(0.03, 0.75, waterMask);
        float specular = pow(max(dot(normal, halfVector), 0.0), specularPower)
          * specularStrength
          * smoothstep(-0.08, 0.2, sunAlignment);
        vec3 specularColor = mix(
          vec3(1.0, 0.985, 0.97),
          vec3(0.74, 0.9, 1.0),
          waterMask
        );

        float cityMask = smoothstep(0.08, 0.28, max3(nightSample));
        vec3 cityLights = nightSample
          * cityMask
          * nightMask
          * nightLights
          * cityLightVisibility
          * (1.0 - twilight * 0.55);
        vec3 finalColor = litSurface + twilightGlow + specularColor * specular + cityLights;
        vec3 debugColor = finalColor;

        if (debugView == 1) {
          debugColor = daySample;
        } else if (debugView == 2) {
          debugColor = nightSample;
        } else if (debugView == 3) {
          debugColor = vec3(monthBlend);
        } else if (debugView == 4) {
          debugColor = vec3(sunAlignment * 0.5 + 0.5);
        } else if (debugView == 5) {
          debugColor = vec3(waterMask);
        } else if (debugView == 6) {
          debugColor = cityLights;
        } else if (debugView == 7) {
          debugColor = specularColor * specular * 4.0;
        }

        gl_FragColor = vec4(debugColor, 1.0);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  material.toneMapped = true;

  return {
    atmosphereIntensityUniform,
    material,
    cityLightVisibilityUniform,
    debugViewUniform,
    monthBlendUniform,
    nightLightsUniform,
    sunDirectionUniform,
  };
}
