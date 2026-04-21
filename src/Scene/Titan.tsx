import { TITAN_RADIUS_KM } from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";

const TITAN_RADIUS = kmToUnits(TITAN_RADIUS_KM);

export function Titan() {
  return (
    <mesh>
      <sphereGeometry args={[TITAN_RADIUS, 48, 24]} />
      <meshStandardMaterial color="#c8ad7f" roughness={0.9} metalness={0} />
    </mesh>
  );
}
