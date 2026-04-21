import { useRef } from 'react'
import { type Mesh, DoubleSide, Color } from 'three'
import { useControls } from 'leva'
import { RING_INNER_RADIUS, RING_OUTER_RADIUS } from '../lib/constants.ts'
import { kmToUnits } from '../lib/units.ts'

const INNER = kmToUnits(RING_INNER_RADIUS)
const OUTER = kmToUnits(RING_OUTER_RADIUS)
const FALLBACK_COLOR = new Color(0.83, 0.77, 0.63)

export function Rings() {
  const meshRef = useRef<Mesh>(null)

  const { opacity } = useControls('Rings', {
    opacity: { value: 0.7, min: 0, max: 1, step: 0.01, label: 'Opacity' },
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <ringGeometry args={[INNER, OUTER, 128]} />
      <meshStandardMaterial
        color={FALLBACK_COLOR}
        transparent
        opacity={opacity}
        side={DoubleSide}
        depthWrite={false}
        roughness={0.9}
        metalness={0.0}
      />
    </mesh>
  )
}
