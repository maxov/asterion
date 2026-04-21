import { useRef, useState, useEffect, useMemo } from "react";
import {
  type Mesh,
  type Texture,
  Color,
  TextureLoader,
  SRGBColorSpace,
  MeshStandardMaterial,
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
} from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";

const EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS);
const POLAR_SCALE = SATURN_POLAR_RADIUS / SATURN_EQUATORIAL_RADIUS;
const FALLBACK_COLOR = new Color(0.76, 0.63, 0.35);

export function Saturn() {
  const meshRef = useRef<Mesh>(null);
  const [material, setMaterial] = useState<MeshStandardNodeMaterial | null>(
    null,
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
    const loader = new TextureLoader();
    let disposed = false;
    let loadedTex: Texture | null = null;
    let createdMat: MeshStandardNodeMaterial | null = null;

    loader.load(
      "/textures/saturn_albedo.jpg",
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = 16;
        loadedTex = tex;
        const mat = new MeshStandardNodeMaterial();
        mat.map = tex;
        mat.roughness = 0.85;
        mat.metalness = 0;
        createdMat = mat;
        setMaterial(mat);
      },
      undefined,
      () => console.warn("Saturn: failed to load /textures/saturn_albedo.jpg"),
    );

    return () => {
      disposed = true;
      createdMat?.dispose();
      loadedTex?.dispose();
    };
  }, []);

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
