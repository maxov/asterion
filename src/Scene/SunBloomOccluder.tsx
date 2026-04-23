import { type Mesh } from "three";
import { SUN_BLOOM_LAYER } from "../lib/renderLayers.ts";
import { kmToUnits } from "../lib/units.ts";

type SunBloomOccluderProps = {
  radiusKm: number;
  segments?: number;
};

export function SunBloomOccluder({
  radiusKm,
  segments = 24,
}: SunBloomOccluderProps) {
  return (
    <mesh onUpdate={(self: Mesh) => self.layers.set(SUN_BLOOM_LAYER)}>
      <sphereGeometry args={[kmToUnits(radiusKm), segments, Math.max(8, segments / 2)]} />
      <meshBasicMaterial color={0x000000} toneMapped={false} />
    </mesh>
  );
}
