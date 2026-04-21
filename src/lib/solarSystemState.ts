import { MathUtils, Vector3 } from "three";
import {
  BODY_DEFINITIONS,
  DEFAULT_FOCUS_BODY_ID,
  type BodyDefinition,
  type BodyId,
} from "./bodies.ts";
import {
  earthBarycenterHeliocentricPositionKm,
  moonGeocentricPositionKm,
  saturnHeliocentricPositionKm,
  titanLocalPositionKm,
} from "./orbits.ts";
import {
  EARTH_MOON_MASS_RATIO,
  SATURN_AXIAL_TILT_DEG,
} from "./constants.ts";

export type BodySimulationState = {
  definition: BodyDefinition;
  id: BodyId;
  physicalPositionKm: Vector3;
  positionRelativeToFocusKm: Vector3;
  positionRelativeToParentKm: Vector3;
  sunDirectionWorld: Vector3;
};

export type SolarSystemState = {
  bodies: Record<BodyId, BodySimulationState>;
  dateMs: number;
  focusBodyId: BodyId;
  focusSunDirectionWorld: Vector3;
};

const BODY_IDS = Object.keys(BODY_DEFINITIONS) as BodyId[];
const TITAN_WORLD_OFFSET = new Vector3();
const AXIAL_TILT_AXIS = new Vector3(0, 0, 1);
const AXIAL_TILT_RAD = MathUtils.degToRad(SATURN_AXIAL_TILT_DEG);
const EARTH_MOON_BARYCENTER_FRACTION = 1 / (EARTH_MOON_MASS_RATIO + 1);

function createBodySimulationState(id: BodyId): BodySimulationState {
  return {
    definition: BODY_DEFINITIONS[id],
    id,
    physicalPositionKm: new Vector3(),
    positionRelativeToFocusKm: new Vector3(),
    positionRelativeToParentKm: new Vector3(),
    sunDirectionWorld: new Vector3(1, 0, 0),
  };
}

function updateSunDirection(body: BodySimulationState) {
  body.sunDirectionWorld.copy(body.physicalPositionKm).multiplyScalar(-1);

  if (body.sunDirectionWorld.lengthSq() <= 1e-8) {
    body.sunDirectionWorld.set(1, 0, 0);
    return;
  }

  body.sunDirectionWorld.normalize();
}

export function createSolarSystemState(
  focusBodyId: BodyId = DEFAULT_FOCUS_BODY_ID,
): SolarSystemState {
  return {
    bodies: {
      sun: createBodySimulationState("sun"),
      earth: createBodySimulationState("earth"),
      moon: createBodySimulationState("moon"),
      saturn: createBodySimulationState("saturn"),
      titan: createBodySimulationState("titan"),
    },
    dateMs: Date.now(),
    focusBodyId,
    focusSunDirectionWorld: new Vector3(1, 0, 0),
  };
}

export function updateSolarSystemState(
  state: SolarSystemState,
  dateMs: number,
  focusBodyId: BodyId,
) {
  const { bodies } = state;
  const sun = bodies.sun;
  const saturn = bodies.saturn;
  const titan = bodies.titan;
  const earth = bodies.earth;
  const moon = bodies.moon;

  state.dateMs = dateMs;
  state.focusBodyId = focusBodyId;

  sun.physicalPositionKm.set(0, 0, 0);
  sun.positionRelativeToParentKm.set(0, 0, 0);

  saturnHeliocentricPositionKm(dateMs, saturn.physicalPositionKm);
  saturn.positionRelativeToParentKm.copy(saturn.physicalPositionKm);

  titanLocalPositionKm(dateMs, titan.positionRelativeToParentKm);
  TITAN_WORLD_OFFSET
    .copy(titan.positionRelativeToParentKm)
    .applyAxisAngle(AXIAL_TILT_AXIS, AXIAL_TILT_RAD);
  titan.physicalPositionKm.copy(saturn.physicalPositionKm).add(TITAN_WORLD_OFFSET);

  earthBarycenterHeliocentricPositionKm(dateMs, earth.physicalPositionKm);
  moonGeocentricPositionKm(dateMs, moon.positionRelativeToParentKm);
  earth.physicalPositionKm.addScaledVector(
    moon.positionRelativeToParentKm,
    -EARTH_MOON_BARYCENTER_FRACTION,
  );
  earth.positionRelativeToParentKm.copy(earth.physicalPositionKm);
  moon.physicalPositionKm
    .copy(earth.physicalPositionKm)
    .add(moon.positionRelativeToParentKm);

  updateSunDirection(sun);
  updateSunDirection(saturn);
  updateSunDirection(titan);
  updateSunDirection(earth);
  updateSunDirection(moon);

  const focusPositionKm = bodies[focusBodyId].physicalPositionKm;
  for (const bodyId of BODY_IDS) {
    bodies[bodyId].positionRelativeToFocusKm
      .copy(bodies[bodyId].physicalPositionKm)
      .sub(focusPositionKm);
  }

  state.focusSunDirectionWorld.copy(bodies[focusBodyId].sunDirectionWorld);

  return state;
}
