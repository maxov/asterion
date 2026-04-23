import { MathUtils, Vector3 } from "three";
import {
  BODY_DEFINITIONS,
  DEFAULT_FOCUS_BODY_ID,
  type BodyDefinition,
  type BodyId,
} from "./bodies.ts";
import {
  EARTH_MOON_MASS_RATIO,
  JUPITER_AXIAL_TILT_DEG,
  MARS_AXIAL_TILT_DEG,
  NEPTUNE_AXIAL_TILT_DEG,
  SATURN_AXIAL_TILT_DEG,
} from "./constants.ts";
import {
  callistoLocalPositionKm,
  ceresHeliocentricPositionKm,
  earthBarycenterHeliocentricPositionKm,
  erisHeliocentricPositionKm,
  europaLocalPositionKm,
  ganymedeLocalPositionKm,
  haumeaHeliocentricPositionKm,
  ioLocalPositionKm,
  iapetusLocalPositionKm,
  jupiterHeliocentricPositionKm,
  makemakeHeliocentricPositionKm,
  marsHeliocentricPositionKm,
  mercuryHeliocentricPositionKm,
  moonGeocentricPositionKm,
  neptuneHeliocentricPositionKm,
  phobosLocalPositionKm,
  plutoHeliocentricPositionKm,
  saturnHeliocentricPositionKm,
  titanLocalPositionKm,
  tritonLocalPositionKm,
  uranusHeliocentricPositionKm,
  venusHeliocentricPositionKm,
  vestaHeliocentricPositionKm,
} from "./orbits.ts";

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
const AXIAL_TILT_AXIS = new Vector3(0, 0, 1);
const MOON_WORLD_OFFSET = new Vector3();
const PHOBOS_WORLD_OFFSET = new Vector3();
const IO_WORLD_OFFSET = new Vector3();
const EUROPA_WORLD_OFFSET = new Vector3();
const GANYMEDE_WORLD_OFFSET = new Vector3();
const CALLISTO_WORLD_OFFSET = new Vector3();
const TITAN_WORLD_OFFSET = new Vector3();
const IAPETUS_WORLD_OFFSET = new Vector3();
const TRITON_WORLD_OFFSET = new Vector3();
const MARS_AXIAL_TILT_RAD = MathUtils.degToRad(MARS_AXIAL_TILT_DEG);
const JUPITER_AXIAL_TILT_RAD = MathUtils.degToRad(JUPITER_AXIAL_TILT_DEG);
const SATURN_AXIAL_TILT_RAD = MathUtils.degToRad(SATURN_AXIAL_TILT_DEG);
const NEPTUNE_AXIAL_TILT_RAD = MathUtils.degToRad(NEPTUNE_AXIAL_TILT_DEG);
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

function setTiltedMoonPosition(
  child: BodySimulationState,
  parent: BodySimulationState,
  localPositionKm: Vector3,
  tiltRad: number,
  targetOffset: Vector3,
) {
  targetOffset
    .copy(localPositionKm)
    .applyAxisAngle(AXIAL_TILT_AXIS, tiltRad);
  child.positionRelativeToParentKm.copy(targetOffset);
  child.physicalPositionKm.copy(parent.physicalPositionKm).add(targetOffset);
}

export function createSolarSystemState(
  focusBodyId: BodyId = DEFAULT_FOCUS_BODY_ID,
): SolarSystemState {
  return {
    bodies: Object.fromEntries(
      BODY_IDS.map((id) => [id, createBodySimulationState(id)]),
    ) as Record<BodyId, BodySimulationState>,
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
  const mercury = bodies.mercury;
  const venus = bodies.venus;
  const earth = bodies.earth;
  const moon = bodies.moon;
  const mars = bodies.mars;
  const vesta = bodies.vesta;
  const ceres = bodies.ceres;
  const phobos = bodies.phobos;
  const artemis2 = bodies.artemis2;
  const jupiter = bodies.jupiter;
  const io = bodies.io;
  const europa = bodies.europa;
  const ganymede = bodies.ganymede;
  const callisto = bodies.callisto;
  const saturn = bodies.saturn;
  const titan = bodies.titan;
  const iapetus = bodies.iapetus;
  const uranus = bodies.uranus;
  const neptune = bodies.neptune;
  const triton = bodies.triton;
  const pluto = bodies.pluto;
  const haumea = bodies.haumea;
  const makemake = bodies.makemake;
  const eris = bodies.eris;

  state.dateMs = dateMs;
  state.focusBodyId = focusBodyId;

  sun.physicalPositionKm.set(0, 0, 0);
  sun.positionRelativeToParentKm.set(0, 0, 0);

  mercuryHeliocentricPositionKm(dateMs, mercury.physicalPositionKm);
  mercury.positionRelativeToParentKm.copy(mercury.physicalPositionKm);

  venusHeliocentricPositionKm(dateMs, venus.physicalPositionKm);
  venus.positionRelativeToParentKm.copy(venus.physicalPositionKm);

  earthBarycenterHeliocentricPositionKm(dateMs, earth.physicalPositionKm);
  moonGeocentricPositionKm(dateMs, moon.positionRelativeToParentKm);
  MOON_WORLD_OFFSET.copy(moon.positionRelativeToParentKm);
  earth.physicalPositionKm.addScaledVector(
    MOON_WORLD_OFFSET,
    -EARTH_MOON_BARYCENTER_FRACTION,
  );
  earth.positionRelativeToParentKm.copy(earth.physicalPositionKm);
  moon.physicalPositionKm.copy(earth.physicalPositionKm).add(MOON_WORLD_OFFSET);

  marsHeliocentricPositionKm(dateMs, mars.physicalPositionKm);
  mars.positionRelativeToParentKm.copy(mars.physicalPositionKm);
  vestaHeliocentricPositionKm(dateMs, vesta.physicalPositionKm);
  vesta.positionRelativeToParentKm.copy(vesta.physicalPositionKm);
  ceresHeliocentricPositionKm(dateMs, ceres.physicalPositionKm);
  ceres.positionRelativeToParentKm.copy(ceres.physicalPositionKm);
  phobosLocalPositionKm(dateMs, phobos.positionRelativeToParentKm);
  setTiltedMoonPosition(
    phobos,
    mars,
    phobos.positionRelativeToParentKm,
    MARS_AXIAL_TILT_RAD,
    PHOBOS_WORLD_OFFSET,
  );

  artemis2.physicalPositionKm.copy(earth.physicalPositionKm);
  artemis2.positionRelativeToParentKm.set(0, 0, 0);

  jupiterHeliocentricPositionKm(dateMs, jupiter.physicalPositionKm);
  jupiter.positionRelativeToParentKm.copy(jupiter.physicalPositionKm);
  ioLocalPositionKm(dateMs, io.positionRelativeToParentKm);
  setTiltedMoonPosition(
    io,
    jupiter,
    io.positionRelativeToParentKm,
    JUPITER_AXIAL_TILT_RAD,
    IO_WORLD_OFFSET,
  );
  europaLocalPositionKm(dateMs, europa.positionRelativeToParentKm);
  setTiltedMoonPosition(
    europa,
    jupiter,
    europa.positionRelativeToParentKm,
    JUPITER_AXIAL_TILT_RAD,
    EUROPA_WORLD_OFFSET,
  );
  ganymedeLocalPositionKm(dateMs, ganymede.positionRelativeToParentKm);
  setTiltedMoonPosition(
    ganymede,
    jupiter,
    ganymede.positionRelativeToParentKm,
    JUPITER_AXIAL_TILT_RAD,
    GANYMEDE_WORLD_OFFSET,
  );
  callistoLocalPositionKm(dateMs, callisto.positionRelativeToParentKm);
  setTiltedMoonPosition(
    callisto,
    jupiter,
    callisto.positionRelativeToParentKm,
    JUPITER_AXIAL_TILT_RAD,
    CALLISTO_WORLD_OFFSET,
  );

  saturnHeliocentricPositionKm(dateMs, saturn.physicalPositionKm);
  saturn.positionRelativeToParentKm.copy(saturn.physicalPositionKm);
  titanLocalPositionKm(dateMs, titan.positionRelativeToParentKm);
  setTiltedMoonPosition(
    titan,
    saturn,
    titan.positionRelativeToParentKm,
    SATURN_AXIAL_TILT_RAD,
    TITAN_WORLD_OFFSET,
  );
  iapetusLocalPositionKm(dateMs, iapetus.positionRelativeToParentKm);
  setTiltedMoonPosition(
    iapetus,
    saturn,
    iapetus.positionRelativeToParentKm,
    SATURN_AXIAL_TILT_RAD,
    IAPETUS_WORLD_OFFSET,
  );

  uranusHeliocentricPositionKm(dateMs, uranus.physicalPositionKm);
  uranus.positionRelativeToParentKm.copy(uranus.physicalPositionKm);

  neptuneHeliocentricPositionKm(dateMs, neptune.physicalPositionKm);
  neptune.positionRelativeToParentKm.copy(neptune.physicalPositionKm);
  tritonLocalPositionKm(dateMs, triton.positionRelativeToParentKm);
  setTiltedMoonPosition(
    triton,
    neptune,
    triton.positionRelativeToParentKm,
    NEPTUNE_AXIAL_TILT_RAD,
    TRITON_WORLD_OFFSET,
  );

  plutoHeliocentricPositionKm(dateMs, pluto.physicalPositionKm);
  pluto.positionRelativeToParentKm.copy(pluto.physicalPositionKm);

  haumeaHeliocentricPositionKm(dateMs, haumea.physicalPositionKm);
  haumea.positionRelativeToParentKm.copy(haumea.physicalPositionKm);

  makemakeHeliocentricPositionKm(dateMs, makemake.physicalPositionKm);
  makemake.positionRelativeToParentKm.copy(makemake.physicalPositionKm);

  erisHeliocentricPositionKm(dateMs, eris.physicalPositionKm);
  eris.positionRelativeToParentKm.copy(eris.physicalPositionKm);

  for (const bodyId of BODY_IDS) {
    updateSunDirection(bodies[bodyId]);
  }

  const focusPositionKm = bodies[focusBodyId].physicalPositionKm;
  for (const bodyId of BODY_IDS) {
    bodies[bodyId].positionRelativeToFocusKm
      .copy(bodies[bodyId].physicalPositionKm)
      .sub(focusPositionKm);
  }

  state.focusSunDirectionWorld.copy(bodies[focusBodyId].sunDirectionWorld);

  return state;
}
