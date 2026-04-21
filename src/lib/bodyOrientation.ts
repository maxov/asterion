import { MathUtils, Matrix4, Quaternion, Vector3 } from "three";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const JULIAN_DATE_AT_UNIX_EPOCH = 2_440_587.5;
const JULIAN_DATE_J2000 = 2_451_545.0;
const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0, 0);
const LOOK_AT_MATRIX = new Matrix4();
const ORIENTATION_MATRIX = new Matrix4();
const LOCAL_ORIGIN = new Vector3();
const EARTH_OBLIQUITY_RAD = MathUtils.degToRad(23.439281);
const EARTH_NORTH_POLE_WORLD = new Vector3(
  0,
  Math.cos(EARTH_OBLIQUITY_RAD),
  -Math.sin(EARTH_OBLIQUITY_RAD),
);
const EARTH_GREENWICH_AXIS = new Vector3();
const EARTH_WEST_AXIS = new Vector3();

function wrapAngleRad(angle: number) {
  const turn = Math.PI * 2;
  return ((angle % turn) + turn) % turn;
}

function greenwichMeanSiderealAngleRad(dateMs: number) {
  const julianDate = dateMs / DAY_MS + JULIAN_DATE_AT_UNIX_EPOCH;
  const centuriesSinceJ2000 =
    (julianDate - JULIAN_DATE_J2000) / 36_525;
  const greenwichMeanSiderealDegrees =
    280.46061837 +
    360.98564736629 * (julianDate - JULIAN_DATE_J2000) +
    0.000387933 * centuriesSinceJ2000 ** 2 -
    (centuriesSinceJ2000 ** 3) / 38_710_000;

  return wrapAngleRad(MathUtils.degToRad(greenwichMeanSiderealDegrees));
}

export function earthRotationAngleRad(dateMs: number) {
  return wrapAngleRad(-greenwichMeanSiderealAngleRad(dateMs));
}

export function setEarthQuaternion(target: Quaternion, dateMs: number) {
  const siderealAngleRad = greenwichMeanSiderealAngleRad(dateMs);
  const sinSidereal = Math.sin(siderealAngleRad);

  // Build Earth-fixed axes in the ecliptic world frame so the terminator
  // lands on the correct longitude for the current UTC instant.
  EARTH_GREENWICH_AXIS.set(
    Math.cos(siderealAngleRad),
    -sinSidereal * Math.sin(EARTH_OBLIQUITY_RAD),
    -sinSidereal * Math.cos(EARTH_OBLIQUITY_RAD),
  );
  EARTH_WEST_AXIS
    .crossVectors(EARTH_GREENWICH_AXIS, EARTH_NORTH_POLE_WORLD)
    .normalize();

  ORIENTATION_MATRIX.makeBasis(
    EARTH_GREENWICH_AXIS,
    EARTH_NORTH_POLE_WORLD,
    EARTH_WEST_AXIS,
  );
  target.setFromRotationMatrix(ORIENTATION_MATRIX);
  return target;
}

export function spinAngleFromHours(
  dateMs: number,
  rotationPeriodHours: number,
) {
  return wrapAngleRad(
    -((dateMs - J2000_UTC_MS) / (rotationPeriodHours * HOUR_MS)) *
      Math.PI *
      2,
  );
}

export function setSynchronousQuaternion(
  target: Quaternion,
  directionToParent: Vector3,
  up: Vector3,
) {
  if (directionToParent.lengthSq() <= 1e-8) {
    target.identity();
    return target;
  }

  LOOK_AT_MATRIX.lookAt(directionToParent, LOCAL_ORIGIN, up);
  target.setFromRotationMatrix(LOOK_AT_MATRIX);
  return target;
}
