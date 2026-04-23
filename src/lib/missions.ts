import type { BodyId, BodySystemId } from "./bodies.ts";

export type MissionStyle = {
  head_color?: string;
  head_max_size_km?: number;
  head_radius_km?: number;
  head_size_px?: number;
  line_color?: string;
  line_opacity?: number;
  line_width_px?: number;
  streak_color?: string;
  streak_tail_color?: string;
  streak_opacity?: number;
  streak_width_px?: number;
};

export type MissionVisual = {
  model_asset_path?: string;
  model_longest_dimension_m?: number;
  model_rotation_deg?: [number, number, number];
  show_head?: boolean;
};

export type MissionVectorSample = {
  position_km: [number, number, number];
  t_plus_seconds: number;
  utc: string;
  velocity_km_s?: [number, number, number];
};

export type SampledVectorTrajectory = {
  centerBody: string;
  referenceSystem: string;
  sampleStartUtc: string;
  sampleStopUtc: string;
  samples: MissionVectorSample[];
  source: string;
  stepSeconds?: number;
  targetBody: string;
};

export type EarthMoonFreeReturnParameters = {
  closest_approach_altitude_km: number;
  closest_approach_seconds: number;
  earth_entry_altitude_km?: number;
  flyby_shoulder_km?: number;
  flyby_shoulder_tangent_km?: number;
  flyby_start_seconds?: number;
  inbound_control_km?: number;
  lunar_sphere_entry_seconds: number;
  lunar_sphere_exit_seconds: number;
  lunar_sphere_radius_km?: number;
  max_distance_km?: number;
  max_distance_seconds?: number;
  outbound_control_km?: number;
  parking_orbit_altitude_km?: number;
  parking_orbit_count?: number;
  return_approach_offset_km?: number;
  tli_seconds: number;
};

export type MissionEvent = {
  id: string;
  label: string;
  note?: string;
  t_plus_seconds: number;
};

type MissionAssetBase = {
  assetType: "mission";
  assetVersion: number;
  durationSeconds: number;
  events: MissionEvent[];
  frame: string;
  launchUtc: string;
  missionId: string;
  missionName: string;
  references?: string[];
  streakWindowSeconds: number;
  style?: MissionStyle;
  systemId: BodySystemId;
  notes?: string;
  visual?: MissionVisual;
};

export type ProceduralMissionAsset = MissionAssetBase & {
  parameters: EarthMoonFreeReturnParameters;
  trajectoryModel: "earth-moon-free-return-v1";
};

export type SampledVectorMissionAsset = MissionAssetBase & {
  referenceBodies?: Record<string, SampledVectorTrajectory>;
  trajectory: SampledVectorTrajectory;
  trajectoryModel: "sampled-vectors-v1";
};

export type MissionAsset = ProceduralMissionAsset | SampledVectorMissionAsset;

export type MissionRegistryEntry = {
  assetPath: string;
  color: string;
  id: BodyId;
  label: string;
  launchUtc: string;
  systemId: BodySystemId;
};

export const MISSION_REGISTRY: readonly MissionRegistryEntry[] = [
  {
    id: "artemis2",
    label: "Artemis II",
    color: "#4c6fff",
    launchUtc: "2026-04-01T22:35:12Z",
    assetPath: "/missions/artemis_ii.json",
    systemId: "earthSystem",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function expectVector3(value: unknown, label: string): [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((component) => typeof component !== "number" || !Number.isFinite(component))
  ) {
    throw new Error(`${label} must be a 3-element numeric array`);
  }

  return [value[0], value[1], value[2]];
}

function parseMissionEvent(value: unknown, index: number): MissionEvent {
  if (!isRecord(value)) {
    throw new Error(`events[${index}] must be an object`);
  }

  const event: MissionEvent = {
    id: expectString(value.id, `events[${index}].id`),
    label: expectString(value.label, `events[${index}].label`),
    t_plus_seconds: expectNumber(
      value.t_plus_seconds,
      `events[${index}].t_plus_seconds`,
    ),
  };

  if (typeof value.note === "string" && value.note.length > 0) {
    event.note = value.note;
  }

  return event;
}

function parseParameters(value: unknown): EarthMoonFreeReturnParameters {
  if (!isRecord(value)) {
    throw new Error("parameters must be an object");
  }

  return {
    closest_approach_altitude_km: expectNumber(
      value.closest_approach_altitude_km,
      "parameters.closest_approach_altitude_km",
    ),
    closest_approach_seconds: expectNumber(
      value.closest_approach_seconds,
      "parameters.closest_approach_seconds",
    ),
    earth_entry_altitude_km:
      typeof value.earth_entry_altitude_km === "number"
        ? value.earth_entry_altitude_km
        : undefined,
    flyby_shoulder_km:
      typeof value.flyby_shoulder_km === "number"
        ? value.flyby_shoulder_km
        : undefined,
    flyby_shoulder_tangent_km:
      typeof value.flyby_shoulder_tangent_km === "number"
        ? value.flyby_shoulder_tangent_km
        : undefined,
    flyby_start_seconds:
      typeof value.flyby_start_seconds === "number"
        ? value.flyby_start_seconds
        : undefined,
    inbound_control_km:
      typeof value.inbound_control_km === "number"
        ? value.inbound_control_km
        : undefined,
    lunar_sphere_entry_seconds: expectNumber(
      value.lunar_sphere_entry_seconds,
      "parameters.lunar_sphere_entry_seconds",
    ),
    lunar_sphere_exit_seconds: expectNumber(
      value.lunar_sphere_exit_seconds,
      "parameters.lunar_sphere_exit_seconds",
    ),
    lunar_sphere_radius_km:
      typeof value.lunar_sphere_radius_km === "number"
        ? value.lunar_sphere_radius_km
        : undefined,
    max_distance_km:
      typeof value.max_distance_km === "number"
        ? value.max_distance_km
        : undefined,
    max_distance_seconds:
      typeof value.max_distance_seconds === "number"
        ? value.max_distance_seconds
        : undefined,
    outbound_control_km:
      typeof value.outbound_control_km === "number"
        ? value.outbound_control_km
        : undefined,
    parking_orbit_altitude_km:
      typeof value.parking_orbit_altitude_km === "number"
        ? value.parking_orbit_altitude_km
        : undefined,
    parking_orbit_count:
      typeof value.parking_orbit_count === "number"
        ? value.parking_orbit_count
        : undefined,
    return_approach_offset_km:
      typeof value.return_approach_offset_km === "number"
        ? value.return_approach_offset_km
        : undefined,
    tli_seconds: expectNumber(value.tli_seconds, "parameters.tli_seconds"),
  };
}

function parseStyle(value: unknown): MissionStyle | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error("style must be an object");
  }

  return {
    head_color:
      typeof value.head_color === "string" ? value.head_color : undefined,
    head_max_size_km:
      typeof value.head_max_size_km === "number"
        ? value.head_max_size_km
        : undefined,
    head_radius_km:
      typeof value.head_radius_km === "number" ? value.head_radius_km : undefined,
    head_size_px:
      typeof value.head_size_px === "number" ? value.head_size_px : undefined,
    line_color:
      typeof value.line_color === "string" ? value.line_color : undefined,
    line_opacity:
      typeof value.line_opacity === "number" ? value.line_opacity : undefined,
    line_width_px:
      typeof value.line_width_px === "number" ? value.line_width_px : undefined,
    streak_color:
      typeof value.streak_color === "string" ? value.streak_color : undefined,
    streak_tail_color:
      typeof value.streak_tail_color === "string"
        ? value.streak_tail_color
        : undefined,
    streak_opacity:
      typeof value.streak_opacity === "number" ? value.streak_opacity : undefined,
    streak_width_px:
      typeof value.streak_width_px === "number" ? value.streak_width_px : undefined,
  };
}

function parseVisual(value: unknown): MissionVisual | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error("visual must be an object");
  }

  return {
    model_asset_path:
      typeof value.model_asset_path === "string"
        ? value.model_asset_path
        : undefined,
    model_longest_dimension_m:
      typeof value.model_longest_dimension_m === "number"
        ? value.model_longest_dimension_m
        : undefined,
    model_rotation_deg:
      value.model_rotation_deg !== undefined
        ? expectVector3(value.model_rotation_deg, "visual.model_rotation_deg")
        : undefined,
    show_head:
      typeof value.show_head === "boolean" ? value.show_head : undefined,
  };
}

function parseVectorSample(value: unknown, index: number): MissionVectorSample {
  if (!isRecord(value)) {
    throw new Error(`trajectory.samples[${index}] must be an object`);
  }

  const sample: MissionVectorSample = {
    position_km: expectVector3(
      value.position_km,
      `trajectory.samples[${index}].position_km`,
    ),
    t_plus_seconds: expectNumber(
      value.t_plus_seconds,
      `trajectory.samples[${index}].t_plus_seconds`,
    ),
    utc: expectString(value.utc, `trajectory.samples[${index}].utc`),
  };

  if (value.velocity_km_s !== undefined) {
    sample.velocity_km_s = expectVector3(
      value.velocity_km_s,
      `trajectory.samples[${index}].velocity_km_s`,
    );
  }

  return sample;
}

function parseSampledVectorTrajectory(value: unknown): SampledVectorTrajectory {
  if (!isRecord(value)) {
    throw new Error("trajectory must be an object");
  }
  if (!Array.isArray(value.samples)) {
    throw new Error("trajectory.samples must be an array");
  }

  return {
    centerBody: expectString(value.centerBody, "trajectory.centerBody"),
    referenceSystem: expectString(
      value.referenceSystem,
      "trajectory.referenceSystem",
    ),
    sampleStartUtc: expectString(value.sampleStartUtc, "trajectory.sampleStartUtc"),
    sampleStopUtc: expectString(value.sampleStopUtc, "trajectory.sampleStopUtc"),
    samples: value.samples.map(parseVectorSample),
    source: expectString(value.source, "trajectory.source"),
    stepSeconds:
      typeof value.stepSeconds === "number" ? value.stepSeconds : undefined,
    targetBody: expectString(value.targetBody, "trajectory.targetBody"),
  };
}

function parseReferenceBodies(
  value: unknown,
): Record<string, SampledVectorTrajectory> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error("referenceBodies must be an object");
  }

  return Object.fromEntries(
    Object.entries(value).map(([bodyId, trajectoryValue]) => [
      bodyId,
      parseSampledVectorTrajectory(trajectoryValue),
    ]),
  );
}

export function parseMissionAsset(value: unknown): MissionAsset {
  if (!isRecord(value)) {
    throw new Error("Mission asset must be an object");
  }

  if (value.assetType !== "mission") {
    throw new Error("Mission asset must have assetType='mission'");
  }
  if (!Array.isArray(value.events)) {
    throw new Error("Mission asset events must be an array");
  }

  const baseAsset: MissionAssetBase = {
    assetType: "mission",
    assetVersion: expectNumber(value.assetVersion, "assetVersion"),
    durationSeconds: expectNumber(value.durationSeconds, "durationSeconds"),
    events: value.events.map(parseMissionEvent),
    frame: expectString(value.frame, "frame"),
    launchUtc: expectString(value.launchUtc, "launchUtc"),
    missionId: expectString(value.missionId, "missionId"),
    missionName: expectString(value.missionName, "missionName"),
    references: Array.isArray(value.references)
      ? value.references.filter((reference): reference is string =>
          typeof reference === "string" && reference.length > 0,
        )
      : undefined,
    streakWindowSeconds: expectNumber(
      value.streakWindowSeconds,
      "streakWindowSeconds",
    ),
    style: parseStyle(value.style),
    visual: parseVisual(value.visual),
    systemId:
      value.systemId === "solarSystem" ||
      value.systemId === "earthSystem" ||
      value.systemId === "saturnSystem"
        ? value.systemId
        : "earthSystem",
    notes: typeof value.notes === "string" ? value.notes : undefined,
  };

  switch (value.trajectoryModel) {
    case "earth-moon-free-return-v1":
      return {
        ...baseAsset,
        parameters: parseParameters(value.parameters),
        trajectoryModel: "earth-moon-free-return-v1",
      };
    case "sampled-vectors-v1":
      return {
        ...baseAsset,
        referenceBodies: parseReferenceBodies(value.referenceBodies),
        trajectory: parseSampledVectorTrajectory(value.trajectory),
        trajectoryModel: "sampled-vectors-v1",
      };
    default:
      throw new Error("Unsupported mission trajectory model");
  }
}
