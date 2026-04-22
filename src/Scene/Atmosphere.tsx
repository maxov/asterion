import { useMemo, useEffect } from "react";
import { Color } from "three";
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

type AtmosphereProps = {
  intensity?: number;
  power?: number;
};

export function Atmosphere({
  intensity = 0.15,
  power = 4.0,
}: AtmosphereProps) {

  const material = useMemo(
    () => createAtmosphereMaterial(GLOW_COLOR, intensity, power).material,
    [intensity, power],
  );

  useEffect(() => {
    return () => {
      material?.dispose();
    };
  }, [material]);

  return (
    <mesh scale={[1, POLAR_SCALE, 1]} material={material}>
      <sphereGeometry args={[EQUATORIAL, 128, 64]} />
    </mesh>
  );
}
