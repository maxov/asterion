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
const JULIAN_DATE_AT_UNIX_EPOCH = 2_440_587.5;

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

type FixedEpochElements = {
  argumentOfPeriapsisDeg: number;
  epochJulianDay: number;
  eccentricity: number;
  inclinationDeg: number;
  longitudeOfAscendingNodeDeg: number;
  meanAnomalyDeg: number;
  orbitalPeriodDays: number;
  semiMajorAxisAu: number;
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

const MERCURY_ELEMENTS: PlanetaryElements = {
  a0Au: 0.38709927,
  aRateAuPerCentury: 0.00000037,
  e0: 0.20563593,
  eRatePerCentury: 0.00001906,
  i0Deg: 7.00497902,
  iRateDegPerCentury: -0.00594749,
  longitudeOfNode0Deg: 48.33076593,
  longitudeOfNodeRateDegPerCentury: -0.12534081,
  longitudeOfPerihelion0Deg: 77.45779628,
  longitudeOfPerihelionRateDegPerCentury: 0.16047689,
  meanLongitude0Deg: 252.2503235,
  meanLongitudeRateDegPerCentury: 149_472.67411175,
};

const VENUS_ELEMENTS: PlanetaryElements = {
  a0Au: 0.72333566,
  aRateAuPerCentury: 0.0000039,
  e0: 0.00677672,
  eRatePerCentury: -0.00004107,
  i0Deg: 3.39467605,
  iRateDegPerCentury: -0.0007889,
  longitudeOfNode0Deg: 76.67984255,
  longitudeOfNodeRateDegPerCentury: -0.27769418,
  longitudeOfPerihelion0Deg: 131.60246718,
  longitudeOfPerihelionRateDegPerCentury: 0.00268329,
  meanLongitude0Deg: 181.9790995,
  meanLongitudeRateDegPerCentury: 58_517.81538729,
};

const MARS_ELEMENTS: PlanetaryElements = {
  a0Au: 1.52371034,
  aRateAuPerCentury: 0.00001847,
  e0: 0.0933941,
  eRatePerCentury: 0.00007882,
  i0Deg: 1.84969142,
  iRateDegPerCentury: -0.00813131,
  longitudeOfNode0Deg: 49.55953891,
  longitudeOfNodeRateDegPerCentury: -0.29257343,
  longitudeOfPerihelion0Deg: -23.94362959,
  longitudeOfPerihelionRateDegPerCentury: 0.44441088,
  meanLongitude0Deg: -4.55343205,
  meanLongitudeRateDegPerCentury: 19_140.30268499,
};

const JUPITER_ELEMENTS: PlanetaryElements = {
  a0Au: 5.202887,
  aRateAuPerCentury: -0.00011607,
  e0: 0.04838624,
  eRatePerCentury: -0.00013253,
  i0Deg: 1.30439695,
  iRateDegPerCentury: -0.00183714,
  longitudeOfNode0Deg: 100.47390909,
  longitudeOfNodeRateDegPerCentury: 0.20469106,
  longitudeOfPerihelion0Deg: 14.72847983,
  longitudeOfPerihelionRateDegPerCentury: 0.21252668,
  meanLongitude0Deg: 34.39644051,
  meanLongitudeRateDegPerCentury: 3_034.74612775,
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

const URANUS_ELEMENTS: PlanetaryElements = {
  a0Au: 19.18916464,
  aRateAuPerCentury: -0.00196176,
  e0: 0.04725744,
  eRatePerCentury: -0.00004397,
  i0Deg: 0.77263783,
  iRateDegPerCentury: -0.00242939,
  longitudeOfNode0Deg: 74.01692503,
  longitudeOfNodeRateDegPerCentury: 0.04240589,
  longitudeOfPerihelion0Deg: 170.9542763,
  longitudeOfPerihelionRateDegPerCentury: 0.40805281,
  meanLongitude0Deg: 313.23810451,
  meanLongitudeRateDegPerCentury: 428.48202785,
};

const NEPTUNE_ELEMENTS: PlanetaryElements = {
  a0Au: 30.06992276,
  aRateAuPerCentury: 0.00026291,
  e0: 0.00859048,
  eRatePerCentury: 0.00005105,
  i0Deg: 1.77004347,
  iRateDegPerCentury: 0.00035372,
  longitudeOfNode0Deg: 131.78422574,
  longitudeOfNodeRateDegPerCentury: -0.00508664,
  longitudeOfPerihelion0Deg: 44.96476227,
  longitudeOfPerihelionRateDegPerCentury: -0.32241464,
  meanLongitude0Deg: -55.12002969,
  meanLongitudeRateDegPerCentury: 218.45945325,
};

// Display-grade fixed-epoch osculating elements for major dwarf/minor planets.
// Source: JPL SBDB API standard MPC epoch values queried on 2026-04-22.
const CERES_ELEMENTS: FixedEpochElements = {
  semiMajorAxisAu: 2.77,
  eccentricity: 0.0796,
  inclinationDeg: 10.6,
  longitudeOfAscendingNodeDeg: 80.2,
  argumentOfPeriapsisDeg: 73.3,
  meanAnomalyDeg: 232,
  orbitalPeriodDays: 1_680,
  epochJulianDay: 2_461_000.5,
};

const VESTA_ELEMENTS: FixedEpochElements = {
  semiMajorAxisAu: 2.36,
  eccentricity: 0.0902,
  inclinationDeg: 7.14,
  longitudeOfAscendingNodeDeg: 104,
  argumentOfPeriapsisDeg: 152,
  meanAnomalyDeg: 26.8,
  orbitalPeriodDays: 1_330,
  epochJulianDay: 2_461_000.5,
};

const PLUTO_ELEMENTS: FixedEpochElements = {
  semiMajorAxisAu: 39.6,
  eccentricity: 0.252,
  inclinationDeg: 17.1,
  longitudeOfAscendingNodeDeg: 110,
  argumentOfPeriapsisDeg: 114,
  meanAnomalyDeg: 38.7,
  orbitalPeriodDays: 91_000,
  epochJulianDay: 2_457_588.5,
};

const HAUMEA_ELEMENTS: FixedEpochElements = {
  semiMajorAxisAu: 43,
  eccentricity: 0.196,
  inclinationDeg: 28.2,
  longitudeOfAscendingNodeDeg: 122,
  argumentOfPeriapsisDeg: 241,
  meanAnomalyDeg: 222,
  orbitalPeriodDays: 103_000,
  epochJulianDay: 2_461_000.5,
};

const MAKEMAKE_ELEMENTS: FixedEpochElements = {
  semiMajorAxisAu: 45.5,
  eccentricity: 0.16,
  inclinationDeg: 29,
  longitudeOfAscendingNodeDeg: 79.3,
  argumentOfPeriapsisDeg: 297,
  meanAnomalyDeg: 169,
  orbitalPeriodDays: 112_000,
  epochJulianDay: 2_461_000.5,
};

const ERIS_ELEMENTS: FixedEpochElements = {
  semiMajorAxisAu: 68,
  eccentricity: 0.437,
  inclinationDeg: 43.9,
  longitudeOfAscendingNodeDeg: 36,
  argumentOfPeriapsisDeg: 151,
  meanAnomalyDeg: 211,
  orbitalPeriodDays: 205_000,
  epochJulianDay: 2_461_000.5,
};

const MOON_SEMIMAJOR_AXIS_KM = 384_400;
const MOON_ECCENTRICITY = 0.0554;
const MOON_ARGUMENT_OF_PERIAPSIS_DEG = 318.15;
const MOON_MEAN_ANOMALY_J2000_DEG = 135.27;
const MOON_INCLINATION_DEG = 5.16;
const MOON_LONGITUDE_OF_ASCENDING_NODE_DEG = 125.08;
const MOON_ORBITAL_PERIOD_DAYS = 27.322;

type LocalOrbit = {
  eccentricity: number;
  inclinationDeg: number;
  longitudeOfAscendingNodeDeg: number;
  longitudeOfPeriapsisDeg: number;
  meanLongitudeJ2000Deg: number;
  orbitalPeriodDays: number;
  semiMajorAxisKm: number;
};

const PHOBOS_ORBIT: LocalOrbit = {
  semiMajorAxisKm: 9_376,
  eccentricity: 0.0151,
  inclinationDeg: 1.08,
  longitudeOfAscendingNodeDeg: 0,
  longitudeOfPeriapsisDeg: 0,
  meanLongitudeJ2000Deg: 45,
  orbitalPeriodDays: 0.31891,
};

const IO_ORBIT: LocalOrbit = {
  semiMajorAxisKm: 421_700,
  eccentricity: 0.0041,
  inclinationDeg: 0.036,
  longitudeOfAscendingNodeDeg: 0,
  longitudeOfPeriapsisDeg: 0,
  meanLongitudeJ2000Deg: 200,
  orbitalPeriodDays: 1.769138,
};

const EUROPA_ORBIT: LocalOrbit = {
  semiMajorAxisKm: 671_034,
  eccentricity: 0.0094,
  inclinationDeg: 0.466,
  longitudeOfAscendingNodeDeg: 0,
  longitudeOfPeriapsisDeg: 0,
  meanLongitudeJ2000Deg: 75,
  orbitalPeriodDays: 3.551181,
};

const GANYMEDE_ORBIT: LocalOrbit = {
  semiMajorAxisKm: 1_070_412,
  eccentricity: 0.0013,
  inclinationDeg: 0.177,
  longitudeOfAscendingNodeDeg: 0,
  longitudeOfPeriapsisDeg: 0,
  meanLongitudeJ2000Deg: 300,
  orbitalPeriodDays: 7.154553,
};

const CALLISTO_ORBIT: LocalOrbit = {
  semiMajorAxisKm: 1_882_709,
  eccentricity: 0.0074,
  inclinationDeg: 0.192,
  longitudeOfAscendingNodeDeg: 0,
  longitudeOfPeriapsisDeg: 0,
  meanLongitudeJ2000Deg: 145,
  orbitalPeriodDays: 16.689018,
};

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

const TRITON_ORBIT: LocalOrbit = {
  semiMajorAxisKm: 354_759,
  eccentricity: 0,
  inclinationDeg: 156.865,
  longitudeOfAscendingNodeDeg: 0,
  longitudeOfPeriapsisDeg: 0,
  meanLongitudeJ2000Deg: 250,
  orbitalPeriodDays: 5.876854,
};

const IAPETUS_ORBIT: LocalOrbit = {
  semiMajorAxisKm: 3_560_820,
  eccentricity: 0.0283,
  inclinationDeg: 15.47,
  longitudeOfAscendingNodeDeg: 0,
  longitudeOfPeriapsisDeg: 0,
  meanLongitudeJ2000Deg: 120,
  orbitalPeriodDays: 79.3215,
};

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

function julianDayToMs(julianDay: number) {
  return (julianDay - JULIAN_DATE_AT_UNIX_EPOCH) * DAY_MS;
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

function heliocentricFixedEpochPositionKm(
  target: Vector3,
  dateMs: number,
  elements: FixedEpochElements,
) {
  const elapsedDays = (dateMs - julianDayToMs(elements.epochJulianDay)) / DAY_MS;
  const meanMotionDegPerDay = 360 / elements.orbitalPeriodDays;
  const meanAnomalyRad = MathUtils.degToRad(
    normalizeDegrees(
      elements.meanAnomalyDeg + meanMotionDegPerDay * elapsedDays,
    ),
  );

  return positionFromOrbitalElements(
    target,
    elements.semiMajorAxisAu * AU_KM,
    elements.eccentricity,
    MathUtils.degToRad(elements.inclinationDeg),
    MathUtils.degToRad(elements.longitudeOfAscendingNodeDeg),
    MathUtils.degToRad(elements.argumentOfPeriapsisDeg),
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

export function mercuryHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricPlanetPositionKm(target, dateMs, MERCURY_ELEMENTS);
}

export function venusHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricPlanetPositionKm(target, dateMs, VENUS_ELEMENTS);
}

export function marsHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricPlanetPositionKm(target, dateMs, MARS_ELEMENTS);
}

export function vestaHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricFixedEpochPositionKm(target, dateMs, VESTA_ELEMENTS);
}

export function ceresHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricFixedEpochPositionKm(target, dateMs, CERES_ELEMENTS);
}

export function jupiterHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricPlanetPositionKm(target, dateMs, JUPITER_ELEMENTS);
}

export function saturnHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricPlanetPositionKm(target, dateMs, SATURN_ELEMENTS);
}

export function uranusHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricPlanetPositionKm(target, dateMs, URANUS_ELEMENTS);
}

export function neptuneHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricPlanetPositionKm(target, dateMs, NEPTUNE_ELEMENTS);
}

export function plutoHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricFixedEpochPositionKm(target, dateMs, PLUTO_ELEMENTS);
}

export function haumeaHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricFixedEpochPositionKm(target, dateMs, HAUMEA_ELEMENTS);
}

export function makemakeHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricFixedEpochPositionKm(target, dateMs, MAKEMAKE_ELEMENTS);
}

export function erisHeliocentricPositionKm(dateMs: number, target: Vector3) {
  return heliocentricFixedEpochPositionKm(target, dateMs, ERIS_ELEMENTS);
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

function localOrbitalPositionKm(
  dateMs: number,
  target: Vector3,
  orbit: LocalOrbit,
) {
  const meanMotionRadPerDay = (2 * Math.PI) / orbit.orbitalPeriodDays;
  const longitudeOfPeriapsisRad = MathUtils.degToRad(
    orbit.longitudeOfPeriapsisDeg,
  );
  const meanLongitudeJ2000Rad = MathUtils.degToRad(orbit.meanLongitudeJ2000Deg);
  const meanAnomaly = normalizeRadians(
    meanLongitudeJ2000Rad -
      longitudeOfPeriapsisRad +
      meanMotionRadPerDay * daysSinceJ2000(dateMs),
  );
  const eccentricAnomaly = solveKepler(meanAnomaly, orbit.eccentricity);
  const trueAnomaly =
    2 *
    Math.atan2(
      Math.sqrt(1 + orbit.eccentricity) * Math.sin(eccentricAnomaly / 2),
      Math.sqrt(1 - orbit.eccentricity) * Math.cos(eccentricAnomaly / 2),
    );
  const radius =
    (orbit.semiMajorAxisKm * (1 - orbit.eccentricity ** 2)) /
    (1 + orbit.eccentricity * Math.cos(trueAnomaly));
  const longitudeOfNodeRad = MathUtils.degToRad(
    orbit.longitudeOfAscendingNodeDeg,
  );
  const longitudeOfPeriapsisPlaneRad = MathUtils.degToRad(
    orbit.longitudeOfPeriapsisDeg,
  );
  const argumentOfPeriapsisRad =
    longitudeOfPeriapsisPlaneRad - longitudeOfNodeRad;

  target.set(radius * Math.cos(trueAnomaly), 0, radius * Math.sin(trueAnomaly));
  target.applyAxisAngle(Y_AXIS, argumentOfPeriapsisRad);
  target.applyAxisAngle(X_AXIS, MathUtils.degToRad(orbit.inclinationDeg));
  target.applyAxisAngle(Y_AXIS, longitudeOfNodeRad);

  return target;
}

export function phobosLocalPositionKm(dateMs: number, target: Vector3) {
  return localOrbitalPositionKm(dateMs, target, PHOBOS_ORBIT);
}

export function ioLocalPositionKm(dateMs: number, target: Vector3) {
  return localOrbitalPositionKm(dateMs, target, IO_ORBIT);
}

export function europaLocalPositionKm(dateMs: number, target: Vector3) {
  return localOrbitalPositionKm(dateMs, target, EUROPA_ORBIT);
}

export function ganymedeLocalPositionKm(dateMs: number, target: Vector3) {
  return localOrbitalPositionKm(dateMs, target, GANYMEDE_ORBIT);
}

export function callistoLocalPositionKm(dateMs: number, target: Vector3) {
  return localOrbitalPositionKm(dateMs, target, CALLISTO_ORBIT);
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

export function tritonLocalPositionKm(dateMs: number, target: Vector3) {
  return localOrbitalPositionKm(dateMs, target, TRITON_ORBIT);
}

export function iapetusLocalPositionKm(dateMs: number, target: Vector3) {
  return localOrbitalPositionKm(dateMs, target, IAPETUS_ORBIT);
}
