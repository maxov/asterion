import { useEffect } from "react";
import { MOON_RADIUS_KM } from "../lib/constants.ts";
import {
  configureDataTexture,
  configureSrgbTexture,
  MOON_ALBEDO_TEXTURE_PATH,
  MOON_HEIGHT_DISPLACEMENT_BIAS_KM,
  MOON_HEIGHT_DISPLACEMENT_SCALE_KM,
  MOON_HEIGHT_TEXTURE_PATH,
} from "../lib/planetTextures.ts";
import { kmToUnits } from "../lib/units.ts";
import { usePreparedSharedTexture } from "../lib/useSharedTexture.ts";

const MOON_RADIUS = kmToUnits(MOON_RADIUS_KM);
const MOON_DISPLACEMENT_BIAS = kmToUnits(MOON_HEIGHT_DISPLACEMENT_BIAS_KM);
const MOON_DISPLACEMENT_SCALE = kmToUnits(MOON_HEIGHT_DISPLACEMENT_SCALE_KM);
const MOON_WIDTH_SEGMENTS = 512;
const MOON_HEIGHT_SEGMENTS = 256;

export function Moon() {
  const { texture: albedoTexture, error: albedoError } = usePreparedSharedTexture(
    MOON_ALBEDO_TEXTURE_PATH,
    "moon-albedo",
    configureSrgbTexture,
  );
  const { texture: heightTexture, error: heightError } = usePreparedSharedTexture(
    MOON_HEIGHT_TEXTURE_PATH,
    "moon-height",
    configureDataTexture,
  );

  useEffect(() => {
    if (albedoError) {
      console.warn(`Moon: failed to load ${MOON_ALBEDO_TEXTURE_PATH}`, albedoError);
    }
  }, [albedoError]);

  useEffect(() => {
    if (heightError) {
      console.warn(`Moon: failed to load ${MOON_HEIGHT_TEXTURE_PATH}`, heightError);
    }
  }, [heightError]);

  return (
    <mesh>
      <sphereGeometry
        args={[MOON_RADIUS, MOON_WIDTH_SEGMENTS, MOON_HEIGHT_SEGMENTS]}
      />
      <meshStandardMaterial
        color="#c4c1ba"
        displacementBias={heightTexture ? MOON_DISPLACEMENT_BIAS : 0}
        displacementMap={heightTexture ?? undefined}
        displacementScale={heightTexture ? MOON_DISPLACEMENT_SCALE : 0}
        map={albedoTexture ?? undefined}
        roughness={0.95}
        metalness={0}
      />
    </mesh>
  );
}
