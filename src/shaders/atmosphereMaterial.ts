import {
  AdditiveBlending,
  BackSide,
  Color,
  ShaderMaterial,
  Vector3,
} from "three";

/**
 * TSL material for Saturn's atmospheric limb glow.
 *
 * A fresnel effect makes the shell glow at grazing angles, creating a
 * physically-motivated atmosphere ring visible at the planet's limb.
 * Rendered on BackSide so the planet's depth buffer occludes the center,
 * leaving only the rim visible.
 */
export function createAtmosphereMaterial(
  color: Color,
  initialIntensity: number,
  initialPower: number,
): {
  dispose: () => void;
  material: ShaderMaterial;
  setSettings: (intensity: number, power: number) => void;
  setSunDirection: (sunDirection: Vector3) => void;
} {
  const intensityUniform = { value: initialIntensity };
  const powerUniform = { value: initialPower };
  const sunDirectionUniform = { value: new Vector3(1, 0, 0) };

  const material = new ShaderMaterial({
    uniforms: {
      glowColor: { value: color.clone() },
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
      uniform vec3 glowColor;
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
        float daylight = smoothstep(-0.28, 0.24, sunAlignment);
        float twilight = max(
          smoothstep(-0.24, 0.02, sunAlignment) -
            smoothstep(0.02, 0.24, sunAlignment),
          0.0
        );
        float limbGlow = smoothstep(0.16, 0.94, fresnel);
        float nightRim = (1.0 - smoothstep(-0.88, -0.18, sunAlignment)) * 0.03;

        vec3 baseColor = mix(
          glowColor * vec3(0.34, 0.34, 0.38),
          glowColor,
          daylight
        );
        vec3 twilightColor = vec3(0.8, 0.58, 0.3);
        vec3 atmosphereColor = baseColor;
        atmosphereColor += twilightColor * twilight * limbGlow * 0.55;

        float alpha = fresnel
          * (mix(0.03, 0.24, daylight) + twilight * limbGlow * 0.48 + nightRim)
          * intensity;
        vec3 color = atmosphereColor
          * fresnel
          * intensity
          * (0.24 + daylight * 0.18 + twilight * limbGlow * 0.62);

        gl_FragColor = vec4(color, alpha);

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
    dispose: () => {
      material.dispose();
    },
    material,
    setSettings: (intensity, power) => {
      intensityUniform.value = intensity;
      powerUniform.value = power;
    },
    setSunDirection: (sunDirection) => {
      if (sunDirection.lengthSq() <= 1.0e-8) {
        sunDirectionUniform.value.set(1, 0, 0);
      } else {
        sunDirectionUniform.value.copy(sunDirection).normalize();
      }
    },
  };
}
