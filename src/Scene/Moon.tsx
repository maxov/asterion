import { useEffect } from "react";
import { MOON_RADIUS_KM } from "../lib/constants.ts";
import {
  configureSrgbTexture,
  MOON_ALBEDO_TEXTURE_PATH,
} from "../lib/planetTextures.ts";
import { kmToUnits } from "../lib/units.ts";
import { usePreparedSharedTexture } from "../lib/useSharedTexture.ts";

const MOON_RADIUS = kmToUnits(MOON_RADIUS_KM);

export function Moon() {
  const { texture, error } = usePreparedSharedTexture(
    MOON_ALBEDO_TEXTURE_PATH,
    "moon-albedo",
    configureSrgbTexture,
  );

  useEffect(() => {
    if (error) {
      console.warn(`Moon: failed to load ${MOON_ALBEDO_TEXTURE_PATH}`, error);
    }
  }, [error]);

  return (
    <mesh>
      <sphereGeometry args={[MOON_RADIUS, 48, 24]} />
      <meshStandardMaterial
        color="#c4c1ba"
        map={texture ?? undefined}
        roughness={0.95}
        metalness={0}
      />
    </mesh>
  );
}
