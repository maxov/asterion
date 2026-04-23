import {
  CALLISTO_RADIUS_KM,
  CAMERA_MAX_DISTANCE_KM,
  CAMERA_MIN_DISTANCE_KM,
  CERES_RADIUS_KM,
  EARTH_RADIUS_KM,
  ERIS_RADIUS_KM,
  EUROPA_RADIUS_KM,
  GANYMEDE_RADIUS_KM,
  HAUMEA_RADIUS_KM,
  IAPETUS_RADIUS_KM,
  IO_RADIUS_KM,
  JUPITER_RADIUS_KM,
  MAKEMAKE_RADIUS_KM,
  MARS_RADIUS_KM,
  MERCURY_RADIUS_KM,
  MOON_RADIUS_KM,
  NEPTUNE_RADIUS_KM,
  PHOBOS_RADIUS_KM,
  PLUTO_RADIUS_KM,
  RING_OUTER_RADIUS,
  SATURN_EQUATORIAL_RADIUS,
  SUN_RADIUS_KM,
  TITAN_RADIUS_KM,
  TRITON_RADIUS_KM,
  URANUS_RADIUS_KM,
  VENUS_RADIUS_KM,
  VESTA_RADIUS_KM,
} from "./constants.ts";

export type BodyId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "moon"
  | "mars"
  | "vesta"
  | "phobos"
  | "artemis2"
  | "ceres"
  | "jupiter"
  | "io"
  | "europa"
  | "ganymede"
  | "callisto"
  | "saturn"
  | "titan"
  | "iapetus"
  | "uranus"
  | "neptune"
  | "triton"
  | "pluto"
  | "haumea"
  | "makemake"
  | "eris";
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

function bodyDefinition(
  id: BodyId,
  label: string,
  radiusKm: number,
  {
    defaultFocusDistanceKm,
    maxDistanceKm,
    minDistanceKm,
    parentId = null,
    renderRadiusKm = radiusKm,
    systemId = "solarSystem",
  }: {
    defaultFocusDistanceKm: number;
    maxDistanceKm: number;
    minDistanceKm: number;
    parentId?: BodyId | null;
    renderRadiusKm?: number;
    systemId?: BodySystemId;
  },
): BodyDefinition {
  return {
    defaultFocusDistanceKm,
    id,
    label,
    maxDistanceKm,
    minDistanceKm,
    parentId,
    radiusKm,
    renderRadiusKm,
    systemId,
  };
}

export const BODY_DEFINITIONS: Record<BodyId, BodyDefinition> = {
  sun: bodyDefinition("sun", "Sun", SUN_RADIUS_KM, {
    defaultFocusDistanceKm: 8_000_000,
    maxDistanceKm: 12_000_000,
    minDistanceKm: 900_000,
  }),
  mercury: bodyDefinition("mercury", "Mercury", MERCURY_RADIUS_KM, {
    defaultFocusDistanceKm: 9_000,
    maxDistanceKm: 220_000,
    minDistanceKm: 3_000,
  }),
  venus: bodyDefinition("venus", "Venus", VENUS_RADIUS_KM, {
    defaultFocusDistanceKm: 22_000,
    maxDistanceKm: 350_000,
    minDistanceKm: 8_000,
  }),
  earth: bodyDefinition("earth", "Earth", EARTH_RADIUS_KM, {
    defaultFocusDistanceKm: 42_000,
    maxDistanceKm: 1_000_000,
    minDistanceKm: 12_000,
    systemId: "earthSystem",
  }),
  moon: bodyDefinition("moon", "Moon", MOON_RADIUS_KM, {
    defaultFocusDistanceKm: 12_000,
    maxDistanceKm: 500_000,
    minDistanceKm: 4_500,
    parentId: "earth",
    systemId: "earthSystem",
  }),
  mars: bodyDefinition("mars", "Mars", MARS_RADIUS_KM, {
    defaultFocusDistanceKm: 18_000,
    maxDistanceKm: 400_000,
    minDistanceKm: 6_000,
  }),
  phobos: bodyDefinition("phobos", "Phobos", PHOBOS_RADIUS_KM, {
    defaultFocusDistanceKm: 250,
    maxDistanceKm: 40_000,
    minDistanceKm: 60,
    parentId: "mars",
  }),
  vesta: bodyDefinition("vesta", "Vesta", VESTA_RADIUS_KM, {
    defaultFocusDistanceKm: 1_900,
    maxDistanceKm: 60_000,
    minDistanceKm: 650,
  }),
  ceres: bodyDefinition("ceres", "Ceres", CERES_RADIUS_KM, {
    defaultFocusDistanceKm: 2_800,
    maxDistanceKm: 80_000,
    minDistanceKm: 900,
  }),
  artemis2: bodyDefinition("artemis2", "Artemis II", 25, {
    defaultFocusDistanceKm: 1_200,
    maxDistanceKm: 500_000,
    minDistanceKm: 320,
    parentId: "earth",
    renderRadiusKm: 20,
    systemId: "earthSystem",
  }),
  jupiter: bodyDefinition("jupiter", "Jupiter", JUPITER_RADIUS_KM, {
    defaultFocusDistanceKm: 300_000,
    maxDistanceKm: 1_600_000,
    minDistanceKm: 90_000,
  }),
  io: bodyDefinition("io", "Io", IO_RADIUS_KM, {
    defaultFocusDistanceKm: 11_000,
    maxDistanceKm: 240_000,
    minDistanceKm: 3_800,
    parentId: "jupiter",
  }),
  europa: bodyDefinition("europa", "Europa", EUROPA_RADIUS_KM, {
    defaultFocusDistanceKm: 10_000,
    maxDistanceKm: 300_000,
    minDistanceKm: 3_500,
    parentId: "jupiter",
  }),
  ganymede: bodyDefinition("ganymede", "Ganymede", GANYMEDE_RADIUS_KM, {
    defaultFocusDistanceKm: 14_000,
    maxDistanceKm: 420_000,
    minDistanceKm: 4_500,
    parentId: "jupiter",
  }),
  callisto: bodyDefinition("callisto", "Callisto", CALLISTO_RADIUS_KM, {
    defaultFocusDistanceKm: 14_000,
    maxDistanceKm: 600_000,
    minDistanceKm: 4_500,
    parentId: "jupiter",
  }),
  saturn: bodyDefinition("saturn", "Saturn", SATURN_EQUATORIAL_RADIUS, {
    defaultFocusDistanceKm: 380_000,
    maxDistanceKm: CAMERA_MAX_DISTANCE_KM,
    minDistanceKm: CAMERA_MIN_DISTANCE_KM,
    renderRadiusKm: RING_OUTER_RADIUS,
    systemId: "saturnSystem",
  }),
  titan: bodyDefinition("titan", "Titan", TITAN_RADIUS_KM, {
    defaultFocusDistanceKm: 18_000,
    maxDistanceKm: 600_000,
    minDistanceKm: 7_000,
    parentId: "saturn",
    systemId: "saturnSystem",
  }),
  iapetus: bodyDefinition("iapetus", "Iapetus", IAPETUS_RADIUS_KM, {
    defaultFocusDistanceKm: 4_500,
    maxDistanceKm: 1_200_000,
    minDistanceKm: 1_500,
    parentId: "saturn",
  }),
  uranus: bodyDefinition("uranus", "Uranus", URANUS_RADIUS_KM, {
    defaultFocusDistanceKm: 120_000,
    maxDistanceKm: 900_000,
    minDistanceKm: 40_000,
  }),
  neptune: bodyDefinition("neptune", "Neptune", NEPTUNE_RADIUS_KM, {
    defaultFocusDistanceKm: 120_000,
    maxDistanceKm: 900_000,
    minDistanceKm: 40_000,
  }),
  triton: bodyDefinition("triton", "Triton", TRITON_RADIUS_KM, {
    defaultFocusDistanceKm: 8_000,
    maxDistanceKm: 240_000,
    minDistanceKm: 2_800,
    parentId: "neptune",
  }),
  pluto: bodyDefinition("pluto", "Pluto", PLUTO_RADIUS_KM, {
    defaultFocusDistanceKm: 8_000,
    maxDistanceKm: 260_000,
    minDistanceKm: 2_800,
  }),
  haumea: bodyDefinition("haumea", "Haumea", HAUMEA_RADIUS_KM, {
    defaultFocusDistanceKm: 6_000,
    maxDistanceKm: 200_000,
    minDistanceKm: 2_000,
  }),
  makemake: bodyDefinition("makemake", "Makemake", MAKEMAKE_RADIUS_KM, {
    defaultFocusDistanceKm: 5_000,
    maxDistanceKm: 180_000,
    minDistanceKm: 1_700,
  }),
  eris: bodyDefinition("eris", "Eris", ERIS_RADIUS_KM, {
    defaultFocusDistanceKm: 8_000,
    maxDistanceKm: 260_000,
    minDistanceKm: 2_800,
  }),
};

export const BODY_OPTIONS = Object.fromEntries(
  Object.values(BODY_DEFINITIONS).map((body) => [body.label, body.id]),
) as Record<string, BodyId>;
