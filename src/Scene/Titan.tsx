import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { Color, Vector3 } from 'three'
import {
  TITAN_RADIUS_KM,
  TITAN_ORBIT_SEMIMAJOR_AXIS_KM,
  TITAN_ORBIT_INCLINATION_DEG,
  TITAN_ORBIT_ECCENTRICITY,
  TITAN_ORBIT_PERIOD_DAYS,
  TITAN_MEAN_LONGITUDE_J2000_DEG,
  TITAN_LONGITUDE_OF_PERIAPSIS_DEG,
} from '../lib/constants.ts'
import { kmToUnits } from '../lib/units.ts'

const TITAN_RADIUS = kmToUnits(TITAN_RADIUS_KM)
const ORBIT_A = kmToUnits(TITAN_ORBIT_SEMIMAJOR_AXIS_KM)
const ORBIT_E = TITAN_ORBIT_ECCENTRICITY
const TITAN_ORBIT_INCLINATION_RAD = (TITAN_ORBIT_INCLINATION_DEG * Math.PI) / 180
const TITAN_MEAN_MOTION_RAD_PER_DAY = (2 * Math.PI) / TITAN_ORBIT_PERIOD_DAYS

// J2000 epoch: 2000-01-01T12:00:00Z
const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0, 0)
const TITAN_MEAN_LONGITUDE_J2000_RAD = (TITAN_MEAN_LONGITUDE_J2000_DEG * Math.PI) / 180
const TITAN_LONGITUDE_OF_PERIAPSIS_RAD = (TITAN_LONGITUDE_OF_PERIAPSIS_DEG * Math.PI) / 180
const TITAN_MEAN_ANOMALY_J2000_RAD =
  TITAN_MEAN_LONGITUDE_J2000_RAD - TITAN_LONGITUDE_OF_PERIAPSIS_RAD

const TITAN_COLOR = new Color('#c8ad7f')
const TITAN_ORBIT_COLOR = new Color('#8f9bb3')

function normalizeRadians(angle: number): number {
  const twoPi = 2 * Math.PI
  return ((angle % twoPi) + twoPi) % twoPi
}

function solveKepler(meanAnomaly: number, eccentricity: number): number {
  let eccentricAnomaly = meanAnomaly
  for (let i = 0; i < 8; i += 1) {
    const f = eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly
    const fp = 1 - eccentricity * Math.cos(eccentricAnomaly)
    eccentricAnomaly -= f / fp
  }
  return eccentricAnomaly
}

function positionInOrbitalPlane(trueAnomaly: number): [number, number, number] {
  const radius = (ORBIT_A * (1 - ORBIT_E ** 2)) / (1 + ORBIT_E * Math.cos(trueAnomaly))
  return [radius * Math.cos(trueAnomaly), 0, radius * Math.sin(trueAnomaly)]
}

function TitanOrbitPath() {
  const points = useMemo(() => {
    const segments = 720
    const result: Vector3[] = []

    for (let i = 0; i <= segments; i += 1) {
      const trueAnomaly = (i / segments) * 2 * Math.PI
      const [x, y, z] = positionInOrbitalPlane(trueAnomaly)
      result.push(new Vector3(x, y, z))
    }

    return result
  }, [])

  return <Line points={points} color={TITAN_ORBIT_COLOR} transparent opacity={0.55} />
}

function titanPositionNow(): [number, number, number] {
  const elapsedDays = (Date.now() - J2000_UTC_MS) / 86_400_000
  const meanAnomaly = normalizeRadians(
    TITAN_MEAN_ANOMALY_J2000_RAD + TITAN_MEAN_MOTION_RAD_PER_DAY * elapsedDays,
  )
  const eccentricAnomaly = solveKepler(meanAnomaly, ORBIT_E)
  const trueAnomaly =
    2 *
    Math.atan2(
      Math.sqrt(1 + ORBIT_E) * Math.sin(eccentricAnomaly / 2),
      Math.sqrt(1 - ORBIT_E) * Math.cos(eccentricAnomaly / 2),
    )

  return positionInOrbitalPlane(trueAnomaly)
}

export function Titan() {
  const titanPosition = useMemo(() => titanPositionNow(), [])

  return (
    <group rotation={[0, TITAN_LONGITUDE_OF_PERIAPSIS_RAD, TITAN_ORBIT_INCLINATION_RAD]}>
      <TitanOrbitPath />

      <mesh position={titanPosition}>
        <sphereGeometry args={[TITAN_RADIUS, 48, 24]} />
        <meshStandardMaterial color={TITAN_COLOR} roughness={0.9} metalness={0} />
      </mesh>
    </group>
  )
}
