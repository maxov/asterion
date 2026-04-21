import { AdditiveBlending, Color } from "three";
import { SUN_RADIUS_KM } from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";

const SUN_RADIUS = kmToUnits(SUN_RADIUS_KM);
const CORONA_SCALE = 1.14;
const SUN_CORE_COLOR = new Color(0xfff4cf).multiplyScalar(2.8);
const SUN_CORONA_COLOR = new Color(0xffae52).multiplyScalar(1.8);

export function Sun() {
  return (
    <>
      <mesh>
        <sphereGeometry args={[SUN_RADIUS, 64, 32]} />
        <meshBasicMaterial color={SUN_CORE_COLOR} toneMapped={false} />
      </mesh>
      <mesh scale={[CORONA_SCALE, CORONA_SCALE, CORONA_SCALE]}>
        <sphereGeometry args={[SUN_RADIUS, 48, 24]} />
        <meshBasicMaterial
          color={SUN_CORONA_COLOR}
          transparent
          opacity={0.24}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
