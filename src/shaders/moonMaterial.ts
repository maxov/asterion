import {
  ShaderMaterial,
  Vector2,
  Vector3,
  type Texture,
} from "three";

export type MoonMaterialBundle = {
  diskVisibilityStrengthUniform: { value: number };
  earthDirectionUniform: { value: Vector3 };
  earthshineStrengthUniform: { value: number };
  material: ShaderMaterial;
  sunDirectionUniform: { value: Vector3 };
};

const DEFAULT_HEIGHT_TEXEL_SIZE = new Vector2(1 / 4096, 1 / 2048);

function texelSizeForTexture(texture: Texture) {
  const image = texture.image as { width?: number; height?: number } | undefined;
  if (!image?.width || !image?.height) {
    return DEFAULT_HEIGHT_TEXEL_SIZE.clone();
  }

  return new Vector2(1 / image.width, 1 / image.height);
}

export function createMoonMaterial(
  albedoTexture: Texture,
  heightTexture: Texture,
  displacementScale: number,
  displacementBias: number,
): MoonMaterialBundle {
  const diskVisibilityStrengthUniform = { value: 0.0048 };
  const earthDirectionUniform = { value: new Vector3(-1, 0, 0) };
  const earthshineStrengthUniform = { value: 0.04 };
  const sunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
      albedoTexture: { value: albedoTexture },
      ambientStrength: { value: 0.0 },
      diskVisibilityStrength: diskVisibilityStrengthUniform,
      directStrength: { value: 1.18 },
      displacementBias: { value: displacementBias },
      earthDirection: earthDirectionUniform,
      earthshineStrength: earthshineStrengthUniform,
      displacementScale: { value: displacementScale },
      heightTexelSize: { value: texelSizeForTexture(heightTexture) },
      heightTexture: { value: heightTexture },
      normalStrength: { value: 1.22 },
      selfShadowStrength: { value: 0.54 },
      shadowSlopeSoftness: { value: 0.04 },
      shadowTraceDistance: { value: 0.055 },
      sunDirection: sunDirectionUniform,
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;
      varying vec3 vWorldRadial;
      varying vec3 vWorldTangentU;
      varying vec3 vWorldTangentV;

      uniform sampler2D heightTexture;
      uniform float displacementBias;
      uniform float displacementScale;

      vec3 moonTangentU(vec3 localPosition) {
        vec3 tangent = vec3(localPosition.z, 0.0, -localPosition.x);
        float tangentLength = length(tangent);

        if (tangentLength <= 1e-5) {
          return vec3(1.0, 0.0, 0.0);
        }

        return tangent / tangentLength;
      }

      void main() {
        vUv = uv;

        float height = texture2D(heightTexture, uv).r;
        float displacement = height * displacementScale + displacementBias;
        vec3 displacedPosition = position + normalize(normal) * displacement;
        vec3 radial = normalize(displacedPosition);
        vec3 tangentU = moonTangentU(displacedPosition);
        vec3 tangentV = normalize(cross(tangentU, radial));
        vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);

        vLocalPosition = displacedPosition;
        vWorldPosition = worldPosition.xyz;
        vWorldRadial = normalize(mat3(modelMatrix) * radial);
        vWorldTangentU = normalize(mat3(modelMatrix) * tangentU);
        vWorldTangentV = normalize(mat3(modelMatrix) * tangentV);

        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vLocalPosition;
      varying vec3 vWorldPosition;
      varying vec3 vWorldRadial;
      varying vec3 vWorldTangentU;
      varying vec3 vWorldTangentV;

      uniform sampler2D albedoTexture;
      uniform sampler2D heightTexture;
      uniform vec2 heightTexelSize;
      uniform float diskVisibilityStrength;
      uniform vec3 earthDirection;
      uniform float earthshineStrength;
      uniform vec3 sunDirection;
      uniform float ambientStrength;
      uniform float directStrength;
      uniform float displacementScale;
      uniform float normalStrength;
      uniform float selfShadowStrength;
      uniform float shadowSlopeSoftness;
      uniform float shadowTraceDistance;

      const int MOON_SHADOW_STEPS = 6;
      const float PI = 3.141592653589793;

      float sampleHeight(vec2 uv) {
        vec2 wrappedUv = vec2(fract(uv.x + 1.0), clamp(uv.y, 0.0, 1.0));
        return texture2D(heightTexture, wrappedUv).r;
      }

      vec3 safeNormalize(vec3 value, vec3 fallbackValue) {
        float valueLength = length(value);
        if (valueLength <= 1e-6) {
          return fallbackValue;
        }

        return value / valueLength;
      }

      vec2 safeNormalize(vec2 value, vec2 fallbackValue) {
        float valueLength = length(value);
        if (valueLength <= 1e-6) {
          return fallbackValue;
        }

        return value / valueLength;
      }

      float selfShadowFactor(
        vec2 uv,
        float centerHeight,
        vec2 lightPlaneDirection,
        float lightSlope,
        float sunAltitude,
        float worldPerUvU,
        float worldPerUvV
      ) {
        if (lightSlope <= 1e-4) {
          return 1.0;
        }

        float terminatorBoost = 1.0 - smoothstep(0.14, 0.62, sunAltitude);
        float effectiveTraceDistance = mix(
          shadowTraceDistance * 0.42,
          shadowTraceDistance,
          terminatorBoost
        );
        float maxTerrainSlope = -1e6;

        for (int i = 1; i <= MOON_SHADOW_STEPS; i += 1) {
          float t = float(i) / float(MOON_SHADOW_STEPS);
          float travel = effectiveTraceDistance * t * t;
          vec2 sampleUv = uv + vec2(
            lightPlaneDirection.x * travel / worldPerUvU,
            lightPlaneDirection.y * travel / worldPerUvV
          );
          float sampleHeightOffset =
            (sampleHeight(sampleUv) - centerHeight) * displacementScale;
          maxTerrainSlope = max(
            maxTerrainSlope,
            sampleHeightOffset / max(travel, 1e-4)
          );
        }

        float effectiveSoftness = mix(
          shadowSlopeSoftness * 1.8,
          shadowSlopeSoftness,
          terminatorBoost
        );
        float occlusion = smoothstep(
          lightSlope - effectiveSoftness,
          lightSlope + effectiveSoftness,
          maxTerrainSlope
        );
        float shadowStrength = mix(
          selfShadowStrength * 0.18,
          selfShadowStrength,
          terminatorBoost * terminatorBoost
        );

        return 1.0 - occlusion * shadowStrength;
      }

      void main() {
        vec3 albedo = texture2D(albedoTexture, vUv).rgb;
        vec3 radialLocal = safeNormalize(vLocalPosition, vec3(0.0, 1.0, 0.0));
        vec3 radialWorld = safeNormalize(vWorldRadial, vec3(0.0, 1.0, 0.0));
        vec3 tangentUWorld = safeNormalize(vWorldTangentU, vec3(1.0, 0.0, 0.0));
        vec3 tangentVWorld = safeNormalize(vWorldTangentV, vec3(0.0, 0.0, 1.0));
        float radius = max(length(vLocalPosition), 1e-5);
        float sinTheta = max(length(radialLocal.xz), 0.02);
        float worldPerUvU = max(2.0 * PI * radius * sinTheta, 1e-5);
        float worldPerUvV = max(PI * radius, 1e-5);
        float sampleOffsetU = max(heightTexelSize.x, 1e-6);
        float sampleOffsetV = max(heightTexelSize.y, 1e-6);

        float centerHeight = sampleHeight(vUv);
        float eastHeight = sampleHeight(vUv + vec2(sampleOffsetU, 0.0));
        float westHeight = sampleHeight(vUv - vec2(sampleOffsetU, 0.0));
        float southHeight = sampleHeight(vUv + vec2(0.0, sampleOffsetV));
        float northHeight = sampleHeight(vUv - vec2(0.0, sampleOffsetV));

        float dHeightDu = (
          (eastHeight - westHeight) * displacementScale
        ) / max(2.0 * sampleOffsetU * worldPerUvU, 1e-6);
        float dHeightDv = (
          (southHeight - northHeight) * displacementScale
        ) / max(2.0 * sampleOffsetV * worldPerUvV, 1e-6);

        vec3 terrainNormalWorld = normalize(
          radialWorld
          - tangentUWorld * dHeightDu * normalStrength
          - tangentVWorld * dHeightDv * normalStrength
        );
        vec3 sunDir = safeNormalize(sunDirection, vec3(1.0, 0.0, 0.0));
        vec3 earthDir = safeNormalize(earthDirection, vec3(-1.0, 0.0, 0.0));
        vec3 viewDir = safeNormalize(cameraPosition - vWorldPosition, radialWorld);
        float macroSunAlignment = dot(radialWorld, sunDir);
        float terrainDetailVisibility = smoothstep(-0.045, 0.05, macroSunAlignment);
        vec3 normalWorld = normalize(
          mix(radialWorld, terrainNormalWorld, terrainDetailVisibility)
        );

        float nDotL = max(dot(normalWorld, sunDir), 0.0);
        float nDotV = max(dot(normalWorld, viewDir), 0.0);
        vec2 sunPlane = vec2(
          dot(sunDir, tangentUWorld),
          dot(sunDir, tangentVWorld)
        );
        float sunPlaneLength = length(sunPlane);
        float shadow = 1.0;

        if (macroSunAlignment > -0.005 && nDotL > 0.0 && sunPlaneLength > 1e-4) {
          shadow = selfShadowFactor(
            vUv,
            centerHeight,
            safeNormalize(sunPlane, vec2(1.0, 0.0)),
            nDotL / sunPlaneLength,
            nDotL,
            worldPerUvU,
            worldPerUvV
          );
        }

        float lambert = nDotL;
        float lommelSeeliger = nDotL / max(nDotL + nDotV, 0.12);
        float macroDaylight = smoothstep(-0.014, 0.042, macroSunAlignment);
        float diffuse = mix(lambert, lommelSeeliger, 0.72) * shadow * macroDaylight;
        float ambient = ambientStrength * smoothstep(
          -0.06,
          0.14,
          macroSunAlignment
        );
        float earthPhaseCos = clamp(dot(sunDir, -earthDir), -1.0, 1.0);
        float earthPhaseAngle = acos(earthPhaseCos);
        float earthPhase = (
          sin(earthPhaseAngle) + (PI - earthPhaseAngle) * earthPhaseCos
        ) / PI;
        float earthFacing = smoothstep(-0.12, 0.22, dot(radialWorld, earthDir));
        float earthRelief = max(dot(mix(radialWorld, normalWorld, 0.24), earthDir), 0.0);
        float earthDiffuse = mix(earthFacing, earthRelief, 0.38);
        float earthshineMask = 1.0 - smoothstep(-0.05, 0.18, macroSunAlignment);
        vec3 earthshineColor = vec3(0.92, 0.95, 1.0);
        vec3 earthshine = albedo
          * earthshineColor
          * earthshineStrength
          * earthPhase
          * earthDiffuse
          * earthshineMask;
        float viewCos = max(dot(radialWorld, viewDir), 0.0);
        float diskVisibilityMask = 1.0 - smoothstep(-0.07, 0.09, macroSunAlignment);
        float diskViewBias = mix(1.0, 1.08, pow(1.0 - viewCos, 2.4));
        float albedoLuma = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
        vec3 diskTone = mix(vec3(0.16), vec3(albedoLuma), 0.4);
        vec3 diskVisibility = diskTone
          * diskVisibilityStrength
          * diskVisibilityMask
          * diskViewBias;
        float darkSideLiftMask = 1.0 - smoothstep(-0.05, 0.12, macroSunAlignment);
        vec3 darkSideLift = diskTone
          * 0.035
          * darkSideLiftMask;
        float opposition = pow(
          max(dot(reflect(-sunDir, normalWorld), viewDir), 0.0),
          18.0
        ) * 0.03 * nDotL * macroDaylight;
        vec3 color = albedo * (ambient + diffuse * directStrength);
        color += diskVisibility;
        color += darkSideLift;
        color += earthshine;
        color += albedo * opposition;

        gl_FragColor = vec4(color, 1.0);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  material.toneMapped = true;

  return {
    diskVisibilityStrengthUniform,
    earthDirectionUniform,
    earthshineStrengthUniform,
    material,
    sunDirectionUniform,
  };
}
