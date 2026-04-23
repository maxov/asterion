import { useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Vector3 } from "three";
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
  worldSunDirection: Vector3;
};

export function Atmosphere({
  intensity = 0.15,
  power = 4.0,
  worldSunDirection,
}: AtmosphereProps) {
  const bundle = useMemo(
    () => createAtmosphereMaterial(GLOW_COLOR, 0.15, 4.0),
    [],
  );

  useFrame(() => {
    bundle.setSunDirection(worldSunDirection);
  });

  useEffect(() => {
    bundle.setSettings(intensity, power);
  }, [bundle, intensity, power]);

  useEffect(() => {
    return () => {
      bundle.dispose();
    };
  }, [bundle]);

  return (
    <mesh scale={[1, POLAR_SCALE, 1]} material={bundle.material}>
      <sphereGeometry args={[EQUATORIAL, 128, 64]} />
    </mesh>
  );
}
