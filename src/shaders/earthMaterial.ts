import { ShaderMaterial, type Texture, Vector3 } from "three";

export type EarthMaterialBundle = {
  material: ShaderMaterial;
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
  const monthBlendUniform = { value: initialMonthBlend };
  const nightLightsUniform = { value: initialNightLights };
  const sunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTexture },
      nextDayTexture: { value: nextDayTexture ?? dayTexture },
      nightTexture: { value: nightTexture },
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
      uniform float monthBlend;
      uniform float nightLights;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;

      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>

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
        float daylight = smoothstep(-0.12, 0.08, sunAlignment);
        float nightMask = 1.0 - smoothstep(-0.08, 0.02, sunAlignment);

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

        float viewFresnel = pow(1.0 - abs(dot(normal, viewDir)), 4.0);
        float dayHaze = viewFresnel * smoothstep(-0.16, 0.5, sunAlignment) * 0.22;
        vec3 surfaceColor = mix(
          dayColor,
          dayColor * vec3(0.84, 0.9, 1.05) + vec3(0.015, 0.03, 0.06),
          dayHaze
        );

        float diffuse = max(sunAlignment, 0.0);
        vec3 diffuseColor = surfaceColor * (0.03 + diffuse * 0.97);
        vec3 litSurface = mix(surfaceColor * 0.018, diffuseColor, daylight);

        vec3 halfVector = normalize(viewDir + sunDir);
        float specularPower = mix(24.0, 180.0, waterMask);
        float specularStrength = mix(0.03, 0.75, waterMask);
        float specular = pow(max(dot(normal, halfVector), 0.0), specularPower)
          * specularStrength
          * smoothstep(0.0, 0.18, diffuse);
        vec3 specularColor = mix(
          vec3(1.0, 0.985, 0.97),
          vec3(0.88, 0.97, 1.0),
          waterMask
        );

        vec3 cityLights = nightSample * nightMask * nightLights;
        gl_FragColor = vec4(litSurface + specularColor * specular + cityLights, 1.0);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  material.toneMapped = true;

  return {
    material,
    monthBlendUniform,
    nightLightsUniform,
    sunDirectionUniform,
  };
}
