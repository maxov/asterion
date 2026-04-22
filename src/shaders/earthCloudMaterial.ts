import { FrontSide, ShaderMaterial, type Texture, Vector3 } from "three";

export type EarthCloudMaterialBundle = {
  material: ShaderMaterial;
  sunDirectionUniform: { value: Vector3 };
};

export function createEarthCloudMaterial(
  cloudTexture: Texture,
): EarthCloudMaterialBundle {
  const sunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
      cloudTexture: { value: cloudTexture },
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
      uniform sampler2D cloudTexture;
      uniform vec3 sunDirection;

      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormalView);
        vec3 viewDir = normalize(-vViewPosition);
        vec3 sunDir = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);

        vec4 cloudSample = texture2D(cloudTexture, vUv);
        float cloudMask = cloudSample.a;
        float cloudCoverage = smoothstep(0.14, 0.5, cloudMask);
        float cloudCore = smoothstep(0.28, 0.78, cloudMask);
        if (cloudCoverage <= 0.015) discard;

        float sunAlignment = dot(normal, sunDir);
        float daylight = smoothstep(-0.18, 0.2, sunAlignment);
        float twilight = max(
          smoothstep(-0.22, 0.02, sunAlignment) -
            smoothstep(0.02, 0.18, sunAlignment),
          0.0
        );
        float rim = pow(1.0 - abs(dot(normal, viewDir)), 2.1);
        float forwardScatter = pow(max(dot(viewDir, sunDir), 0.0), 6.0);

        vec3 shadowColor = vec3(0.5, 0.58, 0.7);
        vec3 dayColor = vec3(0.95, 0.98, 1.0);
        vec3 twilightColor = vec3(1.0, 0.58, 0.24);
        vec3 cloudBase = mix(shadowColor, dayColor, daylight);
        vec3 cloudColor = mix(cloudBase * 0.82, cloudBase, cloudCore);
        float skyScatter = smoothstep(-0.08, 0.68, sunAlignment) * mix(0.08, 0.34, rim);
        cloudColor += vec3(0.04, 0.08, 0.18) * skyScatter * cloudCoverage;
        cloudColor +=
          twilightColor *
          twilight *
          cloudCoverage *
          (0.04 + rim * 0.18 + forwardScatter * 0.3);
        cloudColor += dayColor * daylight * rim * 0.06 * cloudCoverage;

        float opacity = cloudCoverage * (
          0.008 +
          daylight * 0.2 +
          twilight * (0.05 + forwardScatter * 0.08)
        );

        gl_FragColor = vec4(cloudColor, opacity);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    side: FrontSide,
    depthWrite: false,
  });
  material.toneMapped = true;

  return {
    material,
    sunDirectionUniform,
  };
}
