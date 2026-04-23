import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  LinearFilter,
  MeshStandardMaterial,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
  Vector3,
} from "three";
import {
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
} from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";
import { usePreparedSharedTexture } from "../lib/useSharedTexture.ts";
import { publicPath } from "../lib/publicPath.ts";
import { createSaturnMaterial } from "../shaders/saturnMaterial.ts";

const EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS);
const POLAR_SCALE = SATURN_POLAR_RADIUS / SATURN_EQUATORIAL_RADIUS;
const FALLBACK_COLOR = new Color(0.76, 0.63, 0.35);
const SCATTERING_TEXTURE_PATH = publicPath("/textures/saturn_rings_scattering.png");

function createNeutralScatteringTexture() {
  const data = new Uint8Array([0, 0, 0, 255]);
  const texture = new DataTexture(data, 1, 1, RGBAFormat, UnsignedByteType);
  texture.colorSpace = NoColorSpace;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function configureSaturnTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
}

function configureScatteringTexture(texture: Texture) {
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
}

type SaturnProps = {
  localSunDirection: Vector3;
  worldSunDirection: Vector3;
  ringShadowStrength?: number;
  textured?: boolean;
};

export function Saturn({
  localSunDirection,
  worldSunDirection,
  ringShadowStrength = 0.78,
  textured = true,
}: SaturnProps) {
  const { texture, error } = usePreparedSharedTexture(
    publicPath("/textures/saturn_albedo.jpg"),
    "saturn-albedo",
    configureSaturnTexture,
  );
  const { texture: scatteringTexture, error: scatteringError } = usePreparedSharedTexture(
    SCATTERING_TEXTURE_PATH,
    "saturn-rings-scattering-data",
    configureScatteringTexture,
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
  const neutralScatteringTexture = useMemo(() => createNeutralScatteringTexture(), []);

  useEffect(() => () => fallback.dispose(), [fallback]);
  useEffect(() => () => neutralScatteringTexture.dispose(), [neutralScatteringTexture]);
  useEffect(() => {
    if (error) {
      console.warn("Saturn: failed to load /textures/saturn_albedo.jpg", error);
    }
  }, [error]);
  useEffect(() => {
    if (scatteringError) {
      console.warn(
        `Saturn: failed to load ${SCATTERING_TEXTURE_PATH}`,
        scatteringError,
      );
    }
  }, [scatteringError]);

  const material = useMemo(() => {
    if (!textured || !texture) return null;
    return createSaturnMaterial(texture, neutralScatteringTexture);
  }, [neutralScatteringTexture, textured, texture]);

  useEffect(() => {
    return () => {
      material?.dispose();
    };
  }, [material]);

  useEffect(() => {
    if (!material) return;
    material.setScatteringTexture(scatteringTexture ?? neutralScatteringTexture);
  }, [material, neutralScatteringTexture, scatteringTexture]);

  useFrame(() => {
    material?.setSunDirections(localSunDirection, worldSunDirection);
  });

  useEffect(() => {
    if (!material) return;
    material.setRingShadowStrength(scatteringTexture ? ringShadowStrength : 0);
  }, [material, ringShadowStrength, scatteringTexture]);

  return (
    <mesh
      scale={[1, POLAR_SCALE, 1]}
      material={material?.material ?? fallback}
    >
      <sphereGeometry args={[EQUATORIAL, 128, 64]} />
    </mesh>
  );
}
