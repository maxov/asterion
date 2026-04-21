// 1 scene unit = 1,000 km.
// Keeps Saturn's equatorial radius at ~60 units and the ring system
// out to ~140 units — comfortably inside float32 precision for both
// geometry and the depth buffer.
const KM_PER_UNIT = 1_000

export function kmToUnits(km: number): number {
  return km / KM_PER_UNIT
}

export function kmVecToUnits(v: [number, number, number]): [number, number, number] {
  return [v[0] / KM_PER_UNIT, v[1] / KM_PER_UNIT, v[2] / KM_PER_UNIT]
}
