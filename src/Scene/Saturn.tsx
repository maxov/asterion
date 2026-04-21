import { useRef } from 'react'
import { type Mesh, Color } from 'three'
import {
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
} from '../lib/constants.ts'
import { kmToUnits } from '../lib/units.ts'

const EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS)
const POLAR_SCALE = SATURN_POLAR_RADIUS / SATURN_EQUATORIAL_RADIUS
const FALLBACK_COLOR = new Color(0.76, 0.63, 0.35)

export function Saturn() {
  const meshRef = useRef<Mesh>(null)

  return (
    <mesh ref={meshRef} scale={[1, POLAR_SCALE, 1]}>
      <sphereGeometry args={[EQUATORIAL, 128, 64]} />
      <meshStandardMaterial
        color={FALLBACK_COLOR}
        roughness={0.85}
        metalness={0.0}
      />
    </mesh>
  )
}
