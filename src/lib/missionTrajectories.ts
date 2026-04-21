import { MathUtils, Vector3 } from "three";
import { EARTH_RADIUS_KM, MOON_RADIUS_KM } from "./constants.ts";
import {
  type MissionAsset,
  type MissionVectorSample,
  type SampledVectorMissionAsset,
} from "./missions.ts";
import { moonGeocentricPositionKm } from "./orbits.ts";

export type MissionTrajectorySample = {
  positionKm: Vector3;
  tSeconds: number;
};

const DEFAULT_SAMPLE_STEP_SECONDS = 1_800;
const DEFAULT_LUNAR_SPHERE_RADIUS_KM = 66_100;
const DEFAULT_PARKING_ORBIT_ALTITUDE_KM = 185;
const DEFAULT_HEAD_RADIUS_KM = 260;
const DEFAULT_FLYBY_SHOULDER_KM = 22_000;
const DEFAULT_FLYBY_TANGENT_KM = 24_000;
const DEFAULT_OUTBOUND_CONTROL_KM = 95_000;
const DEFAULT_INBOUND_CONTROL_KM = 150_000;
const DEFAULT_RETURN_APPROACH_OFFSET_KM = 70_000;
const DEFAULT_EARTH_ENTRY_ALTITUDE_KM = 120;
const DEFAULT_LINE_COLOR = "#888888";
const DEFAULT_STREAK_COLOR = "#4da6ff";

const VECTOR_A = new Vector3();
const VECTOR_B = new Vector3();
const VECTOR_C = new Vector3();
const VECTOR_D = new Vector3();
const VECTOR_E = new Vector3();
const VECTOR_F = new Vector3();
const VECTOR_G = new Vector3();
const VECTOR_H = new Vector3();
const VECTOR_I = new Vector3();
const VECTOR_J = new Vector3();
const VECTOR_K = new Vector3();
const FALLBACK_UP = new Vector3(0, 1, 0);

export function missionLaunchMs(asset: MissionAsset) {
  return Date.parse(asset.launchUtc);
}

function moonPositionForMissionTime(
  asset: MissionAsset,
  tSeconds: number,
  target: Vector3,
) {
  return moonGeocentricPositionKm(missionLaunchMs(asset) + tSeconds * 1000, target);
}

function sampleCubicBezier(
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3,
  t: number,
  target: Vector3,
) {
  const omt = 1 - t;
  const omt2 = omt * omt;
  const omt3 = omt2 * omt;
  const t2 = t * t;
  const t3 = t2 * t;

  return target
    .copy(p0)
    .multiplyScalar(omt3)
    .addScaledVector(p1, 3 * omt2 * t)
    .addScaledVector(p2, 3 * omt * t2)
    .addScaledVector(p3, t3);
}

function fallbackPlaneBasis(radial: Vector3, tangent: Vector3) {
  tangent
    .copy(FALLBACK_UP)
    .cross(radial)
    .normalize();

  if (tangent.lengthSq() <= 1e-8) {
    tangent.set(1, 0, 0).cross(radial).normalize();
  }

  return tangent;
}

function pushSample(
  samples: MissionTrajectorySample[],
  tSeconds: number,
  positionKm: Vector3,
) {
  const previous = samples.at(-1);
  if (previous && Math.abs(previous.tSeconds - tSeconds) < 1e-6) {
    previous.positionKm.copy(positionKm);
    return;
  }

  samples.push({
    tSeconds,
    positionKm: positionKm.clone(),
  });
}

function samplePhase(
  samples: MissionTrajectorySample[],
  startSeconds: number,
  endSeconds: number,
  evaluator: (u: number, target: Vector3) => Vector3,
  stepSeconds: number,
) {
  if (endSeconds <= startSeconds) return;

  const duration = endSeconds - startSeconds;
  const segmentCount = Math.max(1, Math.ceil(duration / stepSeconds));

  for (let index = 0; index <= segmentCount; index += 1) {
    const u = index / segmentCount;
    const tSeconds = MathUtils.lerp(startSeconds, endSeconds, u);
    pushSample(samples, tSeconds, evaluator(u, VECTOR_E));
  }
}

function sampleBezierPhase(
  samples: MissionTrajectorySample[],
  startSeconds: number,
  endSeconds: number,
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3,
  stepSeconds: number,
) {
  samplePhase(
    samples,
    startSeconds,
    endSeconds,
    (u, target) => sampleCubicBezier(p0, p1, p2, p3, u, target),
    stepSeconds,
  );
}

function vectorFromTuple(
  value: readonly [number, number, number],
  target: Vector3,
) {
  return target.set(value[0], value[1], value[2]);
}

function buildFrameBasis(
  radialSource: Vector3,
  tangentSource: Vector3,
  radialTarget: Vector3,
  tangentTarget: Vector3,
  normalTarget: Vector3,
) {
  radialTarget.copy(radialSource).normalize();
  tangentTarget.copy(tangentSource);
  tangentTarget.addScaledVector(
    radialTarget,
    -tangentTarget.dot(radialTarget),
  );

  if (tangentTarget.lengthSq() <= 1e-8) {
    fallbackPlaneBasis(radialTarget, tangentTarget);
  } else {
    tangentTarget.normalize();
  }

  normalTarget.copy(radialTarget).cross(tangentTarget).normalize();
  tangentTarget.copy(normalTarget).cross(radialTarget).normalize();
}

function transformSampleIntoMoonFrame(
  positionKm: readonly [number, number, number],
  moonSamples: readonly MissionVectorSample[],
  index: number,
  target: Vector3,
) {
  const sample = moonSamples[index];
  const previous = moonSamples[Math.max(0, index - 1)];
  const next = moonSamples[Math.min(moonSamples.length - 1, index + 1)];

  const actualMoon = vectorFromTuple(sample.position_km, VECTOR_A);
  const actualMoonTangent = vectorFromTuple(next.position_km, VECTOR_B).sub(
    vectorFromTuple(previous.position_km, VECTOR_C),
  );
  const displayMoon = moonGeocentricPositionKm(Date.parse(sample.utc), VECTOR_D);
  const displayMoonTangent = moonGeocentricPositionKm(
    Date.parse(next.utc),
    VECTOR_E,
  ).sub(moonGeocentricPositionKm(Date.parse(previous.utc), VECTOR_F));

  buildFrameBasis(actualMoon, actualMoonTangent, VECTOR_G, VECTOR_H, VECTOR_I);
  buildFrameBasis(displayMoon, displayMoonTangent, VECTOR_J, VECTOR_K, VECTOR_F);

  const spacecraft = vectorFromTuple(positionKm, VECTOR_B);
  const scale =
    actualMoon.lengthSq() > 1e-8 ? displayMoon.length() / actualMoon.length() : 1;
  const radialComponent = spacecraft.dot(VECTOR_G) * scale;
  const tangentialComponent = spacecraft.dot(VECTOR_H) * scale;
  const normalComponent = spacecraft.dot(VECTOR_I) * scale;

  return target
    .copy(VECTOR_J)
    .multiplyScalar(radialComponent)
    .addScaledVector(VECTOR_K, tangentialComponent)
    .addScaledVector(VECTOR_F, normalComponent);
}

function buildEarthMoonFreeReturnSamples(asset: MissionAsset) {
  if (asset.trajectoryModel !== "earth-moon-free-return-v1") {
    return [];
  }

  const { parameters } = asset;
  const samples: MissionTrajectorySample[] = [];

  const parkingOrbitCount = parameters.parking_orbit_count ?? 0;
  const parkingOrbitRadiusKm =
    EARTH_RADIUS_KM +
    (parameters.parking_orbit_altitude_km ?? DEFAULT_PARKING_ORBIT_ALTITUDE_KM);
  const lunarSphereRadiusKm =
    parameters.lunar_sphere_radius_km ?? DEFAULT_LUNAR_SPHERE_RADIUS_KM;
  const closestApproachRadiusKm =
    MOON_RADIUS_KM + parameters.closest_approach_altitude_km;
  const flybyShoulderKm =
    parameters.flyby_shoulder_km ?? DEFAULT_FLYBY_SHOULDER_KM;
  const flybyShoulderTangentKm =
    parameters.flyby_shoulder_tangent_km ?? DEFAULT_FLYBY_TANGENT_KM;
  const outboundControlKm =
    parameters.outbound_control_km ?? DEFAULT_OUTBOUND_CONTROL_KM;
  const inboundControlKm =
    parameters.inbound_control_km ?? DEFAULT_INBOUND_CONTROL_KM;
  const returnApproachOffsetKm =
    parameters.return_approach_offset_km ?? DEFAULT_RETURN_APPROACH_OFFSET_KM;
  const earthEntryRadiusKm =
    EARTH_RADIUS_KM +
    (parameters.earth_entry_altitude_km ?? DEFAULT_EARTH_ENTRY_ALTITUDE_KM);
  const flybyStartSeconds =
    parameters.flyby_start_seconds ?? parameters.closest_approach_seconds;
  const flybyEndSeconds = MathUtils.lerp(
    parameters.closest_approach_seconds,
    parameters.lunar_sphere_exit_seconds,
    0.45,
  );
  const moonAtClosestApproach = moonPositionForMissionTime(
    asset,
    parameters.closest_approach_seconds,
    VECTOR_A,
  );
  const moonBeforeClosestApproach = moonPositionForMissionTime(
    asset,
    Math.max(0, parameters.closest_approach_seconds - 6 * 3_600),
    VECTOR_B,
  );
  const moonAfterClosestApproach = moonPositionForMissionTime(
    asset,
    Math.min(asset.durationSeconds, parameters.closest_approach_seconds + 6 * 3_600),
    VECTOR_C,
  );

  const radialClosestApproach = moonAtClosestApproach.clone().normalize();
  const tangentClosestApproach = moonAfterClosestApproach
    .clone()
    .sub(moonBeforeClosestApproach);
  tangentClosestApproach.addScaledVector(
    radialClosestApproach,
    -tangentClosestApproach.dot(radialClosestApproach),
  );
  if (tangentClosestApproach.lengthSq() <= 1e-8) {
    fallbackPlaneBasis(radialClosestApproach, tangentClosestApproach);
  } else {
    tangentClosestApproach.normalize();
  }

  const launchOrbitExit = tangentClosestApproach
    .clone()
    .multiplyScalar(-parkingOrbitRadiusKm);

  const moonAtEntry = moonPositionForMissionTime(
    asset,
    parameters.lunar_sphere_entry_seconds,
    VECTOR_B,
  );
  const entryDirection = moonAtEntry.clone().normalize();
  const entryPosition = moonAtEntry
    .clone()
    .addScaledVector(entryDirection, -lunarSphereRadiusKm);

  const flybyStartMoon = moonPositionForMissionTime(
    asset,
    flybyStartSeconds,
    VECTOR_C,
  );
  const moonAtFlybyEnd = moonPositionForMissionTime(
    asset,
    flybyEndSeconds,
    VECTOR_D,
  );
  const flybyStartDirection = flybyStartMoon.clone().normalize();
  const flybyEndDirection = moonAtFlybyEnd.clone().normalize();
  const flybyStartPosition = flybyStartMoon
    .clone()
    .addScaledVector(flybyStartDirection, -(closestApproachRadiusKm + flybyShoulderKm))
    .addScaledVector(tangentClosestApproach, flybyShoulderTangentKm);
  const flybyEndPosition = moonAtFlybyEnd
    .clone()
    .addScaledVector(flybyEndDirection, -(closestApproachRadiusKm + flybyShoulderKm))
    .addScaledVector(tangentClosestApproach, -flybyShoulderTangentKm * 0.9);

  const closestApproachPosition = moonAtClosestApproach
    .clone()
    .addScaledVector(radialClosestApproach, closestApproachRadiusKm);

  const moonAtExit = moonPositionForMissionTime(
    asset,
    parameters.lunar_sphere_exit_seconds,
    VECTOR_A,
  );
  const exitDirection = moonAtExit.clone().normalize();
  const exitPosition = moonAtExit
    .clone()
    .addScaledVector(exitDirection, -lunarSphereRadiusKm);

  const earthEntryPosition = tangentClosestApproach
    .clone()
    .multiplyScalar(earthEntryRadiusKm);
  const outboundStartControl = launchOrbitExit
    .clone()
    .addScaledVector(radialClosestApproach, outboundControlKm);
  const flybyEntryControl = flybyStartPosition;
  const outboundEndControl = entryPosition
    .clone()
    .add(entryPosition.clone().sub(flybyEntryControl));
  const closestApproachInboundControl = closestApproachPosition
    .clone()
    .addScaledVector(radialClosestApproach, flybyShoulderKm * 0.55)
    .addScaledVector(tangentClosestApproach, -flybyShoulderTangentKm * 0.7);
  const closestApproachOutboundControl = closestApproachPosition
    .clone()
    .addScaledVector(radialClosestApproach, flybyShoulderKm * 0.55)
    .addScaledVector(tangentClosestApproach, flybyShoulderTangentKm * 0.85);
  const flybyExitControl = exitPosition
    .clone()
    .add(exitPosition.clone().sub(flybyEndPosition));
  const returnStartControl = exitPosition
    .clone()
    .add(exitPosition.clone().sub(flybyExitControl));
  const returnEndControl = earthEntryPosition
    .clone()
    .addScaledVector(tangentClosestApproach, returnApproachOffsetKm * 0.7)
    .addScaledVector(radialClosestApproach, inboundControlKm * 0.18);

  if (parameters.tli_seconds > 0 && parkingOrbitCount > 0) {
    samplePhase(
      samples,
      0,
      parameters.tli_seconds,
      (u, target) => {
        const angle =
          -Math.PI / 2 - parkingOrbitCount * Math.PI * 2 * (1 - u);
        return target
          .copy(radialClosestApproach)
          .multiplyScalar(Math.cos(angle) * parkingOrbitRadiusKm)
          .addScaledVector(
            tangentClosestApproach,
            Math.sin(angle) * parkingOrbitRadiusKm,
          );
      },
      DEFAULT_SAMPLE_STEP_SECONDS,
    );
  } else {
    pushSample(samples, 0, launchOrbitExit);
    pushSample(samples, parameters.tli_seconds, launchOrbitExit);
  }

  sampleBezierPhase(
    samples,
    parameters.tli_seconds,
    parameters.lunar_sphere_entry_seconds,
    launchOrbitExit,
    outboundStartControl,
    outboundEndControl,
    entryPosition,
    DEFAULT_SAMPLE_STEP_SECONDS,
  );

  sampleBezierPhase(
    samples,
    parameters.lunar_sphere_entry_seconds,
    parameters.closest_approach_seconds,
    entryPosition,
    flybyEntryControl,
    closestApproachInboundControl,
    closestApproachPosition,
    DEFAULT_SAMPLE_STEP_SECONDS / 2,
  );

  sampleBezierPhase(
    samples,
    parameters.closest_approach_seconds,
    parameters.lunar_sphere_exit_seconds,
    closestApproachPosition,
    closestApproachOutboundControl,
    flybyExitControl,
    exitPosition,
    DEFAULT_SAMPLE_STEP_SECONDS / 2,
  );

  sampleBezierPhase(
    samples,
    parameters.lunar_sphere_exit_seconds,
    asset.durationSeconds,
    exitPosition,
    returnStartControl,
    returnEndControl,
    earthEntryPosition,
    DEFAULT_SAMPLE_STEP_SECONDS,
  );

  pushSample(samples, asset.durationSeconds, earthEntryPosition);
  return samples;
}

function buildSampledVectorMissionSamples(asset: SampledVectorMissionAsset) {
  const moonReferenceSamples = asset.referenceBodies?.moon?.samples;
  const canProjectIntoMoonFrame =
    Array.isArray(moonReferenceSamples) &&
    moonReferenceSamples.length === asset.trajectory.samples.length;

  return asset.trajectory.samples.map((sample, index) => ({
    positionKm: canProjectIntoMoonFrame
      ? transformSampleIntoMoonFrame(
          sample.position_km,
          moonReferenceSamples,
          index,
          new Vector3(),
        )
      : new Vector3(
          sample.position_km[0],
          sample.position_km[1],
          sample.position_km[2],
        ),
    tSeconds: sample.t_plus_seconds,
  }));
}

export function buildMissionTrajectorySamples(asset: MissionAsset) {
  switch (asset.trajectoryModel) {
    case "earth-moon-free-return-v1":
      return buildEarthMoonFreeReturnSamples(asset);
    case "sampled-vectors-v1":
      return buildSampledVectorMissionSamples(asset);
    default:
      return [];
  }
}

export function missionHeadStyle(asset: MissionAsset) {
  return {
    color: asset.style?.head_color ?? asset.style?.streak_color ?? DEFAULT_STREAK_COLOR,
    radiusKm: asset.style?.head_radius_km ?? DEFAULT_HEAD_RADIUS_KM,
  };
}

export function missionLineStyle(asset: MissionAsset) {
  return {
    color: asset.style?.line_color ?? DEFAULT_LINE_COLOR,
    opacity: asset.style?.line_opacity ?? 0.4,
  };
}

export function missionStreakStyle(asset: MissionAsset) {
  return {
    color: asset.style?.streak_color ?? DEFAULT_STREAK_COLOR,
    opacity: asset.style?.streak_opacity ?? 0.95,
  };
}

export function positionAtMissionTime(
  samples: readonly MissionTrajectorySample[],
  tSeconds: number,
  target: Vector3,
) {
  if (samples.length === 0) return target.set(0, 0, 0);
  if (tSeconds <= samples[0].tSeconds) {
    return target.copy(samples[0].positionKm);
  }

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const next = samples[index];
    if (tSeconds > next.tSeconds) continue;

    const span = Math.max(next.tSeconds - previous.tSeconds, 1e-6);
    const alpha = MathUtils.clamp((tSeconds - previous.tSeconds) / span, 0, 1);
    return target.copy(previous.positionKm).lerp(next.positionKm, alpha);
  }

  return target.copy(samples.at(-1)?.positionKm ?? samples[0].positionKm);
}

export function sliceMissionTrajectory(
  samples: readonly MissionTrajectorySample[],
  startSeconds: number,
  endSeconds: number,
) {
  if (samples.length === 0) return [];

  const clampedStart = Math.max(startSeconds, samples[0].tSeconds);
  const clampedEnd = Math.min(endSeconds, samples.at(-1)?.tSeconds ?? endSeconds);
  if (clampedEnd < clampedStart) return [];

  const points = [positionAtMissionTime(samples, clampedStart, new Vector3()).clone()];

  for (const sample of samples) {
    if (sample.tSeconds <= clampedStart || sample.tSeconds >= clampedEnd) continue;
    points.push(sample.positionKm.clone());
  }

  points.push(positionAtMissionTime(samples, clampedEnd, new Vector3()).clone());
  return points;
}
