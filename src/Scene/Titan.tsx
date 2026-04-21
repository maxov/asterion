import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  LineBasicMaterial,
  LineLoop,
  MathUtils,
  BufferGeometry,
  type Mesh,
  Vector3,
} from 'three'
import {
  TITAN_RADIUS_KM,
  TITAN_ORBIT_SEMIMAJOR_AXIS_KM,
  TITAN_ORBIT_INCLINATION_DEG,
  TITAN_ORBIT_ECCENTRICITY,
  TITAN_ORBIT_PERIOD_DAYS,
  TITAN_MEAN_LONGITUDE_J2000_DEG,
  TITAN_LONGITUDE_OF_PERIAPSIS_DEG,
  TITAN_LONGITUDE_OF_ASCENDING_NODE_DEG,
} from '../lib/constants.ts'
import { kmToUnits } from '../lib/units.ts'

const TITAN_RADIUS = kmToUnits(TITAN_RADIUS_KM)
const ORBIT_A = kmToUnits(TITAN_ORBIT_SEMIMAJOR_AXIS_KM)
const ORBIT_E = TITAN_ORBIT_ECCENTRICITY

const ORBIT_INCLINATION_RAD = MathUtils.degToRad(TITAN_ORBIT_INCLINATION_DEG)
const LONGITUDE_OF_NODE_RAD = MathUtils.degToRad(TITAN_LONGITUDE_OF_ASCENDING_NODE_DEG)
const LONGITUDE_OF_PERIAPSIS_RAD = MathUtils.degToRad(TITAN_LONGITUDE_OF_PERIAPSIS_DEG)
const ARGUMENT_OF_PERIAPSIS_RAD = LONGITUDE_OF_PERIAPSIS_RAD - LONGITUDE_OF_NODE_RAD

const TITAN_MEAN_MOTION_RAD_PER_DAY = (2 * Math.PI) / TITAN_ORBIT_PERIOD_DAYS
const TITAN_MEAN_LONGITUDE_J2000_RAD = MathUtils.degToRad(TITAN_MEAN_LONGITUDE_J2000_DEG)
const TITAN_MEAN_ANOMALY_J2000_RAD = TITAN_MEAN_LONGITUDE_J2000_RAD - LONGITUDE_OF_PERIAPSIS_RAD

const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0, 0)

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

function orbitalPlanePosition(trueAnomaly: number): Vector3 {
  const radius = (ORBIT_A * (1 - ORBIT_E ** 2)) / (1 + ORBIT_E * Math.cos(trueAnomaly))
  return new Vector3(radius * Math.cos(trueAnomaly), 0, radius * Math.sin(trueAnomaly))
}

function orbitalPositionWorld(trueAnomaly: number): Vector3 {
  const v = orbitalPlanePosition(trueAnomaly)
  v.applyAxisAngle(new Vector3(0, 1, 0), ARGUMENT_OF_PERIAPSIS_RAD)
  v.applyAxisAngle(new Vector3(1, 0, 0), ORBIT_INCLINATION_RAD)
  v.applyAxisAngle(new Vector3(0, 1, 0), LONGITUDE_OF_NODE_RAD)
  return v
}

function meanAnomalyAtDate(dateMs: number): number {
  const elapsedDays = (dateMs - J2000_UTC_MS) / 86_400_000
  return normalizeRadians(TITAN_MEAN_ANOMALY_J2000_RAD + TITAN_MEAN_MOTION_RAD_PER_DAY * elapsedDays)
}

function TitanOrbitPath() {
  const line = useMemo(() => {
    const segments = 720
    const points: Vector3[] = []

    for (let i = 0; i < segments; i += 1) {
      const trueAnomaly = (i / segments) * 2 * Math.PI
      points.push(orbitalPositionWorld(trueAnomaly))
    }

    const geometry = new BufferGeometry().setFromPoints(points)
    const material = new LineBasicMaterial({
      color: TITAN_ORBIT_COLOR,
      transparent: true,
      opacity: 0.55,
      toneMapped: false,
    })

    return new LineLoop(geometry, material)
  }, [])

  useEffect(() => {
    return () => {
      line.geometry.dispose()
      line.material.dispose()
    }
  }, [line])

  return <primitive object={line} />
}

function titanPositionAtDate(dateMs: number): Vector3 {
  const meanAnomaly = meanAnomalyAtDate(dateMs)
  const eccentricAnomaly = solveKepler(meanAnomaly, ORBIT_E)
  const trueAnomaly =
    2 *
    Math.atan2(
      Math.sqrt(1 + ORBIT_E) * Math.sin(eccentricAnomaly / 2),
      Math.sqrt(1 - ORBIT_E) * Math.cos(eccentricAnomaly / 2),
    )

  return orbitalPositionWorld(trueAnomaly)
}

export function Titan() {
  const meshRef = useRef<Mesh>(null)

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    mesh.position.copy(titanPositionAtDate(Date.now()))
  })

  const initialPosition = useMemo(() => titanPositionAtDate(Date.now()), [])

  return (
    <>
      <TitanOrbitPath />
      <mesh ref={meshRef} position={initialPosition}>
        <sphereGeometry args={[TITAN_RADIUS, 48, 24]} />
        <meshStandardMaterial color={TITAN_COLOR} roughness={0.9} metalness={0} />
      </mesh>
    </>
  )
}
