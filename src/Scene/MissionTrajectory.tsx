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
  SphereGeometry,
  Vector3,
  type ColorRepresentation,
  type Material,
} from "three";
import { BODY_DEFINITIONS, type BodyId } from "../lib/bodies.ts";
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
  depthTest = true,
  opacity,
  points,
  renderOrder = 0,
}: {
  chunkSize?: number;
  color: ColorRepresentation;
  depthTest?: boolean;
  opacity: number;
  points: readonly [number, number, number][];
  renderOrder?: number;
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
          depthTest={depthTest}
          opacity={opacity}
          origin={chunk.origin}
          points={chunk.points}
          renderOrder={renderOrder}
        />
      ))}
    </group>
  );
}

function TrajectoryLineChunk({
  color,
  depthTest,
  opacity,
  origin,
  points,
  renderOrder,
}: {
  color: ColorRepresentation;
  depthTest: boolean;
  opacity: number;
  origin: [number, number, number];
  points: readonly [number, number, number][];
  renderOrder: number;
}) {
  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i][0];
      positions[i * 3 + 1] = points[i][1];
      positions[i * 3 + 2] = points[i][2];
    }
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.computeBoundingSphere();
    return geo;
  }, [points]);

  const material = useMemo(
    () =>
      new LineBasicMaterial({
        color,
        depthTest,
        opacity,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [color, opacity],
  );

  const line = useMemo(() => {
    const l = new ThreeLine(geometry, material);
    l.frustumCulled = false;
    l.renderOrder = renderOrder;
    return l;
  }, [geometry, material, renderOrder]);

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
  depthTest = true,
  opacity,
  points,
  renderOrder = 0,
}: {
  color: ColorRepresentation;
  depthTest?: boolean;
  opacity: number;
  points: readonly [number, number, number][];
  renderOrder?: number;
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
      const slice = points.slice(start, end + 1) as [number, number, number][];
      if (slice.length < 2) continue;
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
          depthTest={depthTest}
          opacity={seg.opacity}
          points={seg.points}
          renderOrder={renderOrder}
        />
      ))}
    </group>
  );
}

function sampleTrajectoryPoints(
  points: readonly [number, number, number][],
  maxPoints: number,
) {
  if (points.length <= maxPoints) {
    return points.map((point) => new Vector3(point[0], point[1], point[2]));
  }

  const sampled: Vector3[] = [];
  const lastIndex = points.length - 1;
  const step = lastIndex / (maxPoints - 1);

  for (let i = 0; i < maxPoints; i += 1) {
    const index = Math.min(lastIndex, Math.round(i * step));
    const point = points[index];
    const previous = sampled.at(-1);
    if (
      previous &&
      previous.x === point[0] &&
      previous.y === point[1] &&
      previous.z === point[2]
    ) {
      continue;
    }
    sampled.push(new Vector3(point[0], point[1], point[2]));
  }

  return sampled;
}

function TrajectoryDots({
  color,
  depthTest = true,
  maxPoints = 256,
  opacity,
  points,
  radius,
  renderOrder = 0,
}: {
  color: ColorRepresentation;
  depthTest?: boolean;
  maxPoints?: number;
  opacity: number;
  points: readonly [number, number, number][];
  radius: number;
  renderOrder?: number;
}) {
  const sampledPoints = useMemo(
    () => sampleTrajectoryPoints(points, maxPoints),
    [maxPoints, points],
  );
  const geometry = useMemo(() => new SphereGeometry(radius, 8, 8), [radius]);

  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color,
        depthTest,
        depthWrite: false,
        opacity,
        toneMapped: false,
        transparent: opacity < 1,
      }),
    [color, depthTest, opacity],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  if (sampledPoints.length === 0) return null;

  return (
    <group>
      {sampledPoints.map((point, index) => (
        <mesh
          key={index}
          frustumCulled={false}
          geometry={geometry}
          material={material}
          position={[point.x, point.y, point.z]}
          renderOrder={renderOrder}
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
  const missionPositionKmRef = useRef(new Vector3());
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
  const focusLocatorRadius = kmToUnits(
    Math.max(
      0.00002,
      Math.min(BODY_DEFINITIONS[missionId].minDistanceKm * 0.25, 0.000125),
    ),
  );
  const focusedPathDotRadius = Math.max(kmToUnits(0.5), focusLocatorRadius * 4_000);
  const focusedStreakDotRadius = focusedPathDotRadius * 1.5;
  const model = useMemo(
    () =>
      asset?.visual && modelAsset
        ? buildMissionModel(modelAsset.scene, asset.visual)
        : null,
    [asset?.visual, modelAsset],
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
          missionFocused ? (
            <TrajectoryDots
              color={lineStyle.color}
              depthTest={false}
              maxPoints={320}
              opacity={lineStyle.opacity}
              points={fullPathPoints}
              radius={focusedPathDotRadius}
              renderOrder={8}
            />
          ) : (
            <TrajectoryLine
              chunkSize={64}
              color={lineStyle.color}
              opacity={lineStyle.opacity}
              points={fullPathPoints}
            />
          )
      ) : null}
      {asset && streakPoints.length >= 2 && streakStyle ? (
          missionFocused ? (
            <TrajectoryDots
              color={streakStyle.color}
              depthTest={false}
              maxPoints={96}
              opacity={streakStyle.opacity}
              points={streakPoints}
              radius={focusedStreakDotRadius}
              renderOrder={9}
            />
          ) : (
            <FadingStreakLine
              color={streakStyle.color}
              opacity={streakStyle.opacity}
              points={streakPoints}
            />
          )
      ) : null}
      <group ref={anchorRef} name={missionId} position={ZERO_POSITION}>
        {model ? <primitive object={model} /> : null}
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
