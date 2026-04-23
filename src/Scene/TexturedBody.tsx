import { useEffect } from "react";
import { BODY_DEFINITIONS } from "../lib/bodies.ts";
import { SIMPLE_BODY_VISUALS, type SimpleBodyId } from "../lib/bodyVisuals.ts";
import { configureSrgbTexture } from "../lib/planetTextures.ts";
import { kmToUnits } from "../lib/units.ts";
import { usePreparedSharedTexture } from "../lib/useSharedTexture.ts";

type TexturedBodyProps = {
  bodyId: SimpleBodyId;
};

export function TexturedBody({ bodyId }: TexturedBodyProps) {
  const body = BODY_DEFINITIONS[bodyId];
  const visual = SIMPLE_BODY_VISUALS[bodyId];
  const { texture, error } = usePreparedSharedTexture(
    visual.texturePath,
    visual.textureKey,
    configureSrgbTexture,
  );

  useEffect(() => {
    if (error) {
      console.warn(`${body.label}: failed to load ${visual.texturePath}`, error);
    }
  }, [body.label, error, visual.texturePath]);

  return (
    <mesh>
      <sphereGeometry
        args={[
          kmToUnits(body.radiusKm),
          visual.widthSegments ?? 64,
          visual.heightSegments ?? 32,
        ]}
      />
      <meshStandardMaterial
        color={texture ? "#ffffff" : visual.fallbackColor}
        map={texture ?? undefined}
        metalness={visual.metalness ?? 0}
        roughness={visual.roughness ?? 0.94}
      />
    </mesh>
  );
}
