import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  LinearFilter,
  MathUtils,
  Vector3,
  type Sprite as ThreeSprite,
} from "three";
import { SUN_RADIUS_KM } from "../lib/constants.ts";
import { SUN_BLOOM_LAYER } from "../lib/renderLayers.ts";
import { kmToUnits } from "../lib/units.ts";

const SUN_RADIUS = kmToUnits(SUN_RADIUS_KM);
const CORONA_SCALE = 1.14;
const BLOOM_SOURCE_SCALE = 1.75;
const MIN_BLOOM_DIAMETER_PX = 12;
const SUN_CORE_COLOR = new Color(0xfff4cf).multiplyScalar(2.8);
const SUN_CORONA_COLOR = new Color(0xffae52).multiplyScalar(1.8);
const SUN_BLOOM_COLOR = new Color(0xfff0c0).multiplyScalar(3.2);

function createSunBloomTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas context unavailable for sun bloom texture");
  }

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.18, "rgba(255, 255, 255, 0.98)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.42)");
  gradient.addColorStop(0.82, "rgba(255, 255, 255, 0.08)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.clearRect(0, 0, size, size);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  return texture;
}

function pixelsToWorldUnits(
  distance: number,
  viewportHeightPx: number,
  fovDeg: number,
  sizePx: number,
) {
  const safeDistance = Math.max(distance, 1e-6);
  const worldHeight =
    2 * Math.tan(MathUtils.degToRad(fovDeg) * 0.5) * safeDistance;
  return (worldHeight / Math.max(viewportHeightPx, 1)) * sizePx;
}

export function Sun() {
  const { camera, size } = useThree();
  const bloomSpriteRef = useRef<ThreeSprite>(null);
  const bloomWorldPositionRef = useRef(new Vector3());
  const bloomTexture = useMemo(() => createSunBloomTexture(), []);

  useEffect(() => {
    return () => {
      bloomTexture.dispose();
    };
  }, [bloomTexture]);

  useFrame(() => {
    const bloomSprite = bloomSpriteRef.current;
    if (!bloomSprite) return;

    bloomSprite.getWorldPosition(bloomWorldPositionRef.current);
    const distanceToCamera = camera.position.distanceTo(
      bloomWorldPositionRef.current,
    );
    const physicalDiameter = SUN_RADIUS * 2 * CORONA_SCALE * BLOOM_SOURCE_SCALE;
    const minimumDiameter = "fov" in camera
      ? pixelsToWorldUnits(
          distanceToCamera,
          size.height,
          camera.fov,
          MIN_BLOOM_DIAMETER_PX,
        )
      : physicalDiameter;
    const bloomDiameter = Math.max(physicalDiameter, minimumDiameter);
    bloomSprite.scale.setScalar(bloomDiameter);
  });

  return (
    <>
      <mesh frustumCulled={false}>
        <sphereGeometry args={[SUN_RADIUS, 64, 32]} />
        <meshBasicMaterial color={SUN_CORE_COLOR} toneMapped={false} />
      </mesh>
      <mesh
        frustumCulled={false}
        scale={[CORONA_SCALE, CORONA_SCALE, CORONA_SCALE]}
      >
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
      <sprite
        ref={bloomSpriteRef}
        frustumCulled={false}
        onUpdate={(self: ThreeSprite) => self.layers.set(SUN_BLOOM_LAYER)}
      >
        <spriteMaterial
          map={bloomTexture}
          color={SUN_BLOOM_COLOR}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>
    </>
  );
}
