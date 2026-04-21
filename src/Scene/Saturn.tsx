import { useRef, useEffect, useMemo } from "react";
import {
  type Mesh,
  type Texture,
  Color,
  SRGBColorSpace,
  MeshStandardMaterial,
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
} from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";
import { usePreparedSharedTexture } from "../lib/useSharedTexture.ts";

const EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS);
const POLAR_SCALE = SATURN_POLAR_RADIUS / SATURN_EQUATORIAL_RADIUS;
const FALLBACK_COLOR = new Color(0.76, 0.63, 0.35);

function configureSaturnTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
}

export function Saturn({ textured = true }: { textured?: boolean }) {
  const meshRef = useRef<Mesh>(null);
  const { texture, error } = usePreparedSharedTexture(
    "/textures/saturn_albedo.jpg",
    "saturn-albedo",
    configureSaturnTexture,
  );

  const fallback = useMemo(
    () =>
      new MeshStandardMaterial({
        color: FALLBACK_COLOR,
        roughness: 0.85,
        metalness: 0,
      }),
    [],
  );

  useEffect(() => () => fallback.dispose(), [fallback]);
  useEffect(() => {
    if (error) {
      console.warn("Saturn: failed to load /textures/saturn_albedo.jpg", error);
    }
  }, [error]);

  const material = useMemo(() => {
    if (!textured || !texture) return null;
    const mat = new MeshStandardNodeMaterial();
    mat.map = texture;
    mat.roughness = 0.85;
    mat.metalness = 0;
    return mat;
  }, [textured, texture]);
  useEffect(() => {
    return () => {
      material?.dispose();
    };
  }, [material]);

  return (
    <mesh
      ref={meshRef}
      scale={[1, POLAR_SCALE, 1]}
      material={material ?? fallback}
    >
      <sphereGeometry args={[EQUATORIAL, 128, 64]} />
    </mesh>
  );
}
