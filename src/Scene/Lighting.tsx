import { useMemo } from 'react'
import { useControls } from 'leva'
import { Vector3, Color } from 'three'
import { SUN_INTENSITY, STAR_SPHERE_RADIUS_KM } from '../lib/constants.ts'
import { kmToUnits } from '../lib/units.ts'

const LIGHT_DISTANCE = 1000
// Place the sun disc on the star sphere so it sits at the backdrop
const SUN_DISC_DISTANCE = kmToUnits(STAR_SPHERE_RADIUS_KM) * 0.99
const SUN_DISC_RADIUS = SUN_DISC_DISTANCE * 0.004
const SUN_COLOR = new Color(0xfff5e1)

export function Lighting() {
  const { timeOfYear, intensity } = useControls('Sun', {
    timeOfYear: {
      value: 200,
      min: 0,
      max: 360,
      step: 1,
      label: 'Time of Year (°)',
    },
    intensity: {
      value: SUN_INTENSITY,
      min: 0,
      max: 10,
      step: 0.1,
      label: 'Intensity',
    },
  })

  const direction = useMemo(() => {
    const angle = (timeOfYear * Math.PI) / 180
    return new Vector3(Math.cos(angle), 0, Math.sin(angle))
  }, [timeOfYear])

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
        <meshBasicMaterial color={SUN_COLOR} toneMapped={false} />
      </mesh>
    </>
  )
}
