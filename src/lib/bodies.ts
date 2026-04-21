import {
  CAMERA_MAX_DISTANCE_KM,
  CAMERA_MIN_DISTANCE_KM,
  EARTH_RADIUS_KM,
  MOON_RADIUS_KM,
  RING_OUTER_RADIUS,
  SATURN_EQUATORIAL_RADIUS,
  SUN_RADIUS_KM,
  TITAN_RADIUS_KM,
} from "./constants.ts";

export type BodyId =
  | "sun"
  | "earth"
  | "moon"
  | "artemis2"
  | "saturn"
  | "titan";
export type BodySystemId = "solarSystem" | "earthSystem" | "saturnSystem";

export const DEFAULT_FOCUS_BODY_ID: BodyId = "earth";

export type BodyDefinition = {
  defaultFocusDistanceKm: number;
  id: BodyId;
  label: string;
  maxDistanceKm: number;
  minDistanceKm: number;
  parentId: BodyId | null;
  radiusKm: number;
  renderRadiusKm: number;
  systemId: BodySystemId;
};

export const BODY_DEFINITIONS: Record<BodyId, BodyDefinition> = {
  sun: {
    defaultFocusDistanceKm: 2_400_000,
    id: "sun",
    label: "Sun",
    maxDistanceKm: 12_000_000,
    minDistanceKm: 900_000,
    parentId: null,
    radiusKm: SUN_RADIUS_KM,
    renderRadiusKm: SUN_RADIUS_KM,
    systemId: "solarSystem",
  },
  earth: {
    defaultFocusDistanceKm: 42_000,
    id: "earth",
    label: "Earth",
    maxDistanceKm: 1_000_000,
    minDistanceKm: 12_000,
    parentId: null,
    radiusKm: EARTH_RADIUS_KM,
    renderRadiusKm: EARTH_RADIUS_KM,
    systemId: "earthSystem",
  },
  moon: {
    defaultFocusDistanceKm: 12_000,
    id: "moon",
    label: "Moon",
    maxDistanceKm: 500_000,
    minDistanceKm: 4_500,
    parentId: "earth",
    radiusKm: MOON_RADIUS_KM,
    renderRadiusKm: MOON_RADIUS_KM,
    systemId: "earthSystem",
  },
  artemis2: {
    defaultFocusDistanceKm: 0.02,
    id: "artemis2",
    label: "Artemis II",
    maxDistanceKm: 500_000,
    minDistanceKm: 0.0005,
    parentId: "earth",
    radiusKm: 25,
    renderRadiusKm: 320,
    systemId: "earthSystem",
  },
  saturn: {
    defaultFocusDistanceKm: 380_000,
    id: "saturn",
    label: "Saturn",
    maxDistanceKm: CAMERA_MAX_DISTANCE_KM,
    minDistanceKm: CAMERA_MIN_DISTANCE_KM,
    parentId: null,
    radiusKm: SATURN_EQUATORIAL_RADIUS,
    renderRadiusKm: RING_OUTER_RADIUS,
    systemId: "saturnSystem",
  },
  titan: {
    defaultFocusDistanceKm: 18_000,
    id: "titan",
    label: "Titan",
    maxDistanceKm: 600_000,
    minDistanceKm: 7_000,
    parentId: "saturn",
    radiusKm: TITAN_RADIUS_KM,
    renderRadiusKm: TITAN_RADIUS_KM,
    systemId: "saturnSystem",
  },
};

export const BODY_OPTIONS = Object.fromEntries(
  Object.values(BODY_DEFINITIONS).map((body) => [body.label, body.id]),
) as Record<string, BodyId>;
