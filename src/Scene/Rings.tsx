import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  MeshStandardMaterial,
  NoColorSpace,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Texture,
} from "three";
import {
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
} from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";
import { usePreparedSharedTexture } from "../lib/useSharedTexture.ts";
import { publicPath } from "../lib/publicPath.ts";
import { createSaturnRingMaterialBundle } from "../shaders/saturnRingMaterial.ts";

const INNER = kmToUnits(RING_INNER_RADIUS);
const OUTER = kmToUnits(RING_OUTER_RADIUS);
const SEGMENTS = 512;
const COLOR_TEXTURE_PATH = publicPath("/textures/saturn_rings_color.png");
const SCATTERING_TEXTURE_PATH = publicPath("/textures/saturn_rings_scattering.png");
const FALLBACK_COLOR = new Color(0.83, 0.77, 0.63);

function createRingGeometry(inner: number, outer: number, segments: number) {
  const geometry = new BufferGeometry();
  const vertexCount = (segments + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(segments * 6);

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const innerIndex = i * 2;
    const outerIndex = innerIndex + 1;

    positions[innerIndex * 3] = cos * inner;
    positions[innerIndex * 3 + 1] = sin * inner;
    positions[outerIndex * 3] = cos * outer;
    positions[outerIndex * 3 + 1] = sin * outer;

    normals[innerIndex * 3 + 2] = 1;
    normals[outerIndex * 3 + 2] = 1;

    uvs[innerIndex * 2] = 0;
    uvs[innerIndex * 2 + 1] = i / segments;
    uvs[outerIndex * 2] = 1;
    uvs[outerIndex * 2 + 1] = i / segments;
  }

  for (let i = 0; i < segments; i += 1) {
    const innerA = i * 2;
    const outerA = innerA + 1;
    const innerB = innerA + 2;
    const outerB = innerA + 3;
    const base = i * 6;

    indices[base] = innerA;
    indices[base + 1] = outerA;
    indices[base + 2] = outerB;
    indices[base + 3] = innerA;
    indices[base + 4] = outerB;
    indices[base + 5] = innerB;
  }

  geometry.setIndex(Array.from(indices));
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();

  return geometry;
}

function configureRingColorTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
}

function configureRingScatteringTexture(texture: Texture) {
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
}

type RingsProps = {
  sunDirection: Vector3;
  chromaGain?: number;
  opacity?: number;
  planetShadowStrength?: number;
  textured?: boolean;
  warmth?: number;
};

export function Rings({
  sunDirection,
  chromaGain = 1.45,
  opacity = 0.7,
  planetShadowStrength = 1.36,
  textured = true,
  warmth = 0.26,
}: RingsProps) {
  const ringGroupRef = useRef<Group>(null);
  const shadowQuaternionRef = useRef(new Quaternion());
  const localSunDirectionRef = useRef(new Vector3());
  const { texture: colorTexture, error: colorError } = usePreparedSharedTexture(
    COLOR_TEXTURE_PATH,
    "saturn-rings-color",
    configureRingColorTexture,
  );
  const { texture: scatteringTexture, error: scatteringError } = usePreparedSharedTexture(
    SCATTERING_TEXTURE_PATH,
    "saturn-rings-scattering-data",
    configureRingScatteringTexture,
  );

  const geometry = useMemo(() => createRingGeometry(INNER, OUTER, SEGMENTS), []);

  const fallback = useMemo(
    () =>
      new MeshStandardMaterial({
        color: FALLBACK_COLOR,
        opacity,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        roughness: 0.9,
        metalness: 0,
      }),
    [opacity],
  );

  const materials = useMemo(() => {
    if (!colorTexture || !scatteringTexture) return null;
    return createSaturnRingMaterialBundle(colorTexture, scatteringTexture);
  }, [colorTexture, scatteringTexture]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => fallback.dispose(), [fallback]);
  useEffect(() => () => materials?.dispose(), [materials]);
  useEffect(() => {
    if (colorError) console.warn(`Rings: failed to load ${COLOR_TEXTURE_PATH}`, colorError);
    if (scatteringError) {
      console.warn(`Rings: failed to load ${SCATTERING_TEXTURE_PATH}`, scatteringError);
    }
  }, [colorError, scatteringError]);
  useEffect(() => {
    if (!materials) return;
    materials.setLook(chromaGain, opacity, planetShadowStrength, warmth);
  }, [chromaGain, materials, opacity, planetShadowStrength, warmth]);

  useFrame(() => {
    if (!ringGroupRef.current || !materials) return;

    ringGroupRef.current.getWorldQuaternion(shadowQuaternionRef.current);
    shadowQuaternionRef.current.invert();
    if (sunDirection.lengthSq() <= 1e-8) {
      localSunDirectionRef.current.set(1, 0, 0);
      materials.setSunDirections(localSunDirectionRef.current, localSunDirectionRef.current);
    } else {
      localSunDirectionRef.current
        .copy(sunDirection)
        .applyQuaternion(shadowQuaternionRef.current)
        .normalize();
      materials.setSunDirections(localSunDirectionRef.current, sunDirection);
    }
  });

  return (
    <group
      ref={ringGroupRef}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      {textured && materials ? (
        <>
          <mesh
            renderOrder={1}
            geometry={geometry}
            material={materials.back}
          />
          <mesh
            renderOrder={2}
            geometry={geometry}
            material={materials.front}
          />
        </>
      ) : (
        <mesh
          renderOrder={1}
          geometry={geometry}
          material={fallback}
        />
      )}
    </group>
  );
}
