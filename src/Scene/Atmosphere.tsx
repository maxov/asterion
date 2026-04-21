import { useRef, useMemo, useEffect } from "react";
import { type Mesh, Color } from "three";
import { useControls } from "leva";
import {
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
} from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";
import { createAtmosphereMaterial } from "../shaders/atmosphereMaterial.ts";

const ATMOSPHERE_SCALE = 1.008;
const EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS) * ATMOSPHERE_SCALE;
const POLAR_SCALE = SATURN_POLAR_RADIUS / SATURN_EQUATORIAL_RADIUS;
const GLOW_COLOR = new Color(0.85, 0.75, 0.5);

export function Atmosphere() {
  const meshRef = useRef<Mesh>(null);

  const { intensity, power } = useControls("Atmosphere", {
    intensity: {
      value: 0.15,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Glow Intensity",
    },
    power: { value: 4.0, min: 1, max: 10, step: 0.1, label: "Fresnel Power" },
  });

  const { material, intensityUniform, powerUniform } = useMemo(
    () => createAtmosphereMaterial(GLOW_COLOR, intensity, power),
    // Material is created once; uniforms are updated below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    intensityUniform.value = intensity;
  }, [intensityUniform, intensity]);
  useEffect(() => {
    powerUniform.value = power;
  }, [powerUniform, power]);

  return (
    <mesh ref={meshRef} scale={[1, POLAR_SCALE, 1]} material={material}>
      <sphereGeometry args={[EQUATORIAL, 128, 64]} />
    </mesh>
  );
}
