import { useMemo } from 'react'
import { Vector3, Color } from 'three'
import { STAR_SPHERE_RADIUS_KM } from '../lib/constants.ts'
import { kmToUnits } from '../lib/units.ts'

const LIGHT_DISTANCE = 1000
// Place the sun disc on the star sphere so it sits at the backdrop
const SUN_DISC_DISTANCE = kmToUnits(STAR_SPHERE_RADIUS_KM) * 0.99
const SUN_DISC_RADIUS = SUN_DISC_DISTANCE * 0.004
const SUN_COLOR = new Color(0xfff5e1)
const SUN_DISC_COLOR = SUN_COLOR.clone().multiplyScalar(3)

type LightingProps = {
  direction: Vector3
  intensity: number
}

export function Lighting({ direction, intensity }: LightingProps) {
  const lightPos = useMemo(
    () => direction.clone().multiplyScalar(LIGHT_DISTANCE),
    [direction],
  )
  const discPos = useMemo(
    () => direction.clone().multiplyScalar(SUN_DISC_DISTANCE),
    [direction],
  )

  return (
    <>
      <directionalLight
        position={lightPos}
        intensity={intensity}
        color={SUN_COLOR}
      />
      <ambientLight intensity={0.005} />

      {/* Visible sun disc — emissive so it blooms */}
      <mesh position={discPos}>
        <sphereGeometry args={[SUN_DISC_RADIUS, 32, 16]} />
        <meshBasicMaterial color={SUN_DISC_COLOR} toneMapped={false} />
      </mesh>
    </>
  )
}
