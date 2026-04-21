import { useMemo, useEffect } from "react";
import { Color } from "three";
import { useControls } from "leva";
import {
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
} from "../lib/constants.ts";
import type { RendererMode } from "../lib/rendererMode.ts";
import { kmToUnits } from "../lib/units.ts";
import { createAtmosphereMaterial } from "../shaders/atmosphereMaterial.ts";

const ATMOSPHERE_SCALE = 1.008;
const EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS) * ATMOSPHERE_SCALE;
const POLAR_SCALE = SATURN_POLAR_RADIUS / SATURN_EQUATORIAL_RADIUS;
const GLOW_COLOR = new Color(0.85, 0.75, 0.5);

export function Atmosphere({ rendererMode }: { rendererMode: RendererMode }) {
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

  const material = useMemo(
    () =>
      rendererMode === "webgpu"
        ? createAtmosphereMaterial(GLOW_COLOR, intensity, power).material
        : null,
    [intensity, power, rendererMode],
  );

  useEffect(() => {
    return () => {
      material?.dispose();
    };
  }, [material]);

  if (!material) return null;

  return (
    <mesh scale={[1, POLAR_SCALE, 1]} material={material}>
      <sphereGeometry args={[EQUATORIAL, 128, 64]} />
    </mesh>
  );
}
