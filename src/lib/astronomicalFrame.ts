/**
 * Coordinate frame rotations for orienting sky panoramas.
 *
 * Provides quaternions to rotate panoramas from their native coordinate frame
 * (galactic or equatorial) into the scene's ecliptic Three.js world frame.
 *
 * Basis change from astronomy (Z-up) to Three.js (Y-up):
 *   astronomy +X → Three.js +X
 *   astronomy +Y → Three.js −Z
 *   astronomy +Z → Three.js +Y
 */

import { Matrix4, Quaternion } from 'three'

export type CoordinateFrame = 'galactic' | 'equatorial'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertApprox(actual: number, expected: number, label: string, tol = 1e-4): void {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(
      `astronomicalFrame: ${label} = ${actual}, expected ≈ ${expected} (tol ${tol})`
    )
  }
}

/**
 * Apply the astronomy Z-up → Three.js Y-up basis change to a 3x3 rotation
 * (given as 9 scalars in row-major order) and return a quaternion.
 *
 * B = | 1  0  0 |   astro +X → +X
 *     | 0  0  1 |   astro +Z → +Y
 *     | 0 -1  0 |   astro +Y → −Z
 *
 * M_threejs = B · R
 *   Row 0 of M = Row 0 of R
 *   Row 1 of M = Row 2 of R
 *   Row 2 of M = -Row 1 of R
 */
function astronomyToThreeJS(
  r00: number, r01: number, r02: number,
  r10: number, r11: number, r12: number,
  r20: number, r21: number, r22: number,
): Quaternion {
  const m = new Matrix4()
  m.set(
     r00,   r01,   r02,  0,
     r20,   r21,   r22,  0,
    -r10,  -r11,  -r12,  0,
       0,     0,     0,  1,
  )
  return new Quaternion().setFromRotationMatrix(m)
}

// ---------------------------------------------------------------------------
// Galactic-to-ecliptic rotation (astronomy Z-up)
// ---------------------------------------------------------------------------
//
// Columns are the galactic basis vectors in ecliptic coordinates:
//   col 0 = galactic center direction (gal. +X)
//   col 1 = galactic longitude 90° (gal. +Y)
//   col 2 = north galactic pole (gal. +Z)

const G00 = -0.054876, G01 =  0.494109, G02 = -0.867666
const G10 = -0.993821, G11 = -0.110991, G12 = -0.000346
const G20 = -0.096479, G21 =  0.862286, G22 =  0.497154

// Validation: galactic center in ecliptic ≈ (-0.0549, -0.9938, -0.0965)
assertApprox(G00, -0.0549, 'gal center ecl X', 1e-3)
assertApprox(G10, -0.9938, 'gal center ecl Y', 1e-3)
assertApprox(G20, -0.0965, 'gal center ecl Z', 1e-3)

// Validation: north galactic pole in ecliptic ≈ (-0.8677, -0.0003, 0.4972)
assertApprox(G02, -0.8677, 'NGP ecl X', 1e-3)
assertApprox(G12, -0.0003, 'NGP ecl Y', 1e-3)
assertApprox(G22,  0.4972, 'NGP ecl Z', 1e-3)

/**
 * Quaternion rotating galactic-frame directions into Three.js ecliptic world space.
 */
export const galacticToWorldQuaternion = astronomyToThreeJS(
  G00, G01, G02,
  G10, G11, G12,
  G20, G21, G22,
)

// Keep the old name as an alias for backwards compatibility in imports
export const galacticToEclipticQuaternion = galacticToWorldQuaternion

// ---------------------------------------------------------------------------
// Equatorial (ICRS) to ecliptic rotation (astronomy Z-up)
// ---------------------------------------------------------------------------
//
// Rotation around +X by obliquity ε = 23.4393°.
//
// R_eq_to_ecl = | 1,       0,        0      |
//               | 0,  cos(ε),  -sin(ε) |
//               | 0,  sin(ε),   cos(ε) |
//
// cos(23.4393°) ≈ 0.917482, sin(23.4393°) ≈ 0.397777

const cosEps = 0.917482
const sinEps = 0.397777

const E00 = 1, E01 = 0,       E02 = 0
const E10 = 0, E11 = cosEps,  E12 = -sinEps
const E20 = 0, E21 = sinEps,  E22 =  cosEps

// Validation: north celestial pole (0,0,1) in ecliptic should map to
// (0, -sin(ε), cos(ε)) = (0, -0.3978, 0.9175)
// → ecliptic latitude ≈ 66.56°
assertApprox(-sinEps, -0.3978, 'NCP ecl Y', 1e-3)
assertApprox( cosEps,  0.9175, 'NCP ecl Z', 1e-3)

/**
 * Quaternion rotating equatorial (ICRS) frame directions into Three.js ecliptic world space.
 */
export const equatorialToWorldQuaternion = astronomyToThreeJS(
  E00, E01, E02,
  E10, E11, E12,
  E20, E21, E22,
)

// ---------------------------------------------------------------------------
// Frame selector
// ---------------------------------------------------------------------------

const frameQuaternions: Record<CoordinateFrame, Quaternion> = {
  galactic: galacticToWorldQuaternion,
  equatorial: equatorialToWorldQuaternion,
}

export function quaternionForFrame(frame: CoordinateFrame): Quaternion {
  return frameQuaternions[frame]
}
