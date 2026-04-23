import { Line as FatLine } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  type ElementRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  CanvasTexture,
  type Blending,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Group,
  LinearFilter,
  MathUtils,
  Mesh,
  Object3D,
  Vector3,
  type ColorRepresentation,
} from "three";
import { BODY_DEFINITIONS, type BodyId } from "../lib/bodies.ts";
import type { MissionRegistryEntry } from "../lib/missions.ts";
import { MISSION_REGISTRY } from "../lib/missions.ts";
import { MISSION_BLOOM_LAYER } from "../lib/renderLayers.ts";
import {
  buildMissionTrajectorySamples,
  missionHeadStyle,
  missionLaunchMs,
  missionLineStyle,
  missionStreakStyle,
  positionAtMissionTime,
  sliceMissionTrajectory,
} from "../lib/missionTrajectories.ts";
import {
  currentSimulationDateMs,
  timelineSystemMs,
  type SimulationTimeline,
} from "../lib/simulationTimeline.ts";
import { kmToUnits } from "../lib/units.ts";
import { useMissionAsset } from "../lib/useMissionAsset.ts";

type MissionTrajectoriesProps = {
  focusBodyId: BodyId;
  activeMissionId: string | null;
  missionAnchors: Partial<Record<BodyId, RefObject<Object3D | null>>>;
  missionFocusOffsetsKm: Partial<Record<BodyId, MutableRefObject<Vector3>>>;
  systemOriginKmRef: MutableRefObject<Vector3>;
  timeline: SimulationTimeline;
};

type LineChunk = {
  key: number;
  origin: [number, number, number];
  points: [number, number, number][];
  vertexColors?: [number, number, number][];
};

const ZERO_POSITION: [number, number, number] = [0, 0, 0];
const MISSION_ROOT_POSITION = new Vector3();
const SPACE_BACKGROUND_COLOR = new Color("#05070a");
const TRAJECTORY_PATH_RENDER_ORDER = 4;
const TRAJECTORY_STREAK_RENDER_ORDER = 5;
const TRAJECTORY_STREAK_GLOW_RENDER_ORDER = 5.5;
const ORB_CORE_RENDER_ORDER = 6;
const ORB_GLOW_RENDER_ORDER = 7;
const ORB_BLOOM_CORE_INTENSITY = 5.8;
const ORB_BLOOM_GLOW_INTENSITY = 3.3;
const ORB_BLOOM_GLOW_SIZE_MULTIPLIER = 3;
const ORB_BLOOM_GLOW_OPACITY = 0.96;
const STREAK_VISIBLE_HEAD_INTENSITY = 1.15;
const STREAK_GLOW_TAIL_INTENSITY = 1;
const STREAK_GLOW_HEAD_INTENSITY = 5.5;
const STREAK_GLOW_WIDTH_MULTIPLIER = 1.05;
const ORB_WORLD_POSITION = new Vector3();
const MISSION_VISUAL_FADE_START_DISTANCE = kmToUnits(12_000);
const MISSION_VISUAL_FADE_END_DISTANCE = kmToUnits(90_000);
const MISSION_BLOOM_FADE_START_DISTANCE = kmToUnits(16_000);
const MISSION_BLOOM_FADE_HALF_DISTANCE = kmToUnits(220_000);
const STREAK_FAR_WIDTH_SCALE = 0.6;
const STREAK_MIN_WIDTH_PX = 2;
const HEAD_FAR_SIZE_SCALE = 0.46;
const HEAD_MIN_SIZE_TO_PATH_RATIO = 1.8;
const HEAD_MIN_SIZE_PX = 10;
const BLOOM_DISTANCE_FADE_EXPONENT = 1.25;
const ORB_BLOOM_CORE_FAR_INTENSITY_SCALE = 0.74;
const ORB_BLOOM_GLOW_FAR_INTENSITY_SCALE = 0.56;
const ORB_BLOOM_GLOW_FAR_OPACITY_SCALE = 0.58;
const ORB_BLOOM_GLOW_FAR_SIZE_MULTIPLIER = 2.2;
const STREAK_GLOW_HEAD_FAR_INTENSITY_SCALE = 0.58;
const STREAK_GLOW_TAIL_FAR_INTENSITY_SCALE = 0.72;
const MISSION_CAMERA_DISTANCE_POSITION = new Vector3();
const MISSION_VISUAL_WORLD_POSITION = new Vector3();

function assignSingleLayer(object: Object3D | null | undefined, layer: number) {
  if (!object?.layers) return;
  object.layers.disableAll();
  object.layers.enable(layer);
}

function bakeOpacityIntoColor(
  color: ColorRepresentation,
  opacity: number,
) {
  return SPACE_BACKGROUND_COLOR.clone().lerp(new Color(color), opacity);
}

function smoothDistanceFade(
  distance: number,
  startDistance: number,
  endDistance: number,
) {
  if (endDistance <= startDistance) return 1;
  return MathUtils.smoothstep(distance, startDistance, endDistance);
}

function asymptoticDistanceFade(
  distance: number,
  startDistance: number,
  halfDistance: number,
  exponent: number,
) {
  if (distance <= startDistance) return 0;
  const safeRange = Math.max(halfDistance - startDistance, 1e-6);
  const normalized = (distance - startDistance) / safeRange;
  const weighted = Math.pow(Math.max(normalized, 0), exponent);
  return weighted / (1 + weighted);
}

function toUnits(
  points: readonly Vector3[],
  offsetKm: Vector3 | null = null,
) {
  const offsetX = offsetKm?.x ?? 0;
  const offsetY = offsetKm?.y ?? 0;
  const offsetZ = offsetKm?.z ?? 0;
  return points.map((point) => [
    kmToUnits(point.x - offsetX),
    kmToUnits(point.y - offsetY),
    kmToUnits(point.z - offsetZ),
  ] as [number, number, number]);
}

function smoothTrajectoryPoints(
  points: readonly [number, number, number][],
  subdivisionsPerSegment: number,
) {
  if (points.length < 3 || subdivisionsPerSegment <= 1) {
    return points.slice() as [number, number, number][];
  }

  const curve = new CatmullRomCurve3(
    points.map((point) => new Vector3(point[0], point[1], point[2])),
    false,
    "centripetal",
  );
  const divisions = Math.max(
    points.length - 1,
    (points.length - 1) * subdivisionsPerSegment,
  );

  return curve.getPoints(divisions).map((point) => [
    point.x,
    point.y,
    point.z,
  ] as [number, number, number]);
}

function buildLineChunks(
  points: readonly [number, number, number][],
  chunkSize: number,
  vertexColors?: readonly [number, number, number][],
) {
  if (points.length < 2 || chunkSize < 2 || points.length <= chunkSize) {
    return [
      {
        key: 0,
        origin: ZERO_POSITION,
        points: points.slice() as [number, number, number][],
        vertexColors: vertexColors?.slice() as [number, number, number][] | undefined,
      },
    ] satisfies LineChunk[];
  }

  const chunks: LineChunk[] = [];

  for (let start = 0; start < points.length - 1; start += chunkSize - 1) {
    const end = Math.min(points.length, start + chunkSize);
    const slice = points.slice(start, end);

    let originX = 0;
    let originY = 0;
    let originZ = 0;
    for (const point of slice) {
      originX += point[0];
      originY += point[1];
      originZ += point[2];
    }

    originX /= slice.length;
    originY /= slice.length;
    originZ /= slice.length;

    chunks.push({
      key: start,
      origin: [originX, originY, originZ],
      points: slice.map((point) => [
        point[0] - originX,
        point[1] - originY,
        point[2] - originZ,
      ]),
      vertexColors: vertexColors?.slice(start, end) as
        | [number, number, number][]
        | undefined,
    });

    if (end === points.length) break;
  }

  return chunks;
}

function TrajectoryLine({
  bakeOpacity = true,
  blending,
  chunkSize = 0,
  color,
  depthTest = true,
  depthWrite = false,
  lineWidthPx = 1,
  materialOpacity = 1,
  materialTransparent = false,
  layer,
  opacity,
  points,
  renderOrder = 0,
  vertexColors,
}: {
  bakeOpacity?: boolean;
  blending?: Blending;
  chunkSize?: number;
  color: ColorRepresentation;
  depthTest?: boolean;
  depthWrite?: boolean;
  lineWidthPx?: number;
  materialOpacity?: number;
  materialTransparent?: boolean;
  layer?: number;
  opacity: number;
  points: readonly [number, number, number][];
  renderOrder?: number;
  vertexColors?: readonly [number, number, number][];
}) {
  const chunks = useMemo(
    () => buildLineChunks(points, chunkSize, vertexColors),
    [chunkSize, points, vertexColors],
  );

  if (points.length < 2) return null;

  return (
    <group>
      {chunks.map((chunk) => (
        <TrajectoryLineChunk
          bakeOpacity={bakeOpacity}
          blending={blending}
          key={chunk.key}
          color={color}
          depthTest={depthTest}
          depthWrite={depthWrite}
          lineWidthPx={lineWidthPx}
          materialOpacity={materialOpacity}
          materialTransparent={materialTransparent}
          layer={layer}
          opacity={opacity}
          origin={chunk.origin}
          points={chunk.points}
          renderOrder={renderOrder}
          vertexColors={chunk.vertexColors}
        />
      ))}
    </group>
  );
}

function TrajectoryLineChunk({
  bakeOpacity,
  blending,
  color,
  depthTest,
  depthWrite,
  lineWidthPx,
  materialOpacity,
  materialTransparent,
  layer,
  opacity,
  origin,
  points,
  renderOrder,
  vertexColors,
}: {
  bakeOpacity: boolean;
  blending?: Blending;
  color: ColorRepresentation;
  depthTest: boolean;
  depthWrite: boolean;
  lineWidthPx: number;
  materialOpacity: number;
  materialTransparent: boolean;
  layer?: number;
  opacity: number;
  origin: [number, number, number];
  points: readonly [number, number, number][];
  renderOrder: number;
  vertexColors?: readonly [number, number, number][];
}) {
  const lineRef = useRef<ElementRef<typeof FatLine> | null>(null);
  const renderedColor = useMemo(
    () => (bakeOpacity ? bakeOpacityIntoColor(color, opacity) : new Color(color)),
    [bakeOpacity, color, opacity],
  );

  useEffect(() => {
    if (layer === undefined) return;
    assignSingleLayer(lineRef.current, layer);
  }, [layer]);

  if (points.length < 2) return null;

  return (
    <group position={origin}>
      <FatLine
        blending={blending}
        color={vertexColors ? "#ffffff" : renderedColor}
        depthTest={depthTest}
        depthWrite={depthWrite}
        frustumCulled={false}
        lineWidth={lineWidthPx}
        opacity={materialOpacity}
        points={points}
        ref={lineRef}
        renderOrder={renderOrder}
        toneMapped={false}
        transparent={materialTransparent}
        vertexColors={vertexColors}
        worldUnits={false}
      />
    </group>
  );
}

function FadingStreakLine({
  bakeOpacity = true,
  blending,
  color,
  depthTest = true,
  headIntensity = 1,
  lineWidthPx = 1,
  materialOpacity = 1,
  materialTransparent = false,
  layer,
  opacity,
  points,
  renderOrder = 0,
  tailColor,
  tailIntensity = 1,
}: {
  bakeOpacity?: boolean;
  blending?: Blending;
  color: ColorRepresentation;
  depthTest?: boolean;
  headIntensity?: number;
  lineWidthPx?: number;
  materialOpacity?: number;
  materialTransparent?: boolean;
  layer?: number;
  opacity: number;
  points: readonly [number, number, number][];
  renderOrder?: number;
  tailColor?: ColorRepresentation;
  tailIntensity?: number;
}) {
  const vertexColors = useMemo(() => {
    if (points.length < 2) return [];
    const gradientTailColor = new Color(tailColor ?? color).multiplyScalar(tailIntensity);
    const brightHeadColor = new Color(color).multiplyScalar(headIntensity);
    const lastIndex = Math.max(points.length - 1, 1);

    return points.map((_, index) => {
      const normalized = index / lastIndex;
      const t = normalized * normalized * (3 - 2 * normalized);
      const blended = gradientTailColor.clone().lerp(brightHeadColor, t);
      if (!bakeOpacity) {
        return blended.toArray().slice(0, 3) as [number, number, number];
      }
      const baked = bakeOpacityIntoColor(blended, opacity);
      return baked.toArray().slice(0, 3) as [number, number, number];
    });
  }, [
    bakeOpacity,
    color,
    headIntensity,
    opacity,
    points,
    tailColor,
    tailIntensity,
  ]);

  if (points.length < 2) return null;

  return (
    <TrajectoryLine
      bakeOpacity={bakeOpacity}
      blending={blending}
      color="#ffffff"
      depthTest={depthTest}
      lineWidthPx={lineWidthPx}
      materialOpacity={materialOpacity}
      materialTransparent={materialTransparent}
      layer={layer}
      opacity={1}
      points={points}
      renderOrder={renderOrder}
      vertexColors={vertexColors}
    />
  );
}

function createRadialTexture(
  stops: readonly [offset: number, alpha: number][],
) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas context unavailable for mission orb texture");
  }

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );

  for (const [offset, alpha] of stops) {
    gradient.addColorStop(offset, `rgba(255, 255, 255, ${alpha})`);
  }

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

function ScreenSpaceOrb({
  color,
  distanceFade = 0,
  maxSizeKm,
  sizePx,
}: {
  color: ColorRepresentation;
  distanceFade?: number;
  maxSizeKm?: number;
  sizePx: number;
}) {
  const { camera, size } = useThree();
  const groupRef = useRef<Group>(null);
  const coreRef = useRef<Mesh>(null);
  const bloomCoreRef = useRef<Mesh>(null);
  const bloomGlowRef = useRef<Mesh>(null);
  const coreTexture = useMemo(
    () =>
      createRadialTexture([
        [0, 1],
        [0.56, 1],
        [0.82, 0.96],
        [1, 0],
      ]),
    [],
  );
  const glowTexture = useMemo(
    () =>
      createRadialTexture([
        [0, 1],
        [0.2, 0.88],
        [0.5, 0.35],
        [0.82, 0.08],
        [1, 0],
      ]),
    [],
  );
  const coreColor = useMemo(() => new Color(color), [color]);
  const bloomCoreColor = useMemo(
    () =>
      new Color(color).multiplyScalar(
        MathUtils.lerp(
          ORB_BLOOM_CORE_INTENSITY,
          ORB_BLOOM_CORE_INTENSITY * ORB_BLOOM_CORE_FAR_INTENSITY_SCALE,
          distanceFade,
        ),
      ),
    [color, distanceFade],
  );
  const bloomGlowColor = useMemo(
    () =>
      new Color(color).multiplyScalar(
        MathUtils.lerp(
          ORB_BLOOM_GLOW_INTENSITY,
          ORB_BLOOM_GLOW_INTENSITY * ORB_BLOOM_GLOW_FAR_INTENSITY_SCALE,
          distanceFade,
        ),
      ),
    [color, distanceFade],
  );
  const glowOpacity = useMemo(
    () =>
      MathUtils.lerp(
        ORB_BLOOM_GLOW_OPACITY,
        ORB_BLOOM_GLOW_OPACITY * ORB_BLOOM_GLOW_FAR_OPACITY_SCALE,
        distanceFade,
      ),
    [distanceFade],
  );
  const glowSizeMultiplier = useMemo(
    () =>
      MathUtils.lerp(
        ORB_BLOOM_GLOW_SIZE_MULTIPLIER,
        ORB_BLOOM_GLOW_FAR_SIZE_MULTIPLIER,
        distanceFade,
      ),
    [distanceFade],
  );

  useEffect(() => {
    return () => {
      coreTexture.dispose();
      glowTexture.dispose();
    };
  }, [coreTexture, glowTexture]);

  useEffect(() => {
    assignSingleLayer(bloomCoreRef.current, MISSION_BLOOM_LAYER);
    assignSingleLayer(bloomGlowRef.current, MISSION_BLOOM_LAYER);
  }, []);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    group.quaternion.copy(camera.quaternion);

    const perspectiveCamera = camera as typeof camera & {
      isPerspectiveCamera?: boolean;
      fov?: number;
    };
    if (!perspectiveCamera.isPerspectiveCamera || perspectiveCamera.fov === undefined) {
      return;
    }

    group.getWorldPosition(ORB_WORLD_POSITION);
    const distance = camera.position.distanceTo(ORB_WORLD_POSITION);
    const unconstrainedCoreScale = pixelsToWorldUnits(
      distance,
      size.height,
      perspectiveCamera.fov,
      sizePx,
    );
    const maxCoreScale =
      typeof maxSizeKm === "number" && Number.isFinite(maxSizeKm) && maxSizeKm > 0
        ? kmToUnits(maxSizeKm)
        : Number.POSITIVE_INFINITY;
    const coreScale = Math.min(unconstrainedCoreScale, maxCoreScale);
    const glowScale = coreScale * glowSizeMultiplier;

    coreRef.current?.scale.set(coreScale, coreScale, 1);
    bloomCoreRef.current?.scale.set(coreScale, coreScale, 1);
    bloomGlowRef.current?.scale.set(glowScale, glowScale, 1);
  }, -0.25);

  return (
    <group ref={groupRef}>
      <mesh ref={coreRef} frustumCulled={false} renderOrder={ORB_CORE_RENDER_ORDER}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={coreColor}
          depthWrite={false}
          map={coreTexture}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh
        ref={bloomCoreRef}
        frustumCulled={false}
        renderOrder={ORB_CORE_RENDER_ORDER}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={bloomCoreColor}
          depthWrite={false}
          map={coreTexture}
          toneMapped={false}
          transparent
        />
      </mesh>
      <mesh
        ref={bloomGlowRef}
        frustumCulled={false}
        renderOrder={ORB_GLOW_RENDER_ORDER}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color={bloomGlowColor}
          depthWrite={false}
          map={glowTexture}
          opacity={glowOpacity}
          toneMapped={false}
          transparent
        />
      </mesh>
    </group>
  );
}

function MissionTrajectory({
  anchorRef,
  focusBodyId,
  focusOffsetKmRef,
  missionId,
  assetPath,
  systemOriginKmRef,
  timeline,
}: {
  anchorRef?: RefObject<Object3D | null>;
  focusBodyId: BodyId;
  focusOffsetKmRef?: MutableRefObject<Vector3>;
  missionId: BodyId;
  assetPath: string;
  systemOriginKmRef: MutableRefObject<Vector3>;
  timeline: SimulationTimeline;
}) {
  const camera = useThree((state) => state.camera);
  const { asset, error } = useMissionAsset(assetPath);
  const [progressSeconds, setProgressSeconds] = useState(0);
  const [bloomDistanceFade, setBloomDistanceFade] = useState(0);
  const [distanceFade, setDistanceFade] = useState(0);
  const bloomDistanceFadeRef = useRef(0);
  const distanceFadeRef = useRef(0);
  const progressRef = useRef(0);
  const missionRootRef = useRef<Group>(null);
  const missionPositionKmRef = useRef(new Vector3());
  const missionFocused = focusBodyId === missionId;

  useEffect(() => {
    if (!error) return;
    console.warn(`Mission asset failed to load: ${assetPath}`, error);
  }, [assetPath, error]);

  const samples = useMemo(
    () => (asset ? buildMissionTrajectorySamples(asset) : []),
    [asset],
  );
  const samplePositions = useMemo(
    () => samples.map((sample) => sample.positionKm),
    [samples],
  );
  const fullPathPoints = useMemo(
    () => smoothTrajectoryPoints(toUnits(samplePositions), 4),
    [samplePositions],
  );
  const lineStyle = asset ? missionLineStyle(asset) : null;
  const streakStyle = asset ? missionStreakStyle(asset) : null;
  const headStyle = asset ? missionHeadStyle(asset) : null;
  const streakTailColor =
    streakStyle?.tailColor ??
    (lineStyle ? bakeOpacityIntoColor(lineStyle.color, lineStyle.opacity) : undefined);
  const focusLocatorRadius = kmToUnits(
    Math.max(
      0.00002,
      Math.min(BODY_DEFINITIONS[missionId].minDistanceKm * 0.25, 0.000125),
    ),
  );

  useFrame(() => {
    if (!asset) {
      missionPositionKmRef.current.set(0, 0, 0);
      focusOffsetKmRef?.current.set(0, 0, 0);
      return;
    }

    const nextProgress = Math.max(
      0,
      Math.min(
        asset.durationSeconds,
        (currentSimulationDateMs(timeline, timelineSystemMs()) -
          missionLaunchMs(asset)) /
          1000,
        ),
    );

    positionAtMissionTime(samples, nextProgress, missionPositionKmRef.current);

    if (missionFocused) {
      focusOffsetKmRef?.current.copy(missionPositionKmRef.current);
    } else {
      focusOffsetKmRef?.current.set(0, 0, 0);
    }

    const minProgressDelta = missionFocused ? 0 : 5;
    if (Math.abs(progressRef.current - nextProgress) < minProgressDelta) return;
    progressRef.current = nextProgress;
    setProgressSeconds(nextProgress);
  }, -2);

  useFrame(() => {
    MISSION_ROOT_POSITION.copy(systemOriginKmRef.current);
    missionRootRef.current?.position.set(
      kmToUnits(MISSION_ROOT_POSITION.x),
      kmToUnits(MISSION_ROOT_POSITION.y),
      kmToUnits(MISSION_ROOT_POSITION.z),
    );
    anchorRef?.current?.position.set(
      kmToUnits(missionPositionKmRef.current.x),
      kmToUnits(missionPositionKmRef.current.y),
      kmToUnits(missionPositionKmRef.current.z),
    );
  }, -0.5);

  useFrame(() => {
    MISSION_CAMERA_DISTANCE_POSITION
      .copy(systemOriginKmRef.current)
      .add(missionPositionKmRef.current);
    MISSION_VISUAL_WORLD_POSITION.set(
      kmToUnits(MISSION_CAMERA_DISTANCE_POSITION.x),
      kmToUnits(MISSION_CAMERA_DISTANCE_POSITION.y),
      kmToUnits(MISSION_CAMERA_DISTANCE_POSITION.z),
    );
    const nextDistanceFade = smoothDistanceFade(
      camera.position.distanceTo(MISSION_VISUAL_WORLD_POSITION),
      MISSION_VISUAL_FADE_START_DISTANCE,
      MISSION_VISUAL_FADE_END_DISTANCE,
    );
    const nextBloomDistanceFade = asymptoticDistanceFade(
      camera.position.distanceTo(MISSION_VISUAL_WORLD_POSITION),
      MISSION_BLOOM_FADE_START_DISTANCE,
      MISSION_BLOOM_FADE_HALF_DISTANCE,
      BLOOM_DISTANCE_FADE_EXPONENT,
    );

    if (Math.abs(distanceFadeRef.current - nextDistanceFade) >= 0.01) {
      distanceFadeRef.current = nextDistanceFade;
      setDistanceFade(nextDistanceFade);
    }
    if (Math.abs(bloomDistanceFadeRef.current - nextBloomDistanceFade) >= 0.01) {
      bloomDistanceFadeRef.current = nextBloomDistanceFade;
      setBloomDistanceFade(nextBloomDistanceFade);
    }
  }, -0.4);

  const streakPoints = useMemo(() => {
    if (!asset || samples.length === 0) return [];
    return smoothTrajectoryPoints(
      toUnits(
        sliceMissionTrajectory(
          samples,
          Math.max(0, progressSeconds - asset.streakWindowSeconds),
          progressSeconds,
        ),
      ),
      6,
    );
  }, [asset, progressSeconds, samples]);
  const pathWidthPx = lineStyle?.widthPx ?? 1;
  const streakWidthPx = useMemo(() => {
    if (!streakStyle) return 1;
    const farWidthPx = Math.max(
      STREAK_MIN_WIDTH_PX,
      streakStyle.widthPx * STREAK_FAR_WIDTH_SCALE,
    );
    return MathUtils.lerp(streakStyle.widthPx, farWidthPx, distanceFade);
  }, [distanceFade, streakStyle]);
  const headSizePx = useMemo(() => {
    if (!headStyle) return 0;
    const farSizePx = Math.min(
      headStyle.sizePx,
      Math.max(
        HEAD_MIN_SIZE_PX,
        pathWidthPx * HEAD_MIN_SIZE_TO_PATH_RATIO,
        headStyle.sizePx * HEAD_FAR_SIZE_SCALE,
      ),
    );
    return MathUtils.lerp(headStyle.sizePx, farSizePx, distanceFade);
  }, [distanceFade, headStyle, pathWidthPx]);
  const streakGlowHeadIntensity = useMemo(
    () =>
      MathUtils.lerp(
        STREAK_GLOW_HEAD_INTENSITY,
        STREAK_GLOW_HEAD_INTENSITY * STREAK_GLOW_HEAD_FAR_INTENSITY_SCALE,
        bloomDistanceFade,
      ),
    [bloomDistanceFade],
  );
  const streakGlowTailIntensity = useMemo(
    () =>
      MathUtils.lerp(
        STREAK_GLOW_TAIL_INTENSITY,
        STREAK_GLOW_TAIL_INTENSITY * STREAK_GLOW_TAIL_FAR_INTENSITY_SCALE,
        bloomDistanceFade,
      ),
    [bloomDistanceFade],
  );

  return (
      <group ref={missionRootRef}>
        {asset && samples.length >= 2 && lineStyle ? (
          <TrajectoryLine
            chunkSize={64}
            color={lineStyle.color}
            lineWidthPx={lineStyle.widthPx}
            opacity={lineStyle.opacity}
            points={fullPathPoints}
            renderOrder={TRAJECTORY_PATH_RENDER_ORDER}
          />
        ) : null}
      {asset && streakPoints.length >= 2 && streakStyle ? (
          <>
            <FadingStreakLine
              color={streakStyle.color}
              headIntensity={streakGlowHeadIntensity}
              lineWidthPx={streakWidthPx * STREAK_GLOW_WIDTH_MULTIPLIER}
              bakeOpacity={false}
              layer={MISSION_BLOOM_LAYER}
              opacity={1}
              points={streakPoints}
              renderOrder={TRAJECTORY_STREAK_GLOW_RENDER_ORDER}
              tailColor={streakTailColor}
              tailIntensity={streakGlowTailIntensity}
            />
            <FadingStreakLine
              color={streakStyle.color}
              headIntensity={STREAK_VISIBLE_HEAD_INTENSITY}
              lineWidthPx={streakWidthPx}
              opacity={streakStyle.opacity}
              points={streakPoints}
              renderOrder={TRAJECTORY_STREAK_RENDER_ORDER}
              tailColor={streakTailColor}
            />
          </>
      ) : null}
      <group ref={anchorRef} name={missionId} position={ZERO_POSITION}>
        {missionFocused ? (
          <mesh frustumCulled={false} renderOrder={10}>
            <sphereGeometry args={[focusLocatorRadius, 14, 14]} />
            <meshBasicMaterial
              color="#8ce8ff"
              depthTest={false}
              depthWrite={false}
              opacity={0.5}
              side={DoubleSide}
              toneMapped={false}
              transparent
              wireframe
            />
          </mesh>
        ) : null}
        {headStyle ? (
          <ScreenSpaceOrb
            color={headStyle.color}
            distanceFade={bloomDistanceFade}
            maxSizeKm={headStyle.maxSizeKm}
            sizePx={headSizePx}
          />
        ) : null}
      </group>
    </group>
  );
}

export function MissionTrajectories({
  focusBodyId,
  activeMissionId,
  missionAnchors,
  missionFocusOffsetsKm,
  systemOriginKmRef,
  timeline,
}: MissionTrajectoriesProps) {
  const selectedMissionId =
    activeMissionId ??
    MISSION_REGISTRY.find((mission) => mission.id === focusBodyId)?.id ??
    null;

  const visibleMissions = selectedMissionId
    ? MISSION_REGISTRY.filter(
        (mission: MissionRegistryEntry) => mission.id === selectedMissionId,
      )
    : [];

  if (visibleMissions.length === 0) return null;

  return (
    <>
      {visibleMissions.map((mission) => (
        <MissionTrajectory
          key={mission.id}
          anchorRef={missionAnchors[mission.id]}
          focusBodyId={focusBodyId}
          focusOffsetKmRef={missionFocusOffsetsKm[mission.id]}
          missionId={mission.id}
          assetPath={mission.assetPath}
          systemOriginKmRef={systemOriginKmRef}
          timeline={timeline}
        />
      ))}
    </>
  );
}
