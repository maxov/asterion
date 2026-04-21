import { MathUtils, Vector3 } from "three";
import {
  AU_KM,
  TITAN_ORBIT_ECCENTRICITY,
  TITAN_ORBIT_INCLINATION_DEG,
  TITAN_ORBIT_PERIOD_DAYS,
  TITAN_ORBIT_SEMIMAJOR_AXIS_KM,
  TITAN_MEAN_LONGITUDE_J2000_DEG,
  TITAN_LONGITUDE_OF_ASCENDING_NODE_DEG,
  TITAN_LONGITUDE_OF_PERIAPSIS_DEG,
} from "./constants.ts";

export const DAY_MS = 86_400_000;
export const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0, 0);

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);

type PlanetaryElements = {
  a0Au: number;
  aRateAuPerCentury: number;
  e0: number;
  eRatePerCentury: number;
  i0Deg: number;
  iRateDegPerCentury: number;
  longitudeOfNode0Deg: number;
  longitudeOfNodeRateDegPerCentury: number;
  longitudeOfPerihelion0Deg: number;
  longitudeOfPerihelionRateDegPerCentury: number;
  meanLongitude0Deg: number;
  meanLongitudeRateDegPerCentury: number;
};

const EARTH_BARYCENTER_ELEMENTS: PlanetaryElements = {
  a0Au: 1.00000261,
  aRateAuPerCentury: 0.00000562,
  e0: 0.01671123,
  eRatePerCentury: -0.00004392,
  i0Deg: -0.00001531,
  iRateDegPerCentury: -0.01294668,
  longitudeOfNode0Deg: 0,
  longitudeOfNodeRateDegPerCentury: 0,
  longitudeOfPerihelion0Deg: 102.93768193,
  longitudeOfPerihelionRateDegPerCentury: 0.32327364,
  meanLongitude0Deg: 100.46457166,
  meanLongitudeRateDegPerCentury: 35_999.37244981,
};

const SATURN_ELEMENTS: PlanetaryElements = {
  a0Au: 9.53667594,
  aRateAuPerCentury: -0.0012506,
  e0: 0.05386179,
  eRatePerCentury: -0.00050991,
  i0Deg: 2.48599187,
  iRateDegPerCentury: 0.00193609,
  longitudeOfNode0Deg: 113.66242448,
  longitudeOfNodeRateDegPerCentury: -0.28867794,
  longitudeOfPerihelion0Deg: 92.59887831,
  longitudeOfPerihelionRateDegPerCentury: -0.41897216,
  meanLongitude0Deg: 49.95424423,
  meanLongitudeRateDegPerCentury: 1_222.49362201,
};

const MOON_SEMIMAJOR_AXIS_KM = 384_400;
const MOON_ECCENTRICITY = 0.0554;
const MOON_ARGUMENT_OF_PERIAPSIS_DEG = 318.15;
const MOON_MEAN_ANOMALY_J2000_DEG = 135.27;
const MOON_INCLINATION_DEG = 5.16;
const MOON_LONGITUDE_OF_ASCENDING_NODE_DEG = 125.08;
const MOON_ORBITAL_PERIOD_DAYS = 27.322;

const TITAN_ORBIT_A = TITAN_ORBIT_SEMIMAJOR_AXIS_KM;
const TITAN_ORBIT_E = TITAN_ORBIT_ECCENTRICITY;
const TITAN_ORBIT_INCLINATION_RAD = MathUtils.degToRad(
  TITAN_ORBIT_INCLINATION_DEG,
);
const TITAN_LONGITUDE_OF_NODE_RAD = MathUtils.degToRad(
  TITAN_LONGITUDE_OF_ASCENDING_NODE_DEG,
);
const TITAN_LONGITUDE_OF_PERIAPSIS_RAD = MathUtils.degToRad(
  TITAN_LONGITUDE_OF_PERIAPSIS_DEG,
);
const TITAN_ARGUMENT_OF_PERIAPSIS_RAD =
  TITAN_LONGITUDE_OF_PERIAPSIS_RAD - TITAN_LONGITUDE_OF_NODE_RAD;
const TITAN_MEAN_MOTION_RAD_PER_DAY = (2 * Math.PI) / TITAN_ORBIT_PERIOD_DAYS;
const TITAN_MEAN_LONGITUDE_J2000_RAD = MathUtils.degToRad(
  TITAN_MEAN_LONGITUDE_J2000_DEG,
);
const TITAN_MEAN_ANOMALY_J2000_RAD =
  TITAN_MEAN_LONGITUDE_J2000_RAD - TITAN_LONGITUDE_OF_PERIAPSIS_RAD;

function normalizeDegrees(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function normalizeRadians(angle: number) {
  const fullTurn = Math.PI * 2;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

export function solveKepler(meanAnomaly: number, eccentricity: number): number {
  let eccentricAnomaly = meanAnomaly;

  for (let i = 0; i < 8; i += 1) {
    const f =
      eccentricAnomaly -
      eccentricity * Math.sin(eccentricAnomaly) -
      meanAnomaly;
    const fp = 1 - eccentricity * Math.cos(eccentricAnomaly);
    eccentricAnomaly -= f / fp;
  }

  return eccentricAnomaly;
}

function centuriesSinceJ2000(dateMs: number) {
  return (dateMs - J2000_UTC_MS) / (DAY_MS * 36_525);
}

function daysSinceJ2000(dateMs: number) {
  return (dateMs - J2000_UTC_MS) / DAY_MS;
}

function setWorldFromEcliptic(
  target: Vector3,
  xEcliptic: number,
  yEcliptic: number,
  zEcliptic: number,
) {
  return target.set(xEcliptic, zEcliptic, -yEcliptic);
}

function positionFromOrbitalElements(
  target: Vector3,
  semiMajorAxisKm: number,
  eccentricity: number,
  inclinationRad: number,
  longitudeOfNodeRad: number,
  argumentOfPeriapsisRad: number,
  meanAnomalyRad: number,
) {
  const eccentricAnomaly = solveKepler(meanAnomalyRad, eccentricity);
  const xOrbital = semiMajorAxisKm * (Math.cos(eccentricAnomaly) - eccentricity);
  const yOrbital =
    semiMajorAxisKm *
    Math.sqrt(1 - eccentricity * eccentricity) *
    Math.sin(eccentricAnomaly);

  const cosNode = Math.cos(longitudeOfNodeRad);
  const sinNode = Math.sin(longitudeOfNodeRad);
  const cosInclination = Math.cos(inclinationRad);
  const sinInclination = Math.sin(inclinationRad);
  const cosArgument = Math.cos(argumentOfPeriapsisRad);
  const sinArgument = Math.sin(argumentOfPeriapsisRad);

  const xEcliptic =
    (cosArgument * cosNode - sinArgument * sinNode * cosInclination) *
      xOrbital +
    (-sinArgument * cosNode - cosArgument * sinNode * cosInclination) *
      yOrbital;
  const yEcliptic =
    (cosArgument * sinNode + sinArgument * cosNode * cosInclination) *
      xOrbital +
    (-sinArgument * sinNode + cosArgument * cosNode * cosInclination) *
      yOrbital;
  const zEcliptic =
    sinArgument * sinInclination * xOrbital +
    cosArgument * sinInclination * yOrbital;

  return setWorldFromEcliptic(target, xEcliptic, yEcliptic, zEcliptic);
}

function heliocentricPlanetPositionKm(
  target: Vector3,
  dateMs: number,
  elements: PlanetaryElements,
) {
  const centuries = centuriesSinceJ2000(dateMs);
  const semiMajorAxisKm =
    (elements.a0Au + elements.aRateAuPerCentury * centuries) * AU_KM;
  const eccentricity = elements.e0 + elements.eRatePerCentury * centuries;
  const inclinationRad = MathUtils.degToRad(
    elements.i0Deg + elements.iRateDegPerCentury * centuries,
  );
  const meanLongitudeDeg =
    elements.meanLongitude0Deg +
    elements.meanLongitudeRateDegPerCentury * centuries;
  const longitudeOfPerihelionDeg =
    elements.longitudeOfPerihelion0Deg +
    elements.longitudeOfPerihelionRateDegPerCentury * centuries;
  const longitudeOfNodeRad = MathUtils.degToRad(
    normalizeDegrees(
      elements.longitudeOfNode0Deg +
        elements.longitudeOfNodeRateDegPerCentury * centuries,
    ),
  );
  const argumentOfPeriapsisRad = MathUtils.degToRad(
    normalizeDegrees(
      longitudeOfPerihelionDeg -
        (elements.longitudeOfNode0Deg +
          elements.longitudeOfNodeRateDegPerCentury * centuries),
    ),
  );
  const meanAnomalyRad = MathUtils.degToRad(
    normalizeDegrees(meanLongitudeDeg - longitudeOfPerihelionDeg),
  );

  return positionFromOrbitalElements(
    target,
    semiMajorAxisKm,
    eccentricity,
    inclinationRad,
    longitudeOfNodeRad,
    argumentOfPeriapsisRad,
    meanAnomalyRad,
  );
}

export function earthBarycenterHeliocentricPositionKm(
  dateMs: number,
  target: Vector3,
) {
  return heliocentricPlanetPositionKm(
    target,
    dateMs,
    EARTH_BARYCENTER_ELEMENTS,
  );
}

export function saturnHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricPlanetPositionKm(target, dateMs, SATURN_ELEMENTS);
}

export function moonGeocentricPositionKm(dateMs: number, target: Vector3) {
  const meanMotionDegPerDay = 360 / MOON_ORBITAL_PERIOD_DAYS;
  const meanAnomalyRad = MathUtils.degToRad(
    normalizeDegrees(
      MOON_MEAN_ANOMALY_J2000_DEG + meanMotionDegPerDay * daysSinceJ2000(dateMs),
    ),
  );

  return positionFromOrbitalElements(
    target,
    MOON_SEMIMAJOR_AXIS_KM,
    MOON_ECCENTRICITY,
    MathUtils.degToRad(MOON_INCLINATION_DEG),
    MathUtils.degToRad(MOON_LONGITUDE_OF_ASCENDING_NODE_DEG),
    MathUtils.degToRad(MOON_ARGUMENT_OF_PERIAPSIS_DEG),
    meanAnomalyRad,
  );
}

export function titanLocalPositionKm(dateMs: number, target: Vector3) {
  const elapsedDays = daysSinceJ2000(dateMs);
  const meanAnomaly = normalizeRadians(
    TITAN_MEAN_ANOMALY_J2000_RAD + TITAN_MEAN_MOTION_RAD_PER_DAY * elapsedDays,
  );
  const eccentricAnomaly = solveKepler(meanAnomaly, TITAN_ORBIT_E);
  const trueAnomaly =
    2 *
    Math.atan2(
      Math.sqrt(1 + TITAN_ORBIT_E) * Math.sin(eccentricAnomaly / 2),
      Math.sqrt(1 - TITAN_ORBIT_E) * Math.cos(eccentricAnomaly / 2),
    );
  const radius =
    (TITAN_ORBIT_A * (1 - TITAN_ORBIT_E ** 2)) /
    (1 + TITAN_ORBIT_E * Math.cos(trueAnomaly));

  target.set(radius * Math.cos(trueAnomaly), 0, radius * Math.sin(trueAnomaly));
  target.applyAxisAngle(Y_AXIS, TITAN_ARGUMENT_OF_PERIAPSIS_RAD);
  target.applyAxisAngle(X_AXIS, TITAN_ORBIT_INCLINATION_RAD);
  target.applyAxisAngle(Y_AXIS, TITAN_LONGITUDE_OF_NODE_RAD);

  return target;
}
