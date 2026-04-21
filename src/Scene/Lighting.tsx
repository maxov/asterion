import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, type Mesh, Vector3 } from "three";
import { STAR_SPHERE_RADIUS_KM } from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";

// Place the sun disc on the star sphere so it sits at the backdrop
const SUN_DISC_DISTANCE = kmToUnits(STAR_SPHERE_RADIUS_KM) * 0.99;
const SUN_DISC_RADIUS = SUN_DISC_DISTANCE * 0.004;
const SUN_DISC_COLOR = new Color(0xfff5e1).multiplyScalar(3);

type LightingProps = {
  direction: Vector3;
};

export function Lighting({ direction }: LightingProps) {
  const discRef = useRef<Mesh>(null);
  const discPositionRef = useRef(new Vector3());

  useFrame(() => {
    discPositionRef.current.copy(direction).multiplyScalar(SUN_DISC_DISTANCE);

    discRef.current?.position.copy(discPositionRef.current);
  });

  return (
    <>
      {/* Visible sun disc — emissive so it blooms */}
      <mesh ref={discRef}>
        <sphereGeometry args={[SUN_DISC_RADIUS, 32, 16]} />
        <meshBasicMaterial color={SUN_DISC_COLOR} toneMapped={false} />
      </mesh>
    </>
  );
}
