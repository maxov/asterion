import {
  AdditiveBlending,
  BackSide,
  Color,
  ShaderMaterial,
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
  material: ShaderMaterial;
  intensityUniform: { value: number };
  powerUniform: { value: number };
} {
  const intensityUniform = { value: initialIntensity };
  const powerUniform = { value: initialPower };

  const material = new ShaderMaterial({
    uniforms: {
      glowColor: { value: color.clone() },
      intensity: intensityUniform,
      power: powerUniform,
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

      varying vec3 vNormalView;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormalView);
        vec3 viewDir = normalize(-vViewPosition);
        float fresnel = pow(1.0 - abs(dot(normal, viewDir)), power);

        gl_FragColor = vec4(glowColor * fresnel * intensity, fresnel * intensity);

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

  return { material, intensityUniform, powerUniform };
}
