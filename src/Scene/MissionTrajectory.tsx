import { useFrame } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  Line as ThreeLine,
  LineBasicMaterial,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  Vector3,
  type ColorRepresentation,
  type Material,
} from "three";
import { type BodyId } from "../lib/bodies.ts";
import type { MissionRegistryEntry, MissionVisual } from "../lib/missions.ts";
import { MISSION_REGISTRY } from "../lib/missions.ts";
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
import { useMissionModelAsset } from "../lib/useMissionModelAsset.ts";

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
};

const HEAD_POSITION = new Vector3();
const ZERO_POSITION: [number, number, number] = [0, 0, 0];
const MODEL_BOUNDS = new Box3();
const MODEL_SIZE = new Vector3();
const MODEL_CENTER = new Vector3();
const MODEL_ROTATION = new Euler();
const MISSION_ROOT_POSITION = new Vector3();
const DEFAULT_MODEL_COLOR = new Color("#9fdcff");

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

function buildLineChunks(
  points: readonly [number, number, number][],
  chunkSize: number,
) {
  if (points.length < 2 || chunkSize < 2 || points.length <= chunkSize) {
    return [
      {
        key: 0,
        origin: ZERO_POSITION,
        points: points.slice() as [number, number, number][],
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
    });

    if (end === points.length) break;
  }

  return chunks;
}

function TrajectoryLine({
  chunkSize = 0,
  color,
  opacity,
  points,
}: {
  chunkSize?: number;
  color: ColorRepresentation;
  opacity: number;
  points: readonly [number, number, number][];
}) {
  const chunks = useMemo(
    () => buildLineChunks(points, chunkSize),
    [chunkSize, points],
  );

  if (points.length < 2) return null;

  return (
    <group>
      {chunks.map((chunk) => (
        <TrajectoryLineChunk
          key={chunk.key}
          color={color}
          opacity={opacity}
          origin={chunk.origin}
          points={chunk.points}
        />
      ))}
    </group>
  );
}

function TrajectoryLineChunk({
  color,
  opacity,
  origin,
  points,
}: {
  color: ColorRepresentation;
  opacity: number;
  origin: [number, number, number];
  points: readonly [number, number, number][];
}) {
  const geometry = useMemo(() => {
    const nextGeometry = new BufferGeometry();
    const positions = new Float32Array(points.length * 3);

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const offset = index * 3;
      positions[offset] = point[0];
      positions[offset + 1] = point[1];
      positions[offset + 2] = point[2];
    }

    nextGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(positions, 3),
    );
    nextGeometry.computeBoundingSphere();
    return nextGeometry;
  }, [points]);

  const material = useMemo(
    () =>
      new LineBasicMaterial({
        color,
        opacity,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [color, opacity],
  );

  const line = useMemo(() => {
    const nextLine = new ThreeLine(geometry, material);
    nextLine.frustumCulled = false;
    return nextLine;
  }, [geometry, material]);

  useEffect(() => {
    return () => {
      material.dispose();
      geometry.dispose();
    };
  }, [geometry, material]);

  if (points.length < 2) return null;

  return (
    <group position={origin}>
      <primitive object={line} />
    </group>
  );
}

const FADE_SEGMENTS = 12;

function FadingStreakLine({
  color,
  opacity,
  points,
}: {
  color: ColorRepresentation;
  opacity: number;
  points: readonly [number, number, number][];
}) {
  const segments = useMemo(() => {
    if (points.length < 2) return [];
    const result: { points: [number, number, number][]; opacity: number }[] = [];
    const totalPoints = points.length;
    const segLen = Math.max(2, Math.ceil(totalPoints / FADE_SEGMENTS));

    for (let i = 0; i < FADE_SEGMENTS; i++) {
      const start = Math.min(i * segLen, totalPoints - 1);
      const end = Math.min((i + 1) * segLen, totalPoints - 1);
      if (end <= start) continue;
      // Include one overlapping point for continuity
      const slice = points.slice(start, end + 1) as [number, number, number][];
      if (slice.length < 2) continue;
      // t goes from 0 (tail) to 1 (head)
      const t = (i + 1) / FADE_SEGMENTS;
      const fade = t * t * t;
      result.push({ points: slice, opacity: opacity * fade });
    }
    return result;
  }, [points, opacity]);

  if (points.length < 2) return [];

  return (
    <group>
      {segments.map((seg, i) => (
        <TrajectoryLine
          key={i}
          color={color}
          opacity={seg.opacity}
          points={seg.points}
        />
      ))}
    </group>
  );
}

function createVisibleMaterial(material: Material) {
  const color =
    "color" in material && material.color instanceof Color
      ? material.color
      : DEFAULT_MODEL_COLOR;

  return new MeshBasicMaterial({
    color,
    depthWrite: true,
    opacity: material.opacity,
    side: DoubleSide,
    toneMapped: false,
    transparent: material.transparent,
  });
}

function buildMissionModel(
  source: Group,
  visual: MissionVisual | undefined,
) {
  if (!visual?.model_asset_path) return null;

  const root = new Group();
  const scene = source.clone(true);
  scene.updateMatrixWorld(true);

  MODEL_BOUNDS.setFromObject(scene);
  MODEL_BOUNDS.getSize(MODEL_SIZE);
  MODEL_BOUNDS.getCenter(MODEL_CENTER);
  scene.position.sub(MODEL_CENTER);

  const longestDimension = Math.max(
    MODEL_SIZE.x,
    MODEL_SIZE.y,
    MODEL_SIZE.z,
    1e-6,
  );
  if (visual.model_longest_dimension_m) {
    const targetDimensionUnits = kmToUnits(visual.model_longest_dimension_m / 1000);
    scene.scale.setScalar(targetDimensionUnits / longestDimension);
  }

  if (visual.model_rotation_deg) {
    MODEL_ROTATION.set(
      MathUtils.degToRad(visual.model_rotation_deg[0]),
      MathUtils.degToRad(visual.model_rotation_deg[1]),
      MathUtils.degToRad(visual.model_rotation_deg[2]),
    );
    scene.rotation.copy(MODEL_ROTATION);
  }

  scene.traverse((object) => {
    object.frustumCulled = false;
    if ("material" in object) {
      const material = object.material;
      if (Array.isArray(material)) {
        object.material = material.map(createVisibleMaterial);
      } else if (material) {
        object.material = createVisibleMaterial(material as Material);
      }
    }
  });

  root.add(scene);
  return root;
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
  const { asset, error } = useMissionAsset(assetPath);
  const [progressSeconds, setProgressSeconds] = useState(0);
  const progressRef = useRef(0);
  const missionRootRef = useRef<Group>(null);
  const { asset: modelAsset, error: modelError } = useMissionModelAsset(
    asset?.visual?.model_asset_path,
  );
  const missionFocused = focusBodyId === missionId;

  useEffect(() => {
    if (!error) return;
    console.warn(`Mission asset failed to load: ${assetPath}`, error);
  }, [assetPath, error]);

  useEffect(() => {
    if (!modelError || !asset?.visual?.model_asset_path) return;
    console.warn(
      `Mission model failed to load: ${asset.visual.model_asset_path}`,
      modelError,
    );
  }, [asset?.visual?.model_asset_path, modelError]);

  const samples = useMemo(
    () => (asset ? buildMissionTrajectorySamples(asset) : []),
    [asset],
  );
  const samplePositions = useMemo(
    () => samples.map((sample) => sample.positionKm),
    [samples],
  );
  const fullPathPoints = useMemo(
    () => toUnits(samplePositions),
    [samplePositions],
  );
  const lineStyle = asset ? missionLineStyle(asset) : null;
  const streakStyle = asset ? missionStreakStyle(asset) : null;
  const headStyle = asset ? missionHeadStyle(asset) : null;
  const focusLocatorRadius =
    asset?.visual?.model_longest_dimension_m !== undefined
      ? kmToUnits(
          Math.max(asset.visual.model_longest_dimension_m * 0.00075, 0.003),
        )
      : kmToUnits(0.003);
  const model = useMemo(
    () =>
      asset?.visual && modelAsset
        ? buildMissionModel(modelAsset.scene, asset.visual)
        : null,
    [asset?.visual, modelAsset],
  );

  useFrame(() => {
    if (!asset) {
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

    positionAtMissionTime(samples, nextProgress, HEAD_POSITION);

    if (missionFocused) {
      focusOffsetKmRef?.current.copy(HEAD_POSITION);
    } else {
      focusOffsetKmRef?.current.set(0, 0, 0);
    }
    MISSION_ROOT_POSITION.copy(systemOriginKmRef.current);
    missionRootRef.current?.position.set(
      kmToUnits(MISSION_ROOT_POSITION.x),
      kmToUnits(MISSION_ROOT_POSITION.y),
      kmToUnits(MISSION_ROOT_POSITION.z),
    );
    anchorRef?.current?.position.set(
      kmToUnits(HEAD_POSITION.x),
      kmToUnits(HEAD_POSITION.y),
      kmToUnits(HEAD_POSITION.z),
    );

    const minProgressDelta = missionFocused ? 0 : 5;
    if (Math.abs(progressRef.current - nextProgress) < minProgressDelta) return;
    progressRef.current = nextProgress;
    setProgressSeconds(nextProgress);
  }, -2);

  const streakPoints = useMemo(() => {
    if (!asset || samples.length === 0) return [];
    return toUnits(
      sliceMissionTrajectory(
        samples,
        Math.max(0, progressSeconds - asset.streakWindowSeconds),
        progressSeconds,
      ),
    );
  }, [asset, progressSeconds, samples]);
  const shouldShowHead =
    !!headStyle &&
    (!asset?.visual?.model_asset_path ||
      asset.visual.show_head !== false ||
      !model ||
      !!modelError);

  return (
    <group ref={missionRootRef}>
      {asset && samples.length >= 2 && lineStyle ? (
        <TrajectoryLine
          chunkSize={64}
          color={lineStyle.color}
          opacity={lineStyle.opacity}
          points={fullPathPoints}
        />
      ) : null}
      {asset && streakPoints.length >= 2 && streakStyle ? (
        <FadingStreakLine
          color={streakStyle.color}
          opacity={streakStyle.opacity}
          points={streakPoints}
        />
      ) : null}
      <group ref={anchorRef} name={missionId} position={ZERO_POSITION}>
        {model ? <primitive object={model} /> : null}
        {missionFocused && model ? (
          <mesh>
            <sphereGeometry args={[focusLocatorRadius, 14, 14]} />
            <meshBasicMaterial
              color="#8ce8ff"
              depthWrite={false}
              opacity={0.5}
              toneMapped={false}
              transparent
              wireframe
            />
          </mesh>
        ) : null}
        {shouldShowHead ? (
          <mesh>
            <sphereGeometry args={[kmToUnits(headStyle.radiusKm), 18, 18]} />
            <meshBasicMaterial color={headStyle.color} toneMapped={false} />
          </mesh>
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
